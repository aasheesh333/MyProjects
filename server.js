const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const ytdlp = require('yt-dlp-exec');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 5001;

// --- Setup Temporary Directory ---
const TEMP_DIR = path.join(__dirname, 'temp_downloads');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR);
}

app.use(express.json());
app.use(express.static(__dirname));
app.use('/static', express.static(path.join(__dirname, 'static')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- YouTube Session Management (Direct Scraping) ---
let youtubeSession = null;
let lastSessionFetch = 0;
const SESSION_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function getYouTubeSession() {
    const now = Date.now();
    if (youtubeSession && (now - lastSessionFetch < SESSION_CACHE_DURATION)) {
        console.log('Using cached YouTube session.');
        return youtubeSession;
    }

    console.log('Fetching new YouTube session tokens via Puppeteer...');
    let browser = null;
    try {
        browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.goto('https://www.youtube.com', { waitUntil: 'networkidle2' });

        // Wait for the specific object to be available on the page
        await page.waitForFunction(() => window.ytInitialData && window.ytInitialData.visitorData);

        const sessionData = await page.evaluate(() => {
            const visitorData = window.ytInitialData?.visitorData?.visitorData;
            const poToken = window.ytInitialData?.responseContext?.webResponseContextExtensionData?.ytConfigData?.body?.playerResponse?.args?.po_token;
            return { visitorData, poToken };
        });

        if (!sessionData || !sessionData.visitorData || !sessionData.poToken) {
            throw new Error('Failed to extract valid session tokens from YouTube page.');
        }

        youtubeSession = sessionData;
        lastSessionFetch = now;
        console.log('Successfully fetched new YouTube session tokens.');
        return youtubeSession;
    } catch (error) {
        console.error('Fatal error fetching YouTube session with Puppeteer:', error);
        throw new Error('Could not establish a valid session with YouTube.');
    } finally {
        if (browser) await browser.close();
    }
}


// --- Universal Download Endpoint ---
app.post('/api/download', async (req, res) => {
    const { url, quality, type } = req.body;
    if (!url || !quality || !type) {
        return res.status(400).json({ error: 'URL, quality, and type are required' });
    }

    const requestDir = path.join(TEMP_DIR, uuidv4());
    fs.mkdirSync(requestDir);

    const cleanup = () => {
        if (fs.existsSync(requestDir)) {
            fs.rm(requestDir, { recursive: true, force: true }, () => {});
        }
    };

    try {
        const session = await getYouTubeSession();

        const ytdlpArgs = {
            output: path.join(requestDir, '%(title)s.%(ext)s'),
            ffmpegLocation: require('ffmpeg-static'),
            noCheckCertificate: true,
            sleepInterval: 5,
            extractorArgs: `youtube:player_client=web;player_client_version=1.2.3;po_token=${session.poToken};visitor_data=${session.visitorData}`,
        };

        if (type === 'mp3') {
            ytdlpArgs.format = 'bestaudio';
            ytdlpArgs.extractAudio = true;
            ytdlpArgs.audioFormat = 'mp3';
            ytdlpArgs.audioQuality = `${quality}K`;
        } else {
            ytdlpArgs.format = `bestvideo[height<=${parseInt(quality)}]+bestaudio/best`;
        }

        await ytdlp.exec(url, ytdlpArgs);

        const files = fs.readdirSync(requestDir);
        if (files.length === 0) throw new Error('Download failed. yt-dlp did not produce a file.');

        const downloadedFile = files[0];
        const finalFilepath = path.join(requestDir, downloadedFile);

        res.download(finalFilepath, downloadedFile, (err) => {
            if (err) console.error('Error sending file to user:', err);
            cleanup();
        });

    } catch (error) {
        console.error('Processing error:', error);
        cleanup();
        res.status(500).json({ error: error.message || 'An unexpected error occurred.' });
    }
});

// --- Server Startup ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    getYouTubeSession();
});
