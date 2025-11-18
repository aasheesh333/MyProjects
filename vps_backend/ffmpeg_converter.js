import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

// Point fluent-ffmpeg to the installed ffmpeg executable
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/**
 * Converts a video file to an MP3 file.
 * @param {string} inputPath - The full path to the input video file.
 * @param {string} outputPath - The full path where the output MP3 file will be saved.
 * @returns {Promise<void>} - A promise that resolves when the conversion is complete.
 */
export function convertToMp3(inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .noVideo() // Remove the video stream
            .audioCodec('libmp3lame') // Use the LAME MP3 codec
            .audioBitrate('128k') // Set bitrate to 128kbps
            .on('end', () => {
                console.log(`[FFmpeg] Successfully converted ${inputPath} to MP3.`);
                resolve();
            })
            .on('error', (err) => {
                console.error(`[FFmpeg] Error converting ${inputPath}:`, err.message);
                reject(new Error(`FFmpeg conversion failed: ${err.message}`));
            })
            .save(outputPath);
    });
}
