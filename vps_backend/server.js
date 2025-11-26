try {
    require('dotenv').config();
    const express = require('express');
    const path = require('path');
    const fs = require('fs');
    const { v4: uuidv4 } = require('uuid');
    const ytdlp = require('yt-dlp-exec');
    const axios = require('axios');
    const archiver = require('archiver');

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
            jobStatus[task.jobId] = { status: 'failed', error: 'Processing failed.' };
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

    // --- Filename Formatting Helper ---
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

    // --- Core Processing Logic ---
    async function processDownload({ url, quality, type, platform }) {
        const cacheKey = `${url}|${quality}|${type}`;
        if (cache[cacheKey]) {
            return { url: `${BASE_URL}/downloads/${cache[cacheKey].filename}` };
        }

        const requestDir = path.join(TEMP_DIR, uuidv4());
        fs.mkdirSync(requestDir);
        const cleanup = () => fs.rm(requestDir, { recursive: true, force: true }, () => {});

        const commonYtdlpOptions = {
            noCheckCertificate: true,
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            referer: 'https://www.instagram.com/',
        };

        if (platform === 'instagram') {
            commonYtdlpOptions.extractorArgs = 'instagram:api_type=ios';
        }

        let metadata;
        try {
            metadata = await ytdlp(url, { ...commonYtdlpOptions, dumpSingleJson: true });
        } catch (error) {
            const stderr = error.stderr || '';
            if (stderr.includes('There is no video in this post')) {
                const imageUrl = `${url.split('?')[0]}/media/?size=l`;
                const rawTitle = `instagram_${uuidv4()}`;
                const baseFilename = formatFilename({ title: rawTitle, type: 'Image', quality: null });
                const finalFilename = `${baseFilename}.jpg`;
                const finalFilepath = path.join(DOWNLOAD_DIR, finalFilename);

                try {
                    const response = await axios({ url: imageUrl, responseType: 'stream' });
                    const writer = fs.createWriteStream(finalFilepath);
                    response.data.pipe(writer);
                    await new Promise((resolve, reject) => {
                        writer.on('finish', resolve);
                        writer.on('error', reject);
                    });
                    cache[cacheKey] = { filename: finalFilename, timestamp: Date.now() };
                    cleanup();
                    return { url: `${BASE_URL}/downloads/${finalFilename}` };
                } catch (axiosError) {
                    cleanup();
                    console.error(`Direct image download failed for ${imageUrl}:`, axiosError);
                    throw axiosError;
                }
            } else {
                cleanup();
                console.error(`Metadata fetch failed for ${url}:`, error);
                throw error;
            }
        }

        try {
            const rawTitle = metadata.title;
            let finalFilename;

            if (metadata.entries) { // Carousel/Gallery Logic
                const baseFilename = formatFilename({ title: rawTitle, type: 'Gallery', quality: null });
                finalFilename = `${baseFilename}.zip`;
                const zipFilePath = path.join(DOWNLOAD_DIR, finalFilename);
                const output = fs.createWriteStream(zipFilePath);
                const archive = archiver('zip', { zlib: { level: 9 } });
                archive.pipe(output);
                for (let i = 0; i < metadata.entries.length; i++) {
                    const entry = metadata.entries[i];
                    let mediaUrl = entry.url || entry.thumbnail;
                    if (!mediaUrl && entry.formats && entry.formats.length > 0) {
                        const preferredFormat = entry.formats.find(f => f.format_id === 'best') || entry.formats[entry.formats.length - 1];
                        mediaUrl = preferredFormat.url;
                    }
                    if (!mediaUrl) {
                        console.warn(`[Carousel] Could not find a downloadable URL for entry ${i} in ${url}. Skipping.`);
                        continue;
                    }
                    const fileResponse = await axios({ url: mediaUrl, responseType: 'stream' });
                    const extension = path.extname(new URL(mediaUrl).pathname) || '.jpg';
                    archive.append(fileResponse.data, { name: `${rawTitle}_${i + 1}${extension}` });
                }
                await archive.finalize();
            } else if (type === 'image') {
                const imageUrl = metadata.thumbnail || metadata.url;
                if (!imageUrl) throw new Error('Could not find image URL.');
                const extension = path.extname(new URL(imageUrl).pathname) || '.jpg';
                const baseFilename = formatFilename({ title: rawTitle, type: 'Image', quality: null });
                finalFilename = `${baseFilename}${extension}`;
                const finalFilepath = path.join(DOWNLOAD_DIR, finalFilename);
                const response = await axios({ url: imageUrl, responseType: 'stream' });
                const writer = fs.createWriteStream(finalFilepath);
                response.data.pipe(writer);
                await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });
            } else if (type === 'mp3') {
                const baseFilename = formatFilename({ title: rawTitle, type: 'MP3', quality: quality });
                finalFilename = `${baseFilename}.mp3`;
                const finalFilepath = path.join(DOWNLOAD_DIR, finalFilename);
                await ytdlp.exec(url, { ...commonYtdlpOptions, extractAudio: true, audioFormat: 'mp3', audioQuality: `${quality}K`, format: 'bestaudio/best', output: finalFilepath });
            } else { // MP4 logic
                const baseFilename = formatFilename({ title: rawTitle, type: 'MP4', quality: quality });
                finalFilename = `${baseFilename}.mp4`;
                const finalFilepath = path.join(DOWNLOAD_DIR, finalFilename);
                const formatSelector = `bestvideo[height<=${parseInt(quality)}][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best`;
                await ytdlp.exec(url, { ...commonYtdlpOptions, format: formatSelector, output: finalFilepath, recodeVideo: 'mp4' });
            }

            cache[cacheKey] = { filename: finalFilename, timestamp: Date.now() };
            cleanup();
            return { url: `${BASE_URL}/downloads/${finalFilename}` };

        } catch (error) {
            cleanup();
            console.error(`Processing failed for ${url}:`, error);
            throw error;
        }
    }

    // --- API Endpoints ---
    app.post('/api/download', apiKeyMiddleware, (req, res) => {
        const { url, quality, type, platform } = req.body;
        if (!url || !quality || !type || !platform) return res.status(400).json({ error: 'Missing parameters' });

        const cacheKey = `${url}|${quality}|${type}`;
        if (cache[cacheKey]) {
            return res.json({ jobId: null, status: 'completed', url: `${BASE_URL}/downloads/${cache[cacheKey].filename}` });
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
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`VPS Backend is running on http://0.0.0.0:${PORT}`);
    });

} catch (e) {
    console.error("Fatal error during server initialization:", e);
}
