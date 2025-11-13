try {
    require('dotenv').config();
    const express = require('express');
    const path = require('path');
    const fs = require('fs');
    const { v4: uuidv4 } = require('uuid');
    const ytdlp = require('yt-dlp-exec');
    const { exec } = require('child_process');
    const ffmpeg = require('ffmpeg-static');
    const axios = require('axios');

    const app = express();
    const PORT = process.env.PORT || 5002;
    const API_KEY = process.env.API_KEY;
    const BASE_URL = process.env.BASE_URL;

    // --- Setup Directories ---
    const DOWNLOAD_DIR = path.join(__dirname, 'public_downloads');
    if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR);
    app.use('/downloads', express.static(DOWNLOAD_DIR));

    const TEMP_DIR = path.join(__dirname, 'temp_processing');
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

    app.use(express.json());

    // --- Simple API Key Authentication ---
    const apiKeyMiddleware = (req, res, next) => {
        const providedKey = req.headers['x-api-key'];
        if (!API_KEY || providedKey !== API_KEY) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        next();
    };

    // --- Custom Job Queue ---
    const jobQueue = [];
    const jobStatus = {};
    let activeJobs = 0;
    const MAX_CONCURRENT_JOBS = 2;

    async function processQueue() {
        if (activeJobs >= MAX_CONCURRENT_JOBS || jobQueue.length === 0) {
            return;
        }

        activeJobs++;
        const task = jobQueue.shift();

        try {
            jobStatus[task.jobId] = { status: 'processing' };
            const result = await processDownload(task.url, task.quality, task.type);
            jobStatus[task.jobId] = { status: 'completed', url: result.url };
        } catch (error) {
            jobStatus[task.jobId] = { status: 'failed', error: 'Processing failed.' };
        } finally {
            activeJobs--;
            processQueue(); // Process next item
        }
    }

    // --- Caching & Cleanup ---
    const cache = {}; // In-memory cache
    setInterval(() => {
        const now = Date.now();
        for (const key in cache) {
            if (now - cache[key].timestamp > 60 * 60 * 1000) { // 1 hour
                const filePath = path.join(DOWNLOAD_DIR, cache[key].filename);
                console.log(`Cache expired. Deleting file: ${filePath}`);
                fs.unlink(filePath, (err) => {
                    if (err) console.error(`Error deleting cached file: ${err}`);
                });
                delete cache[key];
            }
        }
    }, 5 * 60 * 1000); // Check every 5 minutes

    // --- Processing Logic (Your full logic from before) ---
    async function processDownload(url, quality, type) {
        const cacheKey = `${url}|${quality}|${type}`;
        if (cache[cacheKey]) {
            console.log(`[Cache HIT] Returning cached file for: ${url}`);
            const fullUrl = `${BASE_URL}/downloads/${cache[cacheKey].filename}`;
            return { url: fullUrl };
        }
        console.log(`[Cache MISS] Starting new download for: ${url}`);

        const requestDir = path.join(TEMP_DIR, uuidv4());
        fs.mkdirSync(requestDir);
        const cleanup = () => fs.rm(requestDir, { recursive: true, force: true }, () => {});

        try {
            let videoUrl, audioUrl, title, ext;
            const commonYtdlpOptions = {
                noCheckCertificate: true,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                referer: 'https://www.google.com/',
            };

            if (type === 'mp3') {
                const output = await ytdlp.exec(url, { ...commonYtdlpOptions, getUrl: true, format: 'bestaudio/best', getTitle: true });
                const lines = String(output).trim().split('\n');
                title = lines[0].replace(/[<>:"/\\|?*]/g, '_');
                ext = 'mp3';
                audioUrl = lines.find(line => line.startsWith('http'));
            } else {
                const titleOutput = await ytdlp.exec(url, { ...commonYtdlpOptions, getTitle: true });
                title = String(titleOutput).trim().replace(/[<>:"/\\|?*]/g, '_');
                ext = 'mp4';

                const videoOutput = await ytdlp.exec(url, { ...commonYtdlpOptions, getUrl: true, format: `bestvideo[height<=${parseInt(quality)}]/bestvideo` });
                videoUrl = String(videoOutput).trim().split('\n').find(line => line.startsWith('http'));

                const audioOutput = await ytdlp.exec(url, { ...commonYtdlpOptions, getUrl: true, format: 'bestaudio/best' });
                audioUrl = String(audioOutput).trim().split('\n').find(line => line.startsWith('http'));
            }

            if ((!videoUrl && type === 'mp4') || !audioUrl) {
                throw new Error('Could not retrieve valid media URLs.');
            }

            const audioPath = path.join(requestDir, `audio_source`);
            const audioStream = await axios({ method: 'get', url: audioUrl, responseType: 'stream' });
            const audioWriter = fs.createWriteStream(audioPath);
            audioStream.data.pipe(audioWriter);
            await new Promise((resolve, reject) => {
                audioWriter.on('finish', resolve);
                audioWriter.on('error', reject);
            });

            let finalFilename = `${title}.${ext}`;
            const finalFilepath = path.join(DOWNLOAD_DIR, finalFilename);

            if (type === 'mp3') {
                await new Promise((resolve, reject) => {
                    const command = `"${ffmpeg}" -i "${audioPath}" -b:a ${quality}k "${finalFilepath}"`;
                    exec(command, (err) => err ? reject(err) : resolve());
                });
            } else {
                const videoPath = path.join(requestDir, `video_source`);
                const videoStream = await axios({ method: 'get', url: videoUrl, responseType: 'stream' });
                const videoWriter = fs.createWriteStream(videoPath);
                videoStream.data.pipe(videoWriter);
                await new Promise((resolve, reject) => {
                    videoWriter.on('finish', resolve);
                    videoWriter.on('error', reject);
                });

                await new Promise((resolve, reject) => {
                    const command = `"${ffmpeg}" -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac "${finalFilepath}"`;
                    exec(command, (err) => err ? reject(err) : resolve());
                });
            }

            cache[cacheKey] = { filename: finalFilename, timestamp: Date.now() };
            cleanup();
            const fullUrl = `${BASE_URL}/downloads/${finalFilename}`;
            return { url: fullUrl };
        } catch (error) {
            cleanup();
            console.error(`Processing failed for ${url}:`, JSON.stringify(error, null, 2));
            throw error;
        }
    }


    // --- API Endpoints ---
    app.post('/start-download', apiKeyMiddleware, (req, res) => {
        const { url, quality, type } = req.body;
        if (!url || !quality || !type) return res.status(400).json({ error: 'Missing parameters' });

        // Check cache before queueing
        const cacheKey = `${url}|${quality}|${type}`;
        if (cache[cacheKey]) {
            const fullUrl = `${BASE_URL}/downloads/${cache[cacheKey].filename}`;
            return res.json({ jobId: null, status: 'completed', url: fullUrl });
        }

        const jobId = uuidv4();
        jobStatus[jobId] = { status: 'queued' };

        jobQueue.push({ jobId, url, quality, type });
        processQueue(); // Start processing if not already active

        res.json({ jobId });
    });

    app.get('/status/:jobId', apiKeyMiddleware, (req, res) => {
        const { jobId } = req.params;
        const status = jobStatus[jobId];
        if (!status) return res.status(404).json({ error: 'Job not found' });
        if (status.status === 'completed' || status.status === 'failed') {
             setTimeout(() => delete jobStatus[jobId], 5 * 60 * 1000);
        }
        res.json(status);
    });

    // --- Server Startup ---
    app.listen(PORT, () => {
        console.log(`VPS Backend is running on http://localhost:${PORT}`);
    });

} catch (e) {
    console.error("Fatal error during server initialization:", e);
}
