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

// --- Intelligent Free Proxy Management ---
const PROXY_LIST_URL = 'https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt';
const PROXY_TEST_URL = 'https://www.google.com/';
const PROXY_TEST_TIMEOUT = 5000; // 5 seconds
const PROXY_BATCH_SIZE = 20; // Test 20 proxies at a time

async function getWorkingProxy() {
    console.log('Fetching and testing proxies...');
    let proxyList = [];
    try {
        const response = await axios.get(PROXY_LIST_URL);
        proxyList = response.data.split('\n').filter(p => p.trim() !== '');
        console.log(`Fetched ${proxyList.length} proxies.`);
    } catch (error) {
        console.error('Failed to fetch proxy list:', error.message);
        throw new Error('Could not fetch the list of available proxies.');
    }

    if (proxyList.length === 0) {
        throw new Error('Proxy list is empty.');
    }

    // Shuffle the list to test different proxies each time
    for (let i = proxyList.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [proxyList[i], proxyList[j]] = [proxyList[j], proxyList[i]];
    }

    const batch = proxyList.slice(0, PROXY_BATCH_SIZE);

    const testPromises = batch.map(proxyAddress => {
        const proxyUrl = `http://${proxyAddress}`;
        const agent = new HttpsProxyAgent(proxyUrl);
        return axios.get(PROXY_TEST_URL, { httpsAgent: agent, timeout: PROXY_TEST_TIMEOUT })
            .then(() => proxyUrl) // If successful, resolve with the proxy URL
            .catch(() => Promise.reject()); // If it fails, reject the promise
    });

    try {
        const workingProxy = await Promise.any(testPromises);
        console.log(`Found working proxy: ${workingProxy}`);
        return workingProxy;
    } catch (error) {
        throw new Error(`No working proxies found in the batch of ${PROXY_BATCH_SIZE}. Please try again.`);
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
        const proxy = await getWorkingProxy();

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
});
