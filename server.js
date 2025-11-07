const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const archiver = require('archiver');
const ytdlp = require('yt-dlp-exec');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');

// --- Configure FFmpeg ---
process.env.FFMPEG_PATH = require('ffmpeg-static');
process.env.FFPROBE_PATH = require('ffprobe-static');

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

// --- Universal Get Link Endpoint (cnvmp3.com style) ---
app.post('/api/get-link', async (req, res) => {
    const { url, quality, type, platform } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    // For now, this new logic is only for YouTube
    if (platform === 'youtube') {
        if (!type || !quality) {
            return res.status(400).json({ error: 'Type and quality are required for YouTube downloads' });
        }

        try {
            let formatSelector;
            if (type === 'mp3') {
                // Best audio available, which will be in M4A format as discussed.
                formatSelector = 'bestaudio[ext=m4a]';
            } else { // mp4
                const qualityVal = parseInt(quality.replace('p', ''), 10);
                // Corrected selector: targets a single, pre-merged file with video and audio.
                formatSelector = `best[ext=mp4][height<=${qualityVal}]`;
            }

            const ytdlpArgs = {
                getUrl: true,
                format: formatSelector,
            };

            if (process.env.PROXY_URL) {
                ytdlpArgs.proxy = process.env.PROXY_URL;
            }

            const output = await ytdlp.exec(url, ytdlpArgs);
            const downloadUrl = output.stdout.trim();

            if (!downloadUrl) {
                return res.status(500).json({ error: 'Could not get the download link. The requested quality may not be available.' });
            }

            res.json({ downloadUrl });

        } catch (error) {
            console.error('Error getting direct link with yt-dlp:', error);
            res.status(500).json({ error: 'Failed to get download link. Please check the URL and try a different quality.' });
        }
    } else {
        // --- Existing logic for other platforms can be placed here ---
        // For now, we'll just return an error for non-YouTube platforms
        return res.status(400).json({ error: 'This simplified download flow is currently only for YouTube.' });
    }
});


// --- The old /download endpoint remains for non-YouTube platforms for now ---
// Note: In a future step, this could be integrated into /api/get-link
app.post('/download', async (req, res) => {
    const { url, type: contentType, quality, platform } = req.body;

    if (!url || platform === 'youtube') { // Reject youtube requests to this old endpoint
        return res.status(400).json({ error: 'Invalid request' });
    }

    const requestDir = path.join(TEMP_DIR, uuidv4());
    fs.mkdirSync(requestDir);

    const cleanup = () => {
        if (fs.existsSync(requestDir)) {
            fs.rm(requestDir, { recursive: true, force: true }, () => {});
        }
    };

    try {
        if (platform === 'instagram') {
             try {
                const postIdMatch = url.match(/(?:p|reel)\/([A-Za-z0-9-_]+)/);
                if (!postIdMatch) {
                    cleanup();
                    return res.status(400).json({ error: 'Invalid Instagram URL. Could not find post ID.' });
                }
                const postId = postIdMatch[1];
                const apiUrl = `https://www.instagram.com/p/${postId}/?__a=1&__d=dis`;

                const axiosConfig = {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Referer': 'https://www.instagram.com/',
                    }
                };

                if (process.env.PROXY_URL) {
                    axiosConfig.httpsAgent = new HttpsProxyAgent(process.env.PROXY_URL);
                }

                const response = await axios.get(apiUrl, axiosConfig);

                if (!response.data || !response.data.items || response.data.items.length === 0) {
                    cleanup();
                    return res.status(500).json({ error: 'Could not fetch media from Instagram. The post might be private or deleted.' });
                }

                const item = response.data.items[0];
                let mediaUrls = [];

                const isVideoRequest = contentType === 'video' || contentType === 'mp3';

                if (item.carousel_media) { // It's a carousel
                    item.carousel_media.forEach(media => {
                        if (isVideoRequest && media.video_versions) {
                            mediaUrls.push(media.video_versions[0].url);
                        } else if (!isVideoRequest && media.image_versions2) {
                            mediaUrls.push(media.image_versions2.candidates[0].url);
                        }
                    });
                } else { // Single media post
                    if (isVideoRequest && item.video_versions) {
                        mediaUrls.push(item.video_versions[0].url);
                    } else if (!isVideoRequest && item.image_versions2) {
                        mediaUrls.push(item.image_versions2.candidates[0].url);
                    }
                }

                if (mediaUrls.length === 0) {
                    cleanup();
                    return res.status(400).json({ error: `The post does not contain the requested content type (${contentType}). Please check your selection.` });
                }

                if (mediaUrls.length > 1) {
                    const zipFilename = `JusDown_Instagram_${uuidv4()}.zip`;
                    const zipFilepath = path.join(requestDir, zipFilename);
                    const output = fs.createWriteStream(zipFilepath);
                    const archive = archiver('zip');
                    archive.pipe(output);

                    const axiosConfig = { responseType: 'arraybuffer' };
                    if (process.env.PROXY_URL) {
                        axiosConfig.httpsAgent = new HttpsProxyAgent(process.env.PROXY_URL);
                    }

                    for (let i = 0; i < mediaUrls.length; i++) {
                        const mediaUrl = mediaUrls[i];
                        const fileResponse = await axios.get(mediaUrl, axiosConfig);
                        const extension = isVideoRequest ? 'mp4' : 'jpg';
                        archive.append(fileResponse.data, { name: `media_${i + 1}.${extension}` });
                    }

                    archive.finalize();

                    output.on('close', () => {
                        res.download(zipFilepath, "JusDown - Instagram Pack.zip", cleanup);
                    });
                    archive.on('error', (err) => {
                        cleanup();
                        return res.status(500).json({ error: 'Failed to create zip file.', details: err.message });
                    });
                } else {
                    const mediaUrl = mediaUrls[0];
                    const axiosConfig = { responseType: 'arraybuffer' };
                    if (process.env.PROXY_URL) {
                        axiosConfig.httpsAgent = new HttpsProxyAgent(process.env.PROXY_URL);
                    }
                    const fileResponse = await axios.get(mediaUrl, axiosConfig);
                    const extension = isVideoRequest ? 'mp4' : 'jpg';
                    const filename = `JusDown_Instagram_${uuidv4()}.${extension}`;
                    const finalFilepath = path.join(requestDir, filename);
                    fs.writeFileSync(finalFilepath, fileResponse.data);
                    const downloadFilename = `JusDown - Instagram.${extension}`;
                    res.download(finalFilepath, downloadFilename, cleanup);
                }

            } catch (error) {
                console.error('Instagram download error:', error);
                cleanup();
                return res.status(500).json({ error: 'An error occurred while downloading from Instagram.', details: error.message });
            }
        } else {
            // Logic for other platforms like Facebook, etc.
             return res.status(400).json({ error: 'This platform is not yet supported in this flow.' });
        }
    } catch (error) {
        console.error('Download error:', error);
        cleanup();
        if (error.message.toLowerCase().includes("login required") || error.message.toLowerCase().includes("rate-limit")) {
            return res.status(403).json({ error: 'This platform requires a login and is blocking our server. We are working on a solution, but for now, this content cannot be downloaded.' });
        }
        return res.status(500).json({ error: 'An unexpected error occurred. Please check the link or try again.' });
    }
});


app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
