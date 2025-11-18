import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

// --- Environment and Server Configuration ---
const { PORT = 5002, API_KEY, BASE_URL } = process.env;
const HOST = '0.0.0.0';

if (!API_KEY || !BASE_URL) {
    console.error("FATAL ERROR: API_KEY and BASE_URL must be defined in your .env file.");
    process.exit(1);
}

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Middleware ---
app.use(express.json());

const apiKeyMiddleware = (req, res, next) => {
    if (req.headers['x-api-key'] !== API_KEY) {
        return res.status(401).json({ success: false, error: 'Invalid API key.' });
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
            if (file.startsWith('_') || !file.endsWith('.js')) continue;

            const platformName = path.basename(file, '.js');
            const module = await import(`./downloaders/${file}`);

            if (typeof module.download === 'function') {
                PLATFORM_HANDLERS[platformName] = module.download;
                console.log(`[Loader] Loaded downloader: ${platformName}`);
            } else {
                console.warn(`[Loader] Warning: ${file} does not export a 'download' function.`);
            }
        }
    } catch (err) {
        console.error('[Loader] Fatal Error: Could not read downloaders directory.', err);
        process.exit(1);
    }
}

// --- Asynchronous Job Queue ---
const jobQueue = [];
const jobStatus = {};
let isProcessing = false;

async function processQueue() {
    if (isProcessing || jobQueue.length === 0) return;

    isProcessing = true;
    const job = jobQueue.shift();
    jobStatus[job.jobId] = { status: 'processing' };

    try {
        const handler = PLATFORM_HANDLERS[job.platform];
        if (!handler) {
            throw new Error(`Platform '${job.platform}' is not supported.`);
        }

        // Pass the full options object to the handler, as per the specification.
        const result = await handler({
            url: job.url,
            contentType: job.contentType,
            quality: job.quality
        });

        if (result.success) {
            jobStatus[job.jobId] = { status: 'completed', result };
        } else {
            throw new Error(result.error || 'The downloader failed without a specific error message.');
        }

    } catch (error) {
        console.error(`[Job ${job.jobId}] Failed:`, error.message);
        jobStatus[job.jobId] = { status: 'failed', error: error.message };
    } finally {
        isProcessing = false;
        process.nextTick(processQueue);
    }
}

setInterval(processQueue, 1000);

// --- API Routes ---
app.post('/api/v2/download', (req, res) => {
    // Capture contentType and quality from the request body.
    const { url, platform, contentType, quality } = req.body;

    if (!url || !platform || !contentType) {
        return res.status(400).json({ success: false, error: 'Missing required parameters: url, platform, contentType.' });
    }
    if (!PLATFORM_HANDLERS[platform]) {
        return res.status(400).json({ success: false, error: `Platform '${platform}' is not supported.` });
    }

    const jobId = uuidv4();
    jobStatus[jobId] = { status: 'queued' };
    // Push the full job details to the queue.
    jobQueue.push({ jobId, url, platform, contentType, quality });

    res.json({ success: true, jobId });
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

    if (Object.keys(PLATFORM_HANDLERS).length === 0) {
        console.warn('Warning: No platform downloaders were loaded. API will be unresponsive.');
    }

    app.listen(PORT, HOST, () => {
        console.log(`JusDown Backend v3.2 (Production Ready) is running on http://${HOST}:${PORT}`);
    });
}

startServer();
