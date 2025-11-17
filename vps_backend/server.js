import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import archiver from 'archiver';

// --- Downloader Modules ---
import { getBrowser, closeBrowser } from './playwright_engine.js';
import { downloadInstagram } from './instagram_downloader.js';
import { downloadYouTube } from './youtube_downloader.js';
import { downloadFacebook } from './facebook_downloader.js';
import { downloadPinterest } from './pinterest_downloader.js';
import { convertToMp3 } from './ffmpeg_converter.js';

// --- Configuration ---
const app = express();
const PORT = process.env.PORT || 5002;
const API_KEY = process.env.API_KEY;
const BASE_URL = process.env.BASE_URL;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOWNLOAD_DIR = path.join(__dirname, 'public_downloads');

// --- Middleware ---
app.use(express.json());
app.use('/downloads', express.static(DOWNLOAD_DIR));

const apiKeyMiddleware = (req, res, next) => {
    const providedKey = req.headers['x-api-key'];
    if (!API_KEY || providedKey !== API_KEY) {
        return res.status(401).json({ success: false, error: 'Invalid API key' });
    }
    next();
};
app.use('/api', apiKeyMiddleware);

// --- Asynchronous Job Queue ---
const jobQueue = [];
const jobStatus = {};
let isProcessing = false;

// --- Helper Functions ---
const formatFilename = ({ title, type }) => {
    const safeTitle = (title || `download_${uuidv4()}`).replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
    return `JusDown - ${safeTitle} - ${type.toUpperCase()}`;
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


// --- Core Download Logic ---
const processDownload = async ({ url, type, platform }) => {
    console.log(`Processing download for platform: ${platform}, type: ${type}`);

    let result = { title: `download_${uuidv4()}`, urls: [] };

    if (platform === 'youtube') {
        result = await downloadYouTube(url, type);
    } else if (platform === 'instagram') {
        result = await downloadInstagram(url);
    } else if (platform === 'facebook') {
        result = await downloadFacebook(url);
    } else if (platform === 'pinterest') {
        result = await downloadPinterest(url);
    }
    else {
        throw new Error(`Platform '${platform}' is not yet supported.`);
    }

    if (!result.urls || result.urls.length === 0) {
        throw new Error('No downloadable media found.');
    }

    let finalFilename;

    if (result.urls.length > 1) {
        finalFilename = `${formatFilename({ title: result.title, type: 'Gallery' })}.zip`;
        const zipFilePath = path.join(DOWNLOAD_DIR, finalFilename);
        const archive = archiver('zip');
        archive.pipe(fs.createWriteStream(zipFilePath));
        for (let i = 0; i < result.urls.length; i++) {
            try {
                const res = await axios({ url: result.urls[i], responseType: 'stream' });
                const ext = path.extname(new URL(result.urls[i]).pathname) || '.jpg';
                archive.append(res.data, { name: `${result.title}_${i + 1}${ext}` });
            } catch (e) { console.error(`Skipping gallery item ${i + 1}: ${e.message}`); }
        }
        await archive.finalize();
    } else {
        const mediaUrl = result.urls[0];
        if (type === 'mp3') {
            const tempFilePath = path.join(DOWNLOAD_DIR, `${uuidv4()}.tmp`);
            await downloadFile(mediaUrl, tempFilePath);
            finalFilename = `${formatFilename({ title: result.title, type: 'mp3' })}.mp3`;
            const finalFilepath = path.join(DOWNLOAD_DIR, finalFilename);
            await convertToMp3(tempFilePath, finalFilepath);
        } else {
            const extension = path.extname(new URL(mediaUrl).pathname) || (type === 'image' ? '.jpg' : '.mp4');
            finalFilename = `${formatFilename({ title: result.title, type })}${extension}`;
            await downloadFile(mediaUrl, path.join(DOWNLOAD_DIR, finalFilename));
        }
    }

    return new URL(path.join('downloads', finalFilename), BASE_URL).toString();
};

// --- Queue Processor ---
const processQueue = async () => {
    if (isProcessing || jobQueue.length === 0) {
        return;
    }
    isProcessing = true;
    const { jobId, ...task } = jobQueue.shift();

    try {
        jobStatus[jobId] = { status: 'processing' };
        const downloadUrl = await processDownload(task);
        jobStatus[jobId] = { status: 'completed', url: downloadUrl };
    } catch (error) {
        console.error(`[Job ${jobId}] Failed:`, error);
        jobStatus[jobId] = { status: 'failed', error: error.message || 'An unknown error occurred.' };
    } finally {
        isProcessing = false;
        processQueue(); // Process next item
    }
};

setInterval(processQueue, 2000); // Check the queue every 2 seconds


// --- API Routes ---
app.post('/api/v2/download', (req, res) => {
    const { url, type, platform } = req.body;
    if (!url || !type || !platform) {
        return res.status(400).json({ success: false, error: 'Missing required parameters: url, type, platform.' });
    }

    const jobId = uuidv4();
    jobStatus[jobId] = { status: 'queued' };
    jobQueue.push({ jobId, url, type, platform });

    res.json({ success: true, jobId });
    processQueue(); // Kick off the queue processor immediately
});

app.get('/api/v2/status/:jobId', (req, res) => {
    const status = jobStatus[req.params.jobId];
    if (!status) {
        return res.status(404).json({ success: false, error: 'Job not found.' });
    }
    res.json({ success: true, ...status });
});

// --- Server Startup & Shutdown ---
const startServer = async () => {
    if (!fs.existsSync(DOWNLOAD_DIR)) {
        fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    }
    await getBrowser();

    app.listen(PORT, () => {
        console.log(`JusDown Backend v2.0 is running on http://localhost:${PORT}`);
        if (!API_KEY) {
            console.warn('Warning: API_KEY is not set. The API is currently unsecured.');
        }
    });
};

process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    await closeBrowser();
    process.exit(0);
});

startServer();
