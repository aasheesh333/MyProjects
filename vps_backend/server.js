try {
    require('dotenv').config();
    const express = require('express');
    const path = require('path');
    const fs = require('fs');
    const { v4: uuidv4 } = require('uuid');
    const axios = require('axios');
    const archiver = require('archiver');
    const ffmpeg = require('ffmpeg-static');
    const { exec } = require('child_process');

    // --- Platform Specific Libraries ---
    const { Innertube } = require('youtubei.js');
    const instagramDl = require('priyansh-ig-downloader');
    const getFBInfo = require('fb-downloader');
    const pinterestDl = require('pinterest-dl');

    // --- Configuration ---
    const app = express();
    const PORT = process.env.PORT || 5002;
    const API_KEY = process.env.API_KEY;
    const BASE_URL = process.env.BASE_URL;

    // --- Setup Directories ---
    const DOWNLOAD_DIR = path.join(__dirname, 'public_downloads');
    if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR);
    app.use('/downloads', express.static(DOWNLOAD_DIR));
    app.use(express.json());

    // --- Security Middleware ---
    const apiKeyMiddleware = (req, res, next) => {
        const providedKey = req.headers['x-api-key'];
        if (!API_KEY || providedKey !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
        next();
    };

    // --- Job Management ---
    const jobStatus = {};
    const cache = {};

    // --- Utility Functions ---
    const formatFilename = ({ title, type, quality }) => {
        const safeTitle = (title || `download_${uuidv4()}`).replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
        const typeString = type.toUpperCase();
        return `JusDown - ${safeTitle} - ${typeString}`;
    };

    const downloadFile = async (url, filepath) => {
        const writer = fs.createWriteStream(filepath);
        const response = await axios({ url, method: 'GET', responseType: 'stream' });
        response.data.pipe(writer);
        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    };

    // --- Platform Handlers ---
    const handleYoutube = async ({ url, type }) => {
        const youtube = await Innertube.create();
        const info = await youtube.getInfo(url);
        const format = type === 'mp3' ? info.formats.find(f => f.itag === 140) : info.formats.find(f => f.itag === 18);
        if (!format) throw new Error('Could not find a suitable format.');
        return [format.url];
    };

    const handleInstagram = async ({ url }) => {
        const results = await instagramDl(url);
        return results.map(r => r.download_link);
    };

    const handleFacebook = async ({ url }) => {
        const result = await getFBInfo(url);
        return [result.hd || result.sd];
    };

    const handlePinterest = async ({ url }) => {
        const results = await pinterestDl(url);
        return results.map(r => r.url);
    };

    // --- Core Download Logic ---
    async function processDownload({ url, quality, type, platform }) {
        const cacheKey = `${url}|${type}`;
        if (cache[cacheKey]) {
            console.log(`[Cache HIT] for: ${url}`);
            return new URL(path.join('downloads', cache[cacheKey].filename), BASE_URL).toString();
        }
        console.log(`[Cache MISS] for: ${url}`);

        let mediaUrls = [];
        let title = `download_${uuidv4()}`;

        if (platform === 'youtube') {
            mediaUrls = await handleYoutube({ url, type });
            const youtube = await Innertube.create();
            const info = await youtube.getInfo(url);
            title = info.basic_info.title;
        } else if (platform === 'instagram') {
            mediaUrls = await handleInstagram({ url });
        } else if (platform === 'facebook') {
            mediaUrls = await handleFacebook({ url });
        } else if (platform === 'pinterest') {
            mediaUrls = await handlePinterest({ url });
        } else {
            throw new Error(`Platform '${platform}' is not supported in this new version.`);
        }

        if (!mediaUrls || mediaUrls.length === 0) throw new Error('No downloadable media found.');

        let finalFilename;
        if (mediaUrls.length > 1) {
            finalFilename = `${formatFilename({ title, type: 'Gallery' })}.zip`;
            const zipFilePath = path.join(DOWNLOAD_DIR, finalFilename);
            const archive = archiver('zip');
            archive.pipe(fs.createWriteStream(zipFilePath));
            for (let i = 0; i < mediaUrls.length; i++) {
                try {
                    const res = await axios({ url: mediaUrls[i], responseType: 'stream' });
                    archive.append(res.data, { name: `${title}_${i + 1}.mp4` });
                } catch (e) { console.error(`Skipping gallery item ${i+1}: ${e.message}`); }
            }
            await archive.finalize();
        } else {
            const mediaUrl = mediaUrls[0];
            if (type === 'mp3') {
                const tempVideoPath = path.join(DOWNLOAD_DIR, `${uuidv4()}.tmp`);
                await downloadFile(mediaUrl, tempVideoPath);
                finalFilename = `${formatFilename({ title, type, quality })}.mp3`;
                const finalFilepath = path.join(DOWNLOAD_DIR, finalFilename);
                await new Promise((resolve, reject) => {
                    exec(`"${ffmpeg}" -i "${tempVideoPath}" -b:a 128k "${finalFilepath}"`, (err) => {
                        fs.unlink(tempVideoPath, () => {}); // Clean up temp file
                        if (err) return reject(err);
                        resolve();
                    });
                });
            } else { // For mp4 and image
                const extension = path.extname(new URL(mediaUrl).pathname) || '.mp4';
                finalFilename = `${formatFilename({ title, type })}${extension}`;
                await downloadFile(mediaUrl, path.join(DOWNLOAD_DIR, finalFilename));
            }
        }

        cache[cacheKey] = { filename: finalFilename, timestamp: Date.now() };
        return new URL(path.join('downloads', finalFilename), BASE_URL).toString();
    }

    // --- API Endpoints ---
    app.post('/start-download', apiKeyMiddleware, async (req, res) => {
        const { url, quality, type, platform } = req.body;
        if (!url || !type || !platform) return res.status(400).json({ error: 'Missing parameters.' });

        const jobId = uuidv4();
        jobStatus[jobId] = { status: 'queued' };
        res.json({ jobId });

        try {
            const downloadUrl = await processDownload({ url, quality, type, platform });
            jobStatus[jobId] = { status: 'completed', url: downloadUrl };
        } catch (error) {
            console.error(`[Job ${jobId}] Failed:`, error);
            jobStatus[jobId] = { status: 'failed', error: error.message || 'Processing failed.' };
        }
    });

    app.get('/status/:jobId', (req, res) => {
        const status = jobStatus[req.params.jobId];
        if (!status) return res.status(404).json({ error: 'Job not found.' });
        res.json(status);
    });

    // --- Server Startup ---
    app.listen(PORT, () => {
        console.log(`New VPS Backend is running on http://localhost:${PORT}`);
    });

} catch (e) {
    console.error("Fatal server error:", e);
}
