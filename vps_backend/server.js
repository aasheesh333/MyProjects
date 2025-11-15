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

    // --- NEW: Filename Formatting Helper ---
    function formatFilename({ title, type, quality }) {
        const safeTitle = (title || `download_${uuidv4()}`)
            .replace(/[<>:"/\\|?*]/g, '_') // Sanitize illegal characters
            .substring(0, 50); // Truncate to 50 chars to prevent length errors

        let qualityString = '';
        if (type === 'mp3') {
            qualityString = `${quality}kbps`;
        } else if (type === 'mp4') {
            qualityString = `${quality}p`;
        }

        const typeString = type.toUpperCase();

        // Omit quality for image/zip
        const finalTitle = qualityString ?
            `JusDown - ${safeTitle} - ${typeString} | ${qualityString}` :
            `JusDown - ${safeTitle} - ${typeString}`;

        return finalTitle;
    }

    // --- NEW: Custom Pinterest Image Extractor ---
    async function extractPinterestImageUrl(pageUrl) {
        try {
            const { data: html } = await axios.get(pageUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            const match = html.match(/"image":"([^"]+)"/);
            if (match && match[1]) {
                return match[1];
            }
            throw new Error('Could not find image URL in Pinterest page metadata.');
        } catch (error) {
            console.error(`[Pinterest Extractor] Failed to extract image from ${pageUrl}:`, error.message);
            throw new Error('Pinterest image extraction failed.');
        }
    }


    // --- Core Processing Logic ---
    async function processDownload({ url, quality, type, platform }) {
        const cacheKey = `${url}|${quality}|${type}`;
        if (cache[cacheKey]) {
            console.log(`[Cache HIT] Returning for: ${url}`);
            const finalUrl = (BASE_URL && BASE_URL.startsWith('https'))
                ? `${BASE_URL}/downloads/${cache[cacheKey].filename}`
                : `/downloads/${cache[cacheKey].filename}`;
            return { url: finalUrl };
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

        let metadata;
        try {
            metadata = await ytdlp(url, { ...commonYtdlpOptions, dumpSingleJson: true });
        } catch (error) {
            const stderr = error.stderr || '';
            const isNoVideoError = stderr.includes('No video formats found') || stderr.includes('There is no video in this post');

            if (type === 'image' && isNoVideoError) {
                console.log(`[Image Fallback] No video found for ${url}. Fetching thumbnail as image.`);
                try {
                    const titleOutput = await ytdlp.exec(url, { ...commonYtdlpOptions, getTitle: true });
                    const thumbnailOutput = await ytdlp.exec(url, { ...commonYtdlpOptions, getThumbnail: true });

                    metadata = {
                        title: titleOutput.stdout.trim(),
                        thumbnail: thumbnailOutput.stdout.trim(),
                    };
                } catch (fallbackError) {
                    cleanup();
                    console.error(`[Image Fallback] FAILED for ${url}:`, JSON.stringify(fallbackError, null, 2));
                    throw fallbackError;
                }
            } else {
                cleanup();
                console.error(`Processing failed for ${url}:`, JSON.stringify(error, null, 2));
                throw error;
            }
        }

        try {
            if (platform === 'pinterest' && type === 'image') {
                const imageUrl = await extractPinterestImageUrl(url);
                const rawTitle = `Pinterest Image by JusDown`;
                const extension = path.extname(new URL(imageUrl).pathname) || '.jpg';
                const baseFilename = formatFilename({ title: rawTitle, type: 'Image', quality: null });
                const finalFilename = `${baseFilename}${extension}`;
                const finalFilepath = path.join(DOWNLOAD_DIR, finalFilename);

                const response = await axios({ url: imageUrl, responseType: 'stream' });
                const writer = fs.createWriteStream(finalFilepath);
                response.data.pipe(writer);
                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve);
                    writer.on('error', reject);
                });

                cache[cacheKey] = { filename: finalFilename, timestamp: Date.now() };
                cleanup();
                const finalUrl = (BASE_URL && BASE_URL.startsWith('https'))
                    ? `${BASE_URL}/downloads/${finalFilename}`
                    : `/downloads/${finalFilename}`;
                return { url: finalUrl };
            }

            const rawTitle = metadata.title;
            let finalFilename;

            if (metadata.entries && (type === 'image' || type === 'mp4')) {
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
                    const fileResponse = await axios({ url: mediaUrl, responseType: 'stream' });
                    const extension = path.extname(new URL(mediaUrl).pathname) || '.jpg';
                    archive.append(fileResponse.data, { name: `${rawTitle}_${i + 1}${extension}` });
                }
                await archive.finalize();
            }
            else if (type === 'image') {
                const imageUrl = metadata.thumbnail || metadata.url;
                if (!imageUrl) throw new Error('Could not find image URL.');
                const extension = path.extname(new URL(imageUrl).pathname) || '.jpg';
                const baseFilename = formatFilename({ title: rawTitle, type: 'Image', quality: null });
                finalFilename = `${baseFilename}${extension}`;
                const finalFilepath = path.join(DOWNLOAD_DIR, finalFilename);
                const response = await axios({ url: imageUrl, responseType: 'stream' });
                const writer = fs.createWriteStream(finalFilepath);
                response.data.pipe(writer);
                await new Promise((resolve, reject) => {
                    writer.on('finish', resolve); writer.on('error', reject);
                });
            }
            else {
                if (type === 'mp3') {
                    const baseFilename = formatFilename({ title: rawTitle, type: 'MP3', quality: quality });
                    finalFilename = `${baseFilename}.mp3`;
                    const finalFilepath = path.join(DOWNLOAD_DIR, finalFilename);
                    const audioUrl = metadata.url || (await ytdlp.exec(url, { ...commonYtdlpOptions, getUrl: true, format: 'bestaudio/best' })).stdout.trim().split('\n')[0];
                    if (!audioUrl) throw new Error('Could not retrieve valid audio URL.');
                    const audioPath = path.join(requestDir, `audio_source`);
                    const audioStream = await axios({ method: 'get', url: audioUrl, responseType: 'stream' });
                    const audioWriter = fs.createWriteStream(audioPath);
                    audioStream.data.pipe(audioWriter);
                    await new Promise((resolve, reject) => { audioWriter.on('finish', resolve); audioWriter.on('error', reject); });
                    await new Promise((resolve, reject) => {
                        exec(`"${ffmpeg}" -i "${audioPath}" -b:a ${quality}k "${finalFilepath}"`, (err) => err ? reject(err) : resolve());
                    });
                } else { // MP4 logic
                    const baseFilename = formatFilename({ title: rawTitle, type: 'MP4', quality: quality });
                    finalFilename = `${baseFilename}.mp4`;
                    const finalFilepath = path.join(DOWNLOAD_DIR, finalFilename);
                    const formatSelector = `bestvideo[height<=${parseInt(quality)}][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best`;
                    await ytdlp.exec(url, { ...commonYtdlpOptions, format: formatSelector, output: finalFilepath, recodeVideo: 'mp4' });
                }
            }

            cache[cacheKey] = { filename: finalFilename, timestamp: Date.now() };
            cleanup();
            const finalUrl = (BASE_URL && BASE_URL.startsWith('https'))
                ? `${BASE_URL}/downloads/${finalFilename}`
                : `/downloads/${finalFilename}`;
            return { url: finalUrl };

        } catch (error) {
            cleanup();
            console.error(`Post-metadata processing failed for ${url}:`, JSON.stringify(error, null, 2));
            throw error;
        }
    }

    // --- API Endpoints ---
    app.post('/start-download', apiKeyMiddleware, (req, res) => {
        const { url, quality, type, platform } = req.body;
        if (!url || !quality || !type || !platform) return res.status(400).json({ error: 'Missing parameters' });

        const cacheKey = `${url}|${quality}|${type}`;
        if (cache[cacheKey]) {
            const finalUrl = (BASE_URL && BASE_URL.startsWith('https'))
                ? `${BASE_URL}/downloads/${cache[cacheKey].filename}`
                : `/downloads/${cache[cacheKey].filename}`;
            return res.json({ jobId: null, status: 'completed', url: finalUrl });
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
