import path from 'path';
import fs from 'fs';
import { Innertube } from 'youtubei.js';
import { DOWNLOAD_DIR } from '../server.js';
import { convertToMp3 } from '../ffmpeg_converter.js';

export async function downloadYouTube(job) {
    const { url, type, quality = '720p', jobId } = job;
    const jobFolder = path.join(DOWNLOAD_DIR, jobId);
    fs.mkdirSync(jobFolder, { recursive: true });

    try {
        const youtube = await Innertube.create();
        const video = await youtube.getInfo(url);

        if (type === 'mp3') {
            const stream = await video.download({
                type: 'audio',
                quality: 'best',
                format: 'mp4'
            });

            const tempFilePath = path.join(jobFolder, 'temp_audio.mp4');
            const finalFilePath = path.join(jobFolder, `${video.basic_info.title}.mp3`);

            const fileStream = fs.createWriteStream(tempFilePath);
            for await (const chunk of stream) {
                fileStream.write(chunk);
            }
            fileStream.end();

            await new Promise((resolve, reject) => {
                fileStream.on('finish', resolve);
                fileStream.on('error', reject);
            });

            await convertToMp3(tempFilePath, finalFilePath);
            fs.unlinkSync(tempFilePath); // Clean up temp file
            return `/downloads/${jobId}/${path.basename(finalFilePath)}`;

        } else if (type === 'mp4') {
            const format = video.formats.find(f =>
                f.quality_label === quality && f.has_audio && f.has_video
            ) || video.formats.find(f => f.has_audio && f.has_video);

            if (!format) {
                throw new Error(`Could not find a suitable format for quality '${quality}'.`);
            }

            const stream = await video.download({ format });
            const finalFileName = `${video.basic_info.title}.mp4`;
            const finalFilePath = path.join(jobFolder, finalFileName);

            const fileStream = fs.createWriteStream(finalFilePath);
            for await (const chunk of stream) {
                fileStream.write(chunk);
            }
            fileStream.end();

            await new Promise((resolve, reject) => {
                fileStream.on('finish', resolve);
                fileStream.on('error', reject);
            });

            return `/downloads/${jobId}/${finalFileName}`;
        } else {
            throw new Error(`Unsupported type for YouTube: ${type}`);
        }
    } catch (error) {
        console.error('YouTube download failed:', error.message);
        throw new Error(`YouTube download failed: ${error.message}`);
    }
}
