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

// --- Background Proxy Polling ---
const PROXY_LIST_URL = 'https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt';
const PROXY_TEST_URL = 'http://httpbin.org/get';
const PROXY_TEST_TIMEOUT = 10000; // 10 seconds
const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

let workingProxies = [];

async function pollProxies() {
    console.log('Starting proxy poll...');
    let fullProxyList = [];
    try {
        const response = await axios.get(PROXY_LIST_URL);
        fullProxyList = response.data.split('\n').filter(p => p.trim() !== '');
        console.log(`Fetched ${fullProxyList.length} proxies to test.`);
    } catch (error) {
        console.error('Failed to fetch proxy list for polling:', error.message);
        return;
    }

    const testPromises = fullProxyList.map(proxyAddress => {
        const proxyUrl = `http://${proxyAddress}`;
        const agent = new HttpsProxyAgent(proxyUrl);
        return axios.get(PROXY_TEST_URL, { httpsAgent: agent, timeout: PROXY_TEST_TIMEOUT })
            .then(() => proxyUrl)
            .catch(() => null); // Return null for failed proxies
    });

    const results = await Promise.all(testPromises);
    const newWorkingProxies = results.filter(p => p !== null);

    console.log(`Proxy poll complete. Found ${newWorkingProxies.length} working proxies.`);
    workingProxies = newWorkingProxies;
}

function getRandomWorkingProxy() {
    if (workingProxies.length === 0) {
        return null;
    }
    const randomIndex = Math.floor(Math.random() * workingProxies.length);
    return workingProxies[randomIndex];
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
        const proxy = getRandomWorkingProxy();
        if (!proxy) {
            return res.status(500).json({ error: 'There are currently no working proxies available. The server is refreshing the list, please try again in a few minutes.' });
        }
        console.log(`Using pre-vetted proxy: ${proxy}`);

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
        } else { // mp4
            ytdlpArgs.format = `bestvideo[height<=${parseInt(quality)}]+bestaudio/best`;
        }

        await ytdlp.exec(url, ytdlpArgs);

        const files = fs.readdirSync(requestDir);
        if (files.length === 0) {
            throw new Error('Download failed. yt-dlp did not produce a file.');
        }

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
    // Run the proxy poll immediately on startup, then on the defined interval
    pollProxies();
    setInterval(pollProxies, POLL_INTERVAL);
});
