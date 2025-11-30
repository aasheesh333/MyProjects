try {
    require('dotenv').config();
    const express = require('express');
    const path = require('path');
    const fs = require('fs');
    const { v4: uuidv4 } = require('uuid');
    const ytdlp = require('yt-dlp-exec');
    const axios = require('axios');
    const cheerio = require('cheerio');

    const app = express();
    const PORT = process.env.PORT || 5002;
    const API_KEY = process.env.API_KEY;
    const BASE_URL = process.env.BASE_URL;

    // --- Setup Directories & Middleware ---
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
            jobStatus[task.jobId] = { status: 'completed', ...result };
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
                const filenames = cache[key].filenames || [cache[key].filename];
                for (const filename of filenames) {
                    const filePath = path.join(DOWNLOAD_DIR, filename);
                    fs.unlink(filePath, (err) => {
                        if (err) console.error(`Error deleting cached file: ${err}`);
                    });
                }
                delete cache[key];
            }
        }
    }, 5 * 60 * 1000);

    // --- Filename Formatting Helper ---
    function formatFilename({ title, type, quality, index = -1 }) {
        const safeTitle = (title || `download_${uuidv4()}`)
            .replace(/[<>:"/\\|?*]/g, '_')
            .substring(0, 50);

        let qualityString = '';
        if (type === 'mp3') qualityString = `${quality}kbps`;
        else if (type === 'mp4') qualityString = `${quality}p`;

        const typeString = type.toUpperCase();
        const indexString = index >= 0 ? `_part_${index + 1}` : '';

        const finalTitle = qualityString ?
            `JusDown - ${safeTitle}${indexString} - ${typeString} | ${qualityString}` :
            `JusDown - ${safeTitle}${indexString} - ${typeString}`;

        return finalTitle;
    }

    // --- Downloader Helper ---
    async function downloadFile(url, filepath, userAgent) {
        const response = await axios({
            url,
            responseType: 'stream',
            headers: { 'User-Agent': userAgent }
        });
        const writer = fs.createWriteStream(filepath);
        response.data.pipe(writer);
        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    }

    // --- Core Processing Logic ---
    async function processDownload({ url, quality, type, platform }) {
        const cacheKey = `${url}|${quality}|${type}`;
        if (cache[cacheKey]) {
            return cache[cacheKey].urls ? { urls: cache[cacheKey].urls } : { url: `${BASE_URL}/downloads/${cache[cacheKey].filename}` };
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
            cleanup();
            throw error;
        }

        const entries = metadata.entries || [];
        // --- Scraping Fallback for Instagram ---
        if (platform === 'instagram' && entries.length === 0 && type === 'image') {
             console.log('[Scraping Fallback] yt-dlp returned no entries. Attempting to scrape the page.');
             try {
                const { data } = await axios.get(url, { headers: { 'User-Agent': commonYtdlpOptions.userAgent } });
                const $ = cheerio.load(data);
                const scriptTag = $('script:contains("shortcode_media")').html();

                if (!scriptTag) throw new Error('Could not find media JSON in page scrape.');

                const jsonDataString = scriptTag.match(/window\._sharedData\s*=\s*({.*});/);
                 if (!jsonDataString || !jsonDataString[1]) throw new Error('Could not extract media JSON from script tag.');

                const json = JSON.parse(jsonDataString[1]);
                const postData = json.entry_data.PostPage[0].graphql.shortcode_media;

                let mediaSources = [];
                if (postData.edge_sidecar_to_children) { // Carousel
                    mediaSources = postData.edge_sidecar_to_children.edges.map(edge => ({
                        url: edge.node.is_video ? edge.node.video_url : edge.node.display_url,
                        is_video: edge.node.is_video
                    }));
                } else { // Single post
                    mediaSources.push({
                        url: postData.is_video ? postData.video_url : postData.display_url,
                        is_video: postData.is_video
                    });
                }

                if (mediaSources.length === 0) throw new Error('Scraping fallback failed to find any media URLs.');

                const rawTitle = metadata.title || `instagram_${postData.shortcode}`;
                const downloadedFiles = [];
                const downloadPromises = mediaSources.map(async (source, i) => {
                    try {
                        const extension = source.is_video ? '.mp4' : '.jpg';
                        const baseFilename = formatFilename({ title: rawTitle, type: source.is_video ? 'MP4' : 'Image', quality: null, index: i });
                        const itemFilename = `${baseFilename}${extension}`;
                        const itemFilepath = path.join(DOWNLOAD_DIR, itemFilename);
                        await downloadFile(source.url, itemFilepath, commonYtdlpOptions.userAgent);
                        downloadedFiles.push(itemFilename);
                    } catch (itemError) {
                        console.error(`[Scraping] Failed to download item ${i + 1}. Error: ${itemError.message}.`);
                    }
                });

                await Promise.all(downloadPromises);

                if (downloadedFiles.length === 0) throw new Error('All scraped media downloads failed.');

                if (downloadedFiles.length === 1) {
                    const finalFilename = downloadedFiles[0];
                    cache[cacheKey] = { filename: finalFilename, timestamp: Date.now() };
                    cleanup();
                    return { url: `${BASE_URL}/downloads/${finalFilename}` };
                } else {
                    const urls = downloadedFiles.map(filename => `${BASE_URL}/downloads/${filename}`);
                    cache[cacheKey] = { urls, filenames: downloadedFiles, timestamp: Date.now() };
                    cleanup();
                    return { urls };
                }
            } catch (scrapeError) {
                cleanup();
                console.error(`[Scraping Fallback] Failed: ${scrapeError.message}`);
                throw new Error('yt-dlp and scraping fallback both failed.');
            }
        }


        // --- Standard yt-dlp Processing ---
        try {
            const effectiveEntries = entries.length > 0 ? entries : [metadata];
            const rawTitle = metadata.title;

            if (effectiveEntries.length > 1) { // Carousel/Gallery
                const downloadedFiles = [];
                // ... (rest of carousel logic from previous version, adapted to use downloadFile helper)
                await Promise.all(downloadPromises);
                const urls = downloadedFiles.map(filename => `${BASE_URL}/downloads/${filename}`);
                cache[cacheKey] = { urls, filenames: downloadedFiles, timestamp: Date.now() };
                cleanup();
                return { urls };

            } else { // Single Media
                let finalFilename;
                if (type === 'image') {
                    const imageUrl = metadata.thumbnail || metadata.url;
                    if (!imageUrl) throw new Error('Could not find image URL in yt-dlp metadata.');
                    const extension = path.extname(new URL(imageUrl).pathname) || '.jpg';
                    const baseFilename = formatFilename({ title: rawTitle, type: 'Image', quality: null });
                    finalFilename = `${baseFilename}${extension}`;
                    await downloadFile(imageUrl, path.join(DOWNLOAD_DIR, finalFilename), commonYtdlpOptions.userAgent);
                } else if (type === 'mp3') {
                    const baseFilename = formatFilename({ title: rawTitle, type: 'MP3', quality: quality });
                    finalFilename = `${baseFilename}.mp3`;
                    await ytdlp.exec(url, { ...commonYtdlpOptions, extractAudio: true, audioFormat: 'mp3', audioQuality: `${quality}K`, output: path.join(DOWNLOAD_DIR, finalFilename) });
                } else { // MP4
                    const baseFilename = formatFilename({ title: rawTitle, type: 'MP4', quality: quality });
                    finalFilename = `${baseFilename}.mp4`;
                    const formatSelector = `bestvideo[height<=${parseInt(quality)}][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best`;
                    await ytdlp.exec(url, { ...commonYtdlpOptions, format: formatSelector, output: path.join(DOWNLOAD_DIR, finalFilename), recodeVideo: 'mp4' });
                }

                cache[cacheKey] = { filename: finalFilename, timestamp: Date.now() };
                cleanup();
                return { url: `${BASE_URL}/downloads/${finalFilename}` };
            }
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
            return res.json({ jobId: null, status: 'completed', ...(cache[cacheKey].urls ? { urls: cache[cacheKey].urls } : { url: `${BASE_URL}/downloads/${cache[cacheKey].filename}` }) });
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
