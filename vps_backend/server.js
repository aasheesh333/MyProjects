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
    const archiver = require('archiver'); // For creating ZIP files

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
            // Pass the entire task object to processDownload
            const result = await processDownload(task);
            jobStatus[task.jobId] = { status: 'completed', url: result.url };
        } catch (error) {
            console.error(`[Job ${task.jobId}] Processing failed:`, error.message);
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

    // --- NEW: Multi-Platform Processing Logic ---
    async function processDownload({ url, quality, type, platform }) {
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

        const commonYtdlpOptions = {
            noCheckCertificate: true,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            referer: 'https://www.google.com/',
        };

        try {
            // Step 1: Get metadata to determine content type (single video, gallery, etc.)
            const metadata = await ytdlp(url, { ...commonYtdlpOptions, dumpSingleJson: true });
            const title = (metadata.title || `download_${uuidv4()}`).replace(/[<>:"/\\|?*]/g, '_');

            // --- Gallery/Playlist Logic (e.g., Instagram multiple images) ---
            if (metadata.entries && (type === 'image' || type === 'mp4')) {
                console.log(`[Processing] Detected gallery with ${metadata.entries.length} items.`);
                const zipFileName = `${title}.zip`;
                const zipFilePath = path.join(DOWNLOAD_DIR, zipFileName);
                const output = fs.createWriteStream(zipFilePath);
                const archive = archiver('zip', { zlib: { level: 9 } });

                archive.pipe(output);

                for (let i = 0; i < metadata.entries.length; i++) {
                    const entry = metadata.entries[i];
                    const mediaUrl = entry.url;
                    if (!mediaUrl) continue;

                    const fileResponse = await axios({ url: mediaUrl, responseType: 'stream' });
                    // Determine extension from URL or use a default
                    const extension = path.extname(new URL(mediaUrl).pathname) || '.jpg';
                    archive.append(fileResponse.data, { name: `${title}_${i + 1}${extension}` });
                }

                await archive.finalize();

                cache[cacheKey] = { filename: zipFileName, timestamp: Date.now() };
                cleanup();
                const fullUrl = `${BASE_URL}/downloads/${zipFileName}`;
                return { url: fullUrl };
            }

            // --- Single Video/Audio Logic ---
            let finalFilename;
            const finalFilepath = path.join(DOWNLOAD_DIR, `${title}.${type === 'mp3' ? 'mp3' : 'mp4'}`);

            if (type === 'mp3') {
                const audioUrl = metadata.url || (await ytdlp.exec(url, { ...commonYtdlpOptions, getUrl: true, format: 'bestaudio/best' })).stdout.trim().split('\n')[0];
                if (!audioUrl) throw new Error('Could not retrieve valid audio URL.');

                const audioPath = path.join(requestDir, `audio_source`);
                const audioStream = await axios({ method: 'get', url: audioUrl, responseType: 'stream' });
                const audioWriter = fs.createWriteStream(audioPath);
                audioStream.data.pipe(audioWriter);
                await new Promise((resolve, reject) => {
                    audioWriter.on('finish', resolve); audioWriter.on('error', reject);
                });

                await new Promise((resolve, reject) => {
                    const command = `"${ffmpeg}" -i "${audioPath}" -b:a ${quality}k "${finalFilepath}"`;
                    exec(command, (err) => err ? reject(err) : resolve());
                });
                finalFilename = `${title}.mp3`;

            } else { // MP4 logic
                const formatSelector = `bestvideo[height<=${parseInt(quality)}][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best`;
                // We will use yt-dlp to download and merge directly
                await ytdlp.exec(url, {
                    ...commonYtdlpOptions,
                    format: formatSelector,
                    output: finalFilepath,
                    // Recode to ensure compatibility if direct copy isn't mp4
                    recodeVideo: 'mp4'
                });
                finalFilename = `${title}.mp4`;
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
        // Add platform to the request body
        const { url, quality, type, platform } = req.body;
        if (!url || !quality || !type || !platform) return res.status(400).json({ error: 'Missing parameters' });

        const cacheKey = `${url}|${quality}|${type}`;
        if (cache[cacheKey]) {
            const fullUrl = `${BASE_URL}/downloads/${cache[cacheKey].filename}`;
            return res.json({ jobId: null, status: 'completed', url: fullUrl });
        }

        const jobId = uuidv4();
        jobStatus[jobId] = { status: 'queued' };

        // Pass the whole object to the queue
        jobQueue.push({ jobId, url, quality, type, platform });
        processQueue();

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
