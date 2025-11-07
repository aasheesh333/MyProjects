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

// --- Speed-Biased Background Proxy Polling ---
const PROXY_LIST_URL = 'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt';
const PROXY_TEST_URL = 'http://httpbin.org/get';
const PROXY_TEST_TIMEOUT = 10000;
const POLL_INTERVAL = 5 * 60 * 1000;

let workingProxies = []; // Now an array of { url: string, speed: number }

async function pollProxies() {
    console.log('Starting speed-biased proxy poll...');
    let fullProxyList = [];
    try {
        const response = await axios.get(PROXY_LIST_URL);
        fullProxyList = response.data.split('\n').filter(p => p.trim() !== '');
        console.log(`Fetched ${fullProxyList.length} proxies to test.`);
    } catch (error) {
        console.error('Failed to fetch proxy list for polling:', error.message);
        return;
    }

    const testPromises = fullProxyList.map(async (proxyAddress) => {
        const proxyUrl = `http://${proxyAddress}`;
        const agent = new HttpsProxyAgent(proxyUrl);
        const startTime = Date.now();
        try {
            await axios.get(PROXY_TEST_URL, { httpsAgent: agent, timeout: PROXY_TEST_TIMEOUT });
            const endTime = Date.now();
            return { url: proxyUrl, speed: endTime - startTime };
        } catch {
            return null;
        }
    });

    const results = await Promise.all(testPromises);
    const newWorkingProxies = results.filter(p => p !== null);

    // Sort by speed (ascending)
    newWorkingProxies.sort((a, b) => a.speed - b.speed);

    console.log(`Proxy poll complete. Found ${newWorkingProxies.length} working proxies. Fastest is ${newWorkingProxies[0]?.speed}ms.`);
    workingProxies = newWorkingProxies;
}

function getFastestProxy() {
    // shift() removes and returns the first element (the fastest proxy)
    if (workingProxies.length > 0) {
        return workingProxies.shift().url;
    }
    return null;
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
        const proxy = getFastestProxy();
        if (!proxy) {
             // If the list is exhausted, trigger a poll and ask the user to wait.
            pollProxies();
            return res.status(503).json({ error: 'There are currently no working proxies available. The server is refreshing the list, please try again in a few minutes.' });
        }
        console.log(`Using fastest available proxy: ${proxy}`);

        const ytdlpArgs = {
            output: path.join(requestDir, '%(title)s.%(ext)s'),
            proxy: proxy,
            ffmpegLocation: require('ffmpeg-static'),
            noCheckCertificate: true,
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
    pollProxies();
    setInterval(pollProxies, POLL_INTERVAL);
});
