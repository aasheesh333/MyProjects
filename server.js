const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const ytdlp = require('yt-dlp-exec');
const axios = require('axios');

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

// --- Dynamic Free Proxy Management ---
let proxyList = [];
const PROXY_LIST_URL = 'https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt';

async function fetchProxies() {
    try {
        console.log('Fetching fresh proxy list...');
        const response = await axios.get(PROXY_LIST_URL);
        const data = response.data;
        // Split the text file by new lines and filter out any empty lines
        proxyList = data.split('\n').filter(p => p.trim() !== '');
        console.log(`Successfully fetched ${proxyList.length} proxies.`);
    } catch (error) {
        console.error('Failed to fetch proxy list:', error.message);
        // Fallback to an empty list if fetching fails
        proxyList = [];
    }
}

function getRandomProxy() {
    if (proxyList.length === 0) {
        return null;
    }
    const randomIndex = Math.floor(Math.random() * proxyList.length);
    // Proxies in the list are in host:port format, which is what yt-dlp expects
    return `http://${proxyList[randomIndex]}`;
}

// --- Universal Download Endpoint ---
app.post('/api/download', async (req, res) => {
    // Fetch a fresh list of proxies for every single request
    await fetchProxies();

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
            return res.status(500).json({ error: 'No available proxies to process the request. Please try again in a moment.' });
        }
        console.log(`Using proxy: ${proxy}`);

        const ytdlpArgs = {
            output: path.join(requestDir, '%(title)s.%(ext)s'),
            proxy: proxy,
            ffmpegLocation: require('ffmpeg-static'),
            noCheckCertificate: true, // Crucial for unreliable proxies
        };

        let formatSelector = '';
        if (type === 'mp3') {
            formatSelector = 'bestaudio';
            ytdlpArgs.extractAudio = true;
            ytdlpArgs.audioFormat = 'mp3';
            ytdlpArgs.audioQuality = `${quality}K`;
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
        res.status(500).json({ error: 'Failed to process your request. The public proxy may be unreliable or the content may be unavailable. Please try again.' });
    }
});

// --- Server Startup ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
