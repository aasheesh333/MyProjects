import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

// --- Server Configuration ---
const app = express();
const PORT = process.env.PORT || 5002;
const API_KEY = process.env.API_KEY;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Middleware ---
app.use(express.json());

const apiKeyMiddleware = (req, res, next) => {
    const providedKey = req.headers['x-api-key'];
    if (!API_KEY || providedKey !== API_KEY) {
        return res.status(401).json({ success: false, error: 'Invalid API key' });
    }
    next();
};

app.use('/api', apiKeyMiddleware);


// --- Dynamic Platform Handler Loader ---
const PLATFORM_HANDLERS = {};

async function loadPlatformHandlers() {
    const downloadersDir = path.join(__dirname, 'downloaders');
    try {
        const files = await fs.readdir(downloadersDir);
        for (const file of files) {
            // Ignore the template file and any non-JS files
            if (file.startsWith('_') || !file.endsWith('.js')) {
                continue;
            }
            const platformName = path.basename(file, '.js');
            try {
                const module = await import(`./downloaders/${file}`);
                if (typeof module.download === 'function') {
                    PLATFORM_HANDLERS[platformName] = module.download;
                    console.log(`[Loader] Successfully loaded downloader for: ${platformName}`);
                } else {
                    console.warn(`[Loader] Warning: ${file} does not export a 'download' function.`);
                }
            } catch (err) {
                console.error(`[Loader] Error loading downloader from ${file}:`, err);
            }
        }
    } catch (err) {
        console.error('[Loader] Could not read downloaders directory:', err);
        // If the directory doesn't exist, we can't continue.
        process.exit(1);
    }
}


// --- Asynchronous Job Queue ---
const jobQueue = [];
const jobStatus = {};
let isProcessing = false;

async function processQueue() {
    if (isProcessing || jobQueue.length === 0) {
        return;
    }
    isProcessing = true;
    const job = jobQueue.shift();

    try {
        jobStatus[job.jobId] = { status: 'processing', platform: job.platform };

        const handler = PLATFORM_HANDLERS[job.platform];
        if (!handler) {
            throw new Error(`Platform '${job.platform}' is not supported or its module failed to load.`);
        }

        const result = await handler({
            url: job.url,
            contentType: job.contentType,
            quality: job.quality,
        });

        if (result.success) {
            jobStatus[job.jobId] = { status: 'completed', result };
        } else {
            // Pass the specific error from the downloader
            throw new Error(result.error || 'The downloader failed without a specific error message.');
        }

    } catch (error) {
        console.error(`[Job ${job.jobId}] Failed for platform ${job.platform}:`, error.message);
        jobStatus[job.jobId] = { status: 'failed', platform: job.platform, error: error.message };
    } finally {
        isProcessing = false;
        // Immediately try to process the next job
        process.nextTick(processQueue);
    }
}

// Check the queue every few seconds in case the event loop is empty
setInterval(processQueue, 2000);


// --- API Routes ---
app.post('/api/v2/download', (req, res) => {
    const { url, platform, contentType, quality } = req.body;

    if (!url || !platform || !contentType) {
        return res.status(400).json({ success: false, error: 'Missing required parameters: url, platform, contentType.' });
    }

    if (!PLATFORM_HANDLERS[platform]) {
        return res.status(400).json({ success: false, error: `Platform '${platform}' is not supported.` });
    }

    const jobId = uuidv4();
    jobStatus[jobId] = { status: 'queued', platform };
    jobQueue.push({ jobId, url, platform, contentType, quality });

    res.json({ success: true, jobId });
    // Give the queue an immediate nudge
    process.nextTick(processQueue);
});

app.get('/api/v2/status/:jobId', (req, res) => {
    const status = jobStatus[req.params.jobId];
    if (!status) {
        return res.status(404).json({ success: false, error: 'Job not found.' });
    }
    res.json({ success: true, ...status });
});


// --- Server Startup ---
async function startServer() {
    await loadPlatformHandlers();

    // Check if any handlers were loaded
    if (Object.keys(PLATFORM_HANDLERS).length === 0) {
        console.warn('Warning: No platform downloaders were loaded. The API will not be able to process any downloads.');
        console.warn('Ensure the `vps_backend/downloaders/` directory exists and contains valid downloader files.');
    }

    app.listen(PORT, () => {
        console.log(`JusDown Backend v3.0 (Axios/Cheerio) is running on http://localhost:${PORT}`);
        if (!API_KEY) {
            console.warn('Warning: API_KEY is not set. The API is currently unsecured.');
        }
    });
}

startServer();
