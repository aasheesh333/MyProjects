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
        headers: {
            'User-Agent': USER_AGENT,
            'Referer': 'https://www.tiktok.com/'
        }
    });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

export async function downloadTikTok(job) {
    const { url, type, jobId } = job;
    const browser = await getBrowser();
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    const jobFolder = path.join(DOWNLOAD_DIR, jobId);
    fs.mkdirSync(jobFolder, { recursive: true });

    try {
        await page.goto(url, { waitUntil: 'networkidle' });

        const videoSelector = 'video[src]';
        await page.waitForSelector(videoSelector, { timeout: 15000 });

        const videoUrl = await page.getAttribute(videoSelector, 'src');

        if (!videoUrl) {
            throw new Error('Could not find the TikTok video URL. The video may be private or removed.');
        }

        if (type === 'mp4') {
            const fileName = 'video.mp4';
            await downloadFile(videoUrl, jobFolder, fileName);
            return `/downloads/${jobId}/${fileName}`;
        } else if (type === 'mp3') {
            const tempVideoPath = path.join(jobFolder, 'temp_video.mp4');
            await downloadFile(videoUrl, jobFolder, 'temp_video.mp4');
            const mp3FileName = 'audio.mp3';
            const mp3Path = path.join(jobFolder, mp3FileName);
            await convertToMp3(tempVideoPath, mp3Path);
            fs.unlinkSync(tempVideoPath);
            return `/downloads/${jobId}/${mp3FileName}`;
        } else {
            throw new Error(`Unsupported type for TikTok: ${type}`);
        }

    } finally {
        await context.close();
    }
}
