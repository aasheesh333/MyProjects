import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

// --- Downloader Modules ---
import { getBrowser, closeBrowser } from './playwright_engine.js';
import { downloadInstagram } from './downloaders/instagram_downloader.js';
import { downloadYouTube } from './downloaders/youtube_downloader.js';
import { downloadFacebook } from './downloaders/facebook_downloader.js';
import { downloadPinterest } from './downloaders/pinterest_downloader.js';
import { downloadTikTok } from './downloaders/tiktok_downloader.js';

// --- Configuration ---
const app = express();
const PORT = process.env.PORT || 5002;
const API_KEY = process.env.API_KEY;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const DOWNLOAD_DIR = path.join(__dirname, 'public_downloads');

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

// --- Stable Asynchronous Job Queue ---
const jobQueue = [];
const jobStatus = {};
let isProcessing = false;

// --- Platform Handler Map ---
const platformHandlers = {
    instagram: downloadInstagram,
    youtube: downloadYouTube,
    facebook: downloadFacebook,
    pinterest: downloadPinterest,
    tiktok: downloadTikTok,
};

// --- Queue Processor ---
const processQueue = async () => {
    if (isProcessing || jobQueue.length === 0) {
        return;
    }
    isProcessing = true;
    const job = jobQueue.shift();

    try {
        jobStatus[job.jobId] = { status: 'processing' };

        const handler = platformHandlers[job.platform];
        if (!handler) {
            throw new Error(`Platform '${job.platform}' is not supported.`);
        }

        const downloadUrl = await handler(job);
        jobStatus[job.jobId] = { status: 'completed', url: downloadUrl };

    } catch (error) {
        console.error(`[Job ${job.jobId}] Failed:`, error.message);
        jobStatus[job.jobId] = { status: 'failed', error: error.message || 'An unknown error occurred.' };
    } finally {
        isProcessing = false;
        // Immediately check for the next job
        process.nextTick(processQueue);
    }
};

setInterval(processQueue, 3000); // Check the queue every 3 seconds

// --- API Routes ---
app.post('/api/v2/download', (req, res) => {
    const { url, type, platform, quality } = req.body;
    if (!url || !type || !platform) {
        return res.status(400).json({ success: false, error: 'Missing required parameters: url, type, platform.' });
    }

    const jobId = uuidv4();
    jobStatus[jobId] = { status: 'queued' };
    jobQueue.push({ jobId, url, type, platform, quality });

    res.json({ success: true, jobId });
    process.nextTick(processQueue); // Kick off the queue processor
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
    await getBrowser(); // Pre-warm the browser

    app.listen(PORT, () => {
        console.log(`JusDown Backend v2.1 is running on http://localhost:${PORT}`);
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
