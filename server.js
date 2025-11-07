const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const ytdlp = require('yt-dlp-exec');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

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

// --- Free Proxy Management ---
let proxyList = [];

async function fetchProxies() {
    try {
        console.log('Fetching new proxy list...');
        // This is a placeholder URL. In a real scenario, we'd need to find a reliable, direct link to a TXT or JSON proxy list.
        // For this implementation, I will use a hardcoded list of proxies based on the research.
        // In a real-world scenario, you would replace this with a fetch from a URL like the one from fineproxy.
        proxyList = [
            'http://47.92.82.167:9098',
            'http://39.102.209.128:9098',
            'http://47.250.177.202:8080'
            // Add more proxies here as needed
        ];
        console.log(`Fetched ${proxyList.length} proxies.`);
    } catch (error) {
        console.error('Failed to fetch proxy list:', error);
    }
}

function getRandomProxy() {
    if (proxyList.length === 0) {
        return null;
    }
    const randomIndex = Math.floor(Math.random() * proxyList.length);
    return proxyList[randomIndex];
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
        const proxy = getRandomProxy();
        if (!proxy) {
            return res.status(500).json({ error: 'No available proxies to process the request.' });
        }
        console.log(`Using proxy: ${proxy}`);

        const ytdlpArgs = {
            output: path.join(requestDir, '%(title)s.%(ext)s'),
            proxy: proxy,
            ffmpegLocation: require('ffmpeg-static'),
        };

        let formatSelector = '';
        if (type === 'mp3') {
            formatSelector = 'bestaudio';
            ytdlpArgs.extractAudio = true;
            ytdlpArgs.audioFormat = 'mp3';
            ytdlpArgs.audioQuality = `${quality}K`; // e.g., 128K
        } else { // mp4
            formatSelector = `bestvideo[height<=${parseInt(quality)}]+bestaudio/best`;
        }
        ytdlpArgs.format = formatSelector;

        await ytdlp.exec(url, ytdlpArgs);

        const files = fs.readdirSync(requestDir);
        if (files.length === 0) {
            cleanup();
            return res.status(500).json({ error: 'Download failed. yt-dlp did not produce a file.' });
        }

        const downloadedFile = files[0];
        const finalFilepath = path.join(requestDir, downloadedFile);

        res.download(finalFilepath, downloadedFile, (err) => {
            if (err) {
                console.error('Error sending file to user:', err);
            }
            cleanup();
        });

    } catch (error) {
        console.error('Processing error:', error);
        cleanup();
        res.status(500).json({ error: 'Failed to process your request. The proxy may be unreliable or the content may be unavailable.' });
    }
});

// --- Server Startup ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    // Fetch proxies on startup and then every hour
    fetchProxies();
    setInterval(fetchProxies, 60 * 60 * 1000);
});
