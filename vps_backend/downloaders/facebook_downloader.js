import path from 'path';
import fs from 'fs';
import axios from 'axios';
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

export async function downloadFacebook(job) {
    const { url, type, jobId } = job;
    const browser = await getBrowser();
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    const jobFolder = path.join(DOWNLOAD_DIR, jobId);
    fs.mkdirSync(jobFolder, { recursive: true });

    try {
        let videoUrl = null;
        let imageUrl = null;

        page.on('response', async (response) => {
            const reqUrl = response.url();
            if (reqUrl.includes('video.fsub6-1.fna.fbcdn.net')) { // This CDN seems common for video
                 videoUrl = reqUrl;
            }
            if (reqUrl.includes('scontent.fsub6-1.fna.fbcdn.net') && response.request().resourceType() === 'image') {
                 imageUrl = reqUrl;
            }
        });

        await page.goto(url, { waitUntil: 'networkidle' });

        await page.waitForTimeout(5000);

        if (!videoUrl && !imageUrl) {
            throw new Error('No video or image found. The content may be private or require a login.');
        }

        if (type === 'mp4' && videoUrl) {
            const fileName = 'video.mp4';
            await downloadFile(videoUrl, jobFolder, fileName);
            return `/downloads/${jobId}/${fileName}`;
        } else if (type === 'mp3' && videoUrl) {
            const tempVideoPath = path.join(jobFolder, 'temp_video.mp4');
            await downloadFile(videoUrl, jobFolder, 'temp_video.mp4');
            const mp3FileName = 'audio.mp3';
            const mp3Path = path.join(jobFolder, mp3FileName);
            await convertToMp3(tempVideoPath, mp3Path);
            fs.unlinkSync(tempVideoPath);
            return `/downloads/${jobId}/${mp3FileName}`;
        } else if (type === 'image' && imageUrl) {
            const fileName = 'image.jpg';
            await downloadFile(imageUrl, jobFolder, fileName);
            return `/downloads/${jobId}/${fileName}`;
        } else {
             throw new Error(`Could not find suitable content for the requested type '${type}'.`);
        }

    } finally {
        await context.close();
    }
}
