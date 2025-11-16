try {
    require('dotenv').config();
    const express = require('express');
    const path = require('path');
    const fs = require('fs');
    const { v4: uuidv4 } = require('uuid');
    const { spawn } = require('child_process');
    const axios = require('axios');
    const archiver = require('archiver');

    // --- Configuration ---
    const app = express();
    const PORT = process.env.PORT || 5002;
    const API_KEY = process.env.API_KEY; // For security
    const BASE_URL = process.env.BASE_URL;
    const YTDLP_BINARY_PATH = '/usr/local/bin/yt-dlp';

    // --- Reliable yt-dlp Runner ---
    const runYtDlp = (args) => {
        return new Promise((resolve, reject) => {
            const ytdlpProcess = spawn(YTDLP_BINARY_PATH, args);
            let stdout = '';
            let stderr = '';
            ytdlpProcess.stdout.on('data', (data) => { stdout += data.toString(); });
            ytdlpProcess.stderr.on('data', (data) => { stderr += data.toString(); });
            ytdlpProcess.on('close', (code) => {
                if (code === 0) {
                    resolve(stdout);
                } else {
                    const error = new Error(`yt-dlp exited with code ${code}`);
                    error.stderr = stderr;
                    reject(error);
                }
            });
            ytdlpProcess.on('error', (err) => reject(err));
        });
    };

    // --- Setup Directories ---
    const DOWNLOAD_DIR = path.join(__dirname, 'public_downloads');
    if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR);
    app.use('/downloads', express.static(DOWNLOAD_DIR));

    app.use(express.json());

    // --- Security Middleware ---
    const apiKeyMiddleware = (req, res, next) => {
        const providedKey = req.headers['x-api-key'];
        if (!API_KEY || providedKey !== API_KEY) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        next();
    };

    // --- Job Management ---
    const jobStatus = {};

    // --- Caching ---
    const cache = {};
    setInterval(() => {
        const now = Date.now();
        for (const key in cache) {
            if (now - cache[key].timestamp > 60 * 60 * 1000) { // 1-hour cache
                const filePath = path.join(DOWNLOAD_DIR, cache[key].filename);
                fs.unlink(filePath, (err) => {
                    if (err) console.error(`Error deleting cached file: ${err}`);
                });
                delete cache[key];
            }
        }
    }, 5 * 60 * 1000);

    function formatFilename({ title, type, quality }) {
        const safeTitle = (title || `download_${uuidv4()}`).replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
        let qualityString = '';
        if (type === 'mp3' && quality) qualityString = `${quality}kbps`;
        if (type === 'mp4' && quality) qualityString = `${quality}p`;
        const typeString = type.toUpperCase();
        return qualityString ? `JusDown - ${safeTitle} - ${typeString} | ${qualityString}` : `JusDown - ${safeTitle} - ${typeString}`;
    }

    // --- Core Download Logic ---
    async function processDownload({ url, quality, type }) {
        const cacheKey = `${url}|${quality}|${type}`;
        if (cache[cacheKey]) {
            console.log(`[Cache HIT] for: ${url}`);
            return new URL(path.join('downloads', cache[cacheKey].filename), BASE_URL).toString();
        }
        console.log(`[Cache MISS] for: ${url}`);

        const commonArgs = ['--no-check-certificate', '--user-agent', 'Mozilla/5.0', '--referer', 'https://www.google.com/'];

        const metadataJson = await runYtDlp([url, ...commonArgs, '--dump-single-json', '--ignore-errors']);
        let metadata;
        try {
            metadata = JSON.parse(metadataJson);
        } catch (e) {
            throw new Error('Could not retrieve valid media information.');
        }

        if (!metadata || Object.keys(metadata).length === 0) {
            throw new Error('No media information found at the provided link.');
        }

        const rawTitle = metadata.title || `download_${uuidv4()}`;
        let finalFilename;

        if (metadata.entries) { // Gallery/Carousel post
            finalFilename = `${formatFilename({ title: rawTitle, type: 'Gallery' })}.zip`;
            const zipFilePath = path.join(DOWNLOAD_DIR, finalFilename);
            const archive = archiver('zip');
            archive.pipe(fs.createWriteStream(zipFilePath));
            for (let i = 0; i < metadata.entries.length; i++) {
                const entry = metadata.entries[i];
                const mediaUrl = entry.url || entry.formats?.find(f => f.url)?.url;
                if (!mediaUrl) continue;
                try {
                    const res = await axios({ url: mediaUrl, responseType: 'stream' });
                    const ext = path.extname(new URL(mediaUrl).pathname) || '.jpg';
                    archive.append(res.data, { name: `${rawTitle}_${i + 1}${ext}` });
                } catch (e) {
                    console.error(`Skipping gallery item ${i+1}: ${e.message}`);
                }
            }
            await archive.finalize();
        } else if (type === 'image') {
            const imageUrl = metadata.thumbnail;
            if (!imageUrl) throw new Error('No downloadable image found.');
            finalFilename = `${formatFilename({ title: rawTitle, type: 'Image' })}${path.extname(new URL(imageUrl).pathname) || '.jpg'}`;
            const finalFilepath = path.join(DOWNLOAD_DIR, finalFilename);
            const res = await axios({ url: imageUrl, responseType: 'stream' });
            res.data.pipe(fs.createWriteStream(finalFilepath));
            await new Promise((resolve, reject) => res.data.on('end', resolve).on('error', reject));
        } else if (type === 'mp3') {
            finalFilename = `${formatFilename({ title: rawTitle, type: 'MP3', quality })}.mp3`;
            await runYtDlp([url, ...commonArgs, '--extract-audio', '--audio-format', 'mp3', '-o', path.join(DOWNLOAD_DIR, finalFilename)]);
        } else if (type === 'mp4') {
            finalFilename = `${formatFilename({ title: rawTitle, type: 'MP4', quality })}.mp4`;
            const format = `bestvideo[height<=${parseInt(quality)}]+bestaudio/best[height<=${parseInt(quality)}]/best`;
            await runYtDlp([url, ...commonArgs, '--format', format, '-o', path.join(DOWNLOAD_DIR, finalFilename), '--recode-video', 'mp4']);
        } else {
            throw new Error(`Unsupported type: ${type}`);
        }

        cache[cacheKey] = { filename: finalFilename, timestamp: Date.now() };
        return new URL(path.join('downloads', finalFilename), BASE_URL).toString();
    }

    // --- API Endpoints ---
    app.post('/start-download', apiKeyMiddleware, async (req, res) => {
        const { url, quality, type } = req.body;
        if (!url || !type) return res.status(400).json({ error: 'Missing parameters' });

        const jobId = uuidv4();
        jobStatus[jobId] = { status: 'queued' };
        res.json({ jobId });

        try {
            const downloadUrl = await processDownload({ url, quality, type });
            jobStatus[jobId] = { status: 'completed', url: downloadUrl };
        } catch (error) {
            console.error(`[Job ${jobId}] Failed:`, error.message, error.stderr || '');
            const stderr = String(error.stderr || '').toLowerCase();
            let userError = 'Processing failed. The link may be invalid or private.';
            if (stderr.includes('login required')) userError = 'This content is private or requires a login.';
            jobStatus[jobId] = { status: 'failed', error: userError };
        }
    });

    app.get('/status/:jobId', (req, res) => {
        const status = jobStatus[req.params.jobId];
        if (!status) return res.status(404).json({ error: 'Job not found.' });
        res.json(status);
    });

    // --- Server Startup ---
    app.listen(PORT, () => {
        console.log(`VPS Backend is running on http://localhost:${PORT}`);
    });

} catch (e) {
    console.error("Fatal server error:", e);
}
