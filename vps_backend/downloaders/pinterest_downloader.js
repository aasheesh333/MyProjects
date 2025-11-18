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
        headers: { 'User-Agent': USER_AGENT, 'Referer': 'https://www.pinterest.com/' }
    });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

export async function downloadPinterest(job) {
    const { url, type, jobId } = job;
    const browser = await getBrowser();
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    const jobFolder = path.join(DOWNLOAD_DIR, jobId);
    fs.mkdirSync(jobFolder, { recursive: true });

    try {
        await page.goto(url, { waitUntil: 'networkidle' });

        // Wait for the main media element to be loaded
        const videoSelector = 'video[src]';
        const imageSelector = 'img[src]';

        await page.waitForSelector(`${videoSelector}, ${imageSelector}`, { timeout: 10000 });

        let mediaUrl;
        const videoEl = await page.$(videoSelector);
        if (videoEl) {
            mediaUrl = await videoEl.getAttribute('src');
        } else {
            const imgEl = await page.$(imageSelector);
            if(imgEl) {
                 // Pinterest often has multiple images, we take the main one which is usually the largest.
                const allImages = await page.$$eval(imageSelector, imgs => imgs.map(img => ({ src: img.src, width: img.width, height: img.height })));
                mediaUrl = allImages.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0].src;
            }
        }

        if (!mediaUrl) {
            throw new Error('Could not find media URL. The pin might be protected or of an unsupported type.');
        }

        const isVideo = mediaUrl.includes('.mp4') || (videoEl != null);

        if (type === 'mp4' && isVideo) {
            const fileName = 'video.mp4';
            await downloadFile(mediaUrl, jobFolder, fileName);
            return `/downloads/${jobId}/${fileName}`;
        } else if (type === 'mp3' && isVideo) {
            const tempVideoPath = path.join(jobFolder, 'temp_video.mp4');
            await downloadFile(mediaUrl, jobFolder, 'temp_video.mp4');
            const mp3FileName = 'audio.mp3';
            const mp3Path = path.join(jobFolder, mp3FileName);
            await convertToMp3(tempVideoPath, mp3Path);
            fs.unlinkSync(tempVideoPath);
            return `/downloads/${jobId}/${mp3FileName}`;
        } else if (type === 'image' && !isVideo) {
            const extension = new URL(mediaUrl).pathname.split('.').pop() || 'jpg';
            const fileName = `image.${extension}`;
            await downloadFile(mediaUrl, jobFolder, fileName);
            return `/downloads/${jobId}/${fileName}`;
        } else {
            throw new Error(`The requested type '${type}' is not available for this Pinterest pin.`);
        }

    } finally {
        await context.close();
    }
}
