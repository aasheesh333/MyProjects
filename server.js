require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const ytdlp = require('yt-dlp-exec');
const axios = require('axios');
const { exec } = require('child_process');
const ffmpeg = require('ffmpeg-static');

const app = express();
const PORT = process.env.PORT || 5001;

// --- Setup Temporary Directory ---
const TEMP_DIR = path.join(__dirname, 'temp_downloads');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR);
}

app.use(express.json());
app.use(express.static(__dirname));
app.use('/static', express.static(path.join(__dirname, 'static')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Universal Download Endpoint ---
app.post('/api/download', async (req, res) => {
    const { url, quality, type } = req.body;
    if (!url || !quality || !type) {
        return res.status(400).json({ error: 'URL, quality, and type are required' });
    }

    const requestDir = path.join(TEMP_DIR, uuidv4());
    fs.mkdirSync(requestDir);

    const cleanup = () => {
        if (fs.existsSync(requestDir)) {
            fs.rm(requestDir, { recursive: true, force: true }, () => {});
        }
    };

    try {
        const proxy = process.env.PROXY_URL;
        if (!proxy) {
            console.warn('PROXY_URL environment variable not set. Downloads may be unreliable.');
        }

        let videoUrl, audioUrl, title, ext;

        // Step 1: Get Video and Audio URLs using yt-dlp and proxy
        console.log('Fetching media URLs with yt-dlp...');
        if (type === 'mp3') {
            const mp3Output = await ytdlp.exec(url, {
                proxy,
                getUrl: true,
                format: 'bestaudio/best',
                getTitle: true,
                output: '%(title)s.%(ext)s'
            });
            const lines = String(mp3Output).trim().split('\n');
            title = lines[0];
            ext = 'mp3'; // We will enforce this
            audioUrl = lines.find(line => line.startsWith('http'));
        } else {
            // Get title
            const titleOutput = await ytdlp.exec(url, { proxy, getTitle: true });
            title = String(titleOutput).trim().replace(/[<>:"/\\|?*]/g, '_'); // Sanitize title for filename
            ext = 'mp4'; // We will enforce this

            // Get video URL
            console.log(`Fetching video URL for quality: ${quality}p`);
            const videoOutput = await ytdlp.exec(url, {
                proxy,
                getUrl: true,
                format: `bestvideo[height<=${parseInt(quality)}]/bestvideo`,
            });
            videoUrl = String(videoOutput).trim().split('\n').find(line => line.startsWith('http'));

            // Get audio URL
            console.log('Fetching audio URL...');
            const audioOutput = await ytdlp.exec(url, {
                proxy,
                getUrl: true,
                format: 'bestaudio/best',
            });
            audioUrl = String(audioOutput).trim().split('\n').find(line => line.startsWith('http'));
        }
        console.log('Successfully fetched media URLs.');

        if ((!videoUrl && type === 'mp4') || !audioUrl) {
             throw new Error('Could not retrieve valid media URLs. The content might be private or region-locked.');
        }

        // Step 2: Download files from URLs (without proxy)
        const audioPath = path.join(requestDir, `audio_source`);
        console.log('Downloading audio stream...');
        const audioStream = await axios({ method: 'get', url: audioUrl, responseType: 'stream' });
        const audioWriter = fs.createWriteStream(audioPath);
        audioStream.data.pipe(audioWriter);
        await new Promise((resolve, reject) => {
            audioWriter.on('finish', resolve);
            audioWriter.on('error', (err) => reject(new Error(`Failed to download audio file: ${err.message}`)));
        });
        console.log('Audio download complete.');

        let finalFilepath;

        if (type === 'mp3') {
            finalFilepath = path.join(requestDir, `${title}.${ext}`);
            console.log('Converting to MP3...');
            await new Promise((resolve, reject) => {
                const ffmpegCommand = `"${ffmpeg}" -i "${audioPath}" -q:a ${quality === '320' ? 0 : 2} "${finalFilepath}"`;
                exec(ffmpegCommand, (error, stdout, stderr) => {
                    if (error) {
                        console.error('FFMPEG MP3 Stderr:', stderr);
                        return reject(new Error(`FFmpeg error (MP3 conversion): ${stderr}`));
                    }
                    resolve();
                });
            });
            console.log('MP3 conversion complete.');
        } else {
            const videoPath = path.join(requestDir, `video_source`);
            console.log('Downloading video stream...');
            const videoStream = await axios({ method: 'get', url: videoUrl, responseType: 'stream' });
            const videoWriter = fs.createWriteStream(videoPath);
            videoStream.data.pipe(videoWriter);
            await new Promise((resolve, reject) => {
                videoWriter.on('finish', resolve);
                videoWriter.on('error', (err) => reject(new Error(`Failed to download video file: ${err.message}`)));
            });
            console.log('Video download complete.');

            // Step 3: Merge files with ffmpeg
            finalFilepath = path.join(requestDir, `${title}.${ext}`);
            console.log('Merging video and audio with ffmpeg...');
            await new Promise((resolve, reject) => {
                const ffmpegCommand = `"${ffmpeg}" -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac "${finalFilepath}"`;
                exec(ffmpegCommand, (error, stdout, stderr) => {
                     if (error) {
                        console.error('FFMPEG Merge Stderr:', stderr);
                        return reject(new Error(`FFmpeg error (merge): ${stderr}`));
                    }
                     resolve();
                });
            });
            console.log('Merge complete.');
        }

        // Step 4: Send the file to the user
        console.log(`Sending final file: ${finalFilepath}`);
        res.download(finalFilepath, path.basename(finalFilepath), (err) => {
            if (err) console.error('Error sending file to user:', err);
            cleanup();
        });

    } catch (error) {
        console.error('Processing error:', error.message);
        console.error('yt-dlp stderr:', error.stderr);
        cleanup();

        const errString = error.stderr || error.toString();
        if (errString.includes('429')) {
             res.status(429).json({ error: 'Our server is being rate-limited by the content provider. Please try again later.' });
        } else {
             res.status(500).json({ error: error.message || 'An unexpected error occurred processing your request.' });
        }
    }
});


// --- Server Startup ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
