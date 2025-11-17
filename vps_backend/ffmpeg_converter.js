import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';

ffmpeg.setFfmpegPath(ffmpegStatic);

/**
 * Converts a video file to MP3 format.
 * @param {string} inputPath - The path to the input video file.
 * @param {string} outputPath - The path to save the output MP3 file.
 * @returns {Promise<void>}
 */
export const convertToMp3 = (inputPath, outputPath) => {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .audioBitrate('128k')
            .toFormat('mp3')
            .on('end', () => {
                // Clean up the temporary input file
                fs.unlink(inputPath, (err) => {
                    if (err) console.error('Error deleting temp file:', err);
                });
                resolve();
            })
            .on('error', (err) => {
                console.error('ffmpeg error:', err);
                // Clean up the temporary input file on error
                fs.unlink(inputPath, () => {});
                reject(new Error('Failed to convert file to MP3.'));
            })
            .save(outputPath);
    });
};
