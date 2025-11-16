try {
    require('dotenv').config();
    const express = require('express');
    const path = require('path');
    const fs = require('fs');
    const { v4: uuidv4 } = require('uuid');
    const ytdlpExec = require('yt-dlp-exec');
    const { exec } = require('child_process');
    const ffmpeg = require('ffmpeg-static');
    const axios = require('axios');
    const archiver = require('archiver');

    // --- FINAL Correct wrapper to force use of system yt-dlp binary ---
    const ytdlp = (url, args = {}) => {
      return ytdlpExec(url, {
        ...args,
        binaryPath: "/usr/local/bin/yt-dlp",
      });
    };
    ytdlp.exec = (url, args = {}) => {
        return ytdlpExec.exec(url, {
          ...args,
          binaryPath: "/usr/local/bin/yt-dlp",
        });
    };

    const app = express();
    const PORT = process.env.PORT || 5002;
    const API_KEY = process.env.API_KEY;
    const BASE_URL = process.env.BASE_URL;

    // --- Setup Directories & Force Download Middleware ---
    const DOWNLOAD_DIR = path.join(__dirname, 'public_downloads');
    if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR);

    app.use('/downloads', (req, res, next) => {
        res.setHeader('Content-Disposition', 'attachment');
        express.static(DOWNLOAD_DIR)(req, res, next);
    });

    const TEMP_DIR = path.join(__dirname, 'temp_processing');
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

    app.use(express.json());

    // --- API Key Middleware ---
    const apiKeyMiddleware = (req, res, next) => {
        const providedKey = req.headers['x-api-key'];
        if (!API_KEY || providedKey !== API_KEY) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        next();
    };

    // --- Job Queue ---
    const jobQueue = [];
    const jobStatus = {};
    let activeJobs = 0;
    const MAX_CONCURRENT_JOBS = 2;

    async function processQueue() {
        if (activeJobs >= MAX_CONCURRENT_JOBS || jobQueue.length === 0) return;
        activeJobs++;
        const task = jobQueue.shift();
        try {
            jobStatus[task.jobId] = { status: 'processing' };
            const result = await processDownload(task);
            jobStatus[task.jobId] = { status: 'completed', url: result.url };
        } catch (error) {
            console.error(`[Job ${task.jobId}] Processing failed:`, error.message);
            const stderr = String(error.stderr || '').toLowerCase();
            let userError = 'Processing failed. Please try a different link.';
            if (stderr.includes('login required') || stderr.includes('registered users') || stderr.includes('account credentials')) {
                userError = 'This content is private or requires a login to access.';
            } else if(error.message.includes('No downloadable media found')) {
                userError = error.message;
            }
            jobStatus[task.jobId] = { status: 'failed', error: userError };
        } finally {
            activeJobs--;
            processQueue();
        }
    }

    // --- Caching & Cleanup ---
    const cache = {};
    setInterval(() => {
        const now = Date.now();
        for (const key in cache) {
            if (now - cache[key].timestamp > 60 * 60 * 1000) {
                const filePath = path.join(DOWNLOAD_DIR, cache[key].filename);
                fs.unlink(filePath, (err) => {
                    if (err) console.error(`Error deleting cached file: ${err}`);
                });
                delete cache[key];
            }
        }
    }, 5 * 60 * 1000);

    function formatFilename({ title, type, quality }) {
        const safeTitle = (title || `download_${uuidv4()}`)
            .replace(/[<>:"/\\|?*]/g, '_')
            .substring(0, 50);

        let qualityString = '';
        if (type === 'mp3') {
            qualityString = `${quality}kbps`;
        } else if (type === 'mp4') {
            qualityString = `${quality}p`;
        }

        const typeString = type.toUpperCase();

        const finalTitle = qualityString ?
            `JusDown - ${safeTitle} - ${typeString} | ${qualityString}` :
            `JusDown - ${safeTitle} - ${typeString}`;

        return finalTitle;
    }

    // --- FINAL, REWRITTEN & RELIABLE CORE LOGIC ---
    async function processDownload({ url, quality, type, platform }) {
        const cacheKey = `${url}|${quality}|${type}`;
        if (cache[cacheKey]) {
            console.log(`[Cache HIT] Returning for: ${url}`);
            const cachedUrl = new URL(path.join('downloads', cache[cacheKey].filename), BASE_URL).toString();
            return { url: cachedUrl };
        }
        console.log(`[Cache MISS] Starting new download for: ${url}`);

        const commonYtdlpOptions = {
            noCheckCertificate: true,
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            referer: 'https://www.google.com/',
        };

        // 1. Get Metadata first
        const metadata = await ytdlp(url, {
            ...commonYtdlpOptions,
            dumpSingleJson: true,
            ignoreErrors: true,
        });

        if (!metadata || Object.keys(metadata).length === 0) {
            throw new Error('Could not retrieve any media information from the link.');
        }

        const rawTitle = metadata.title || `download_${uuidv4()}`;
        let finalFilename;

        // 2. Handle download based on type, letting yt-dlp do all the heavy work
        if (metadata.entries) {
            const baseFilename = formatFilename({ title: rawTitle, type: 'Gallery', quality: null });
            finalFilename = `${baseFilename}.zip`;
            const zipFilePath = path.join(DOWNLOAD_DIR, finalFilename);
            const output = fs.createWriteStream(zipFilePath);
            const archive = archiver('zip', { zlib: { level: 9 } });
            archive.pipe(output);
            for (let i = 0; i < metadata.entries.length; i++) {
                const entry = metadata.entries[i];
                const mediaUrl = entry.url || entry.formats?.find(f => f.url)?.url;
                if (!mediaUrl) continue;
                try {
                    const fileResponse = await axios({ url: mediaUrl, responseType: 'stream' });
                    const extension = path.extname(new URL(mediaUrl).pathname) || (entry.acodec !== 'none' ? '.mp3' : '.jpg');
                    archive.append(fileResponse.data, { name: `${rawTitle}_${i + 1}${extension}` });
                } catch (e) {
                    console.error(`Skipping gallery entry ${i+1} due to error:`, e.message);
                }
            }
            await archive.finalize();
        } else if (type === 'image') {
            const imageUrl = metadata.thumbnail;
            if (!imageUrl) throw new Error('No downloadable image found.');

            const extension = path.extname(new URL(imageUrl).pathname) || '.jpg';
            const baseFilename = formatFilename({ title: rawTitle, type: 'Image', quality: null });
            finalFilename = `${baseFilename}${extension}`;
            const finalFilepath = path.join(DOWNLOAD_DIR, finalFilename);

            const response = await axios({ url: imageUrl, responseType: 'stream' });
            const writer = fs.createWriteStream(finalFilepath);
            response.data.pipe(writer);
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

        } else if (type === 'mp3') {
            const baseFilename = formatFilename({ title: rawTitle, type: 'MP3', quality: quality });
            finalFilename = `${baseFilename}.mp3`;
            const finalFilepath = path.join(DOWNLOAD_DIR, finalFilename);

            await ytdlp.exec(url, {
                ...commonYtdlpOptions,
                extractAudio: true,
                audioFormat: 'mp3',
                audioQuality: 0, // 0 is best
                output: finalFilepath,
            });

        } else if (type === 'mp4') {
            const baseFilename = formatFilename({ title: rawTitle, type: 'MP4', quality: quality });
            finalFilename = `${baseFilename}.mp4`;
            const finalFilepath = path.join(DOWNLOAD_DIR, finalFilename);

            await ytdlp.exec(url, {
                ...commonYtdlpOptions,
                format: `bestvideo[height<=${parseInt(quality)}]+bestaudio/best[height<=${parseInt(quality)}]/best`,
                output: finalFilepath,
                recodeVideo: 'mp4' // Ensure final container is mp4
            });
        } else {
             throw new Error(`Unsupported content type: ${type}`);
        }

        // 3. Cache and return the absolute URL
        cache[cacheKey] = { filename: finalFilename, timestamp: Date.now() };
        const finalUrl = new URL(path.join('downloads', finalFilename), BASE_URL).toString();
        return { url: finalUrl };
    }


    // --- API Endpoints ---
    app.post('/start-download', apiKeyMiddleware, (req, res) => {
        const { url, quality, type, platform } = req.body;
        if (!url || !quality || !type || !platform) return res.status(400).json({ error: 'Missing parameters' });

        const cacheKey = `${url}|${quality}|${type}`;
        if (cache[cacheKey]) {
            const cachedUrl = new URL(path.join('downloads', cache[cacheKey].filename), BASE_URL).toString();
            return res.json({ jobId: null, status: 'completed', url: cachedUrl });
        }

        const jobId = uuidv4();
        jobStatus[jobId] = { status: 'queued' };
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
