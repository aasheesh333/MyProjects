import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import archiver from 'archiver';
import { getBrowser } from '../playwright_engine.js';
import { DOWNLOAD_DIR } from '../server.js';
import { convertToMp3 } from '../ffmpeg_converter.js';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36';

async function downloadFile(url, folder, fileName) {
    const filePath = path.join(folder, fileName);
    const writer = fs.createWriteStream(filePath);
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        headers: { 'User-Agent': USER_AGENT }
    });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

export async function downloadInstagram(job) {
    const { url, type, jobId } = job;
    const browser = await getBrowser();
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    const jobFolder = path.join(DOWNLOAD_DIR, jobId);
    fs.mkdirSync(jobFolder, { recursive: true });

    try {
        const mediaUrls = new Set();
        page.on('response', async (response) => {
            const req = response.request();
            if (req.resourceType() === 'image' || req.resourceType() === 'media') {
                const url = response.url();
                if (url.includes('scontent')) {
                    mediaUrls.add(url);
                }
            }
        });

        await page.goto(url, { waitUntil: 'networkidle' });

        await page.waitForTimeout(3000); // Wait for dynamic content

        if (mediaUrls.size === 0) {
            throw new Error('No media found. The post might be private, deleted, or require a login.');
        }

        const downloadedFiles = [];
        let finalFileName;

        if (type === 'image' || type === 'mp4') {
            let i = 0;
            for (const mediaUrl of mediaUrls) {
                const extension = new URL(mediaUrl).pathname.split('.').pop().split('?')[0] || 'jpg';
                const fileName = `media_${i++}.${extension}`;
                await downloadFile(mediaUrl, jobFolder, fileName);
                downloadedFiles.push(fileName);
            }
        } else if (type === 'mp3') {
             const videoUrl = Array.from(mediaUrls).find(u => u.includes('.mp4'));
             if (!videoUrl) throw new Error('No video found to convert to MP3.');
             const tempVideoPath = path.join(jobFolder, 'temp_video.mp4');
             await downloadFile(videoUrl, jobFolder, 'temp_video.mp4');
             const mp3FileName = 'audio.mp3';
             const mp3Path = path.join(jobFolder, mp3FileName);
             await convertToMp3(tempVideoPath, mp3Path);
             downloadedFiles.push(mp3FileName);
             fs.unlinkSync(tempVideoPath);
        }

        if (downloadedFiles.length > 1) {
            const zipPath = path.join(jobFolder, 'instagram_gallery.zip');
            const output = fs.createWriteStream(zipPath);
            const archive = archiver('zip', { zlib: { level: 9 } });
            archive.pipe(output);
            for (const file of downloadedFiles) {
                archive.file(path.join(jobFolder, file), { name: file });
            }
            await archive.finalize();
            finalFileName = 'instagram_gallery.zip';
        } else if (downloadedFiles.length === 1) {
            finalFileName = downloadedFiles[0];
        } else {
            throw new Error('Could not download any files.');
        }

       return `/downloads/${jobId}/${finalFileName}`;

    } finally {
        await context.close();
    }
}
