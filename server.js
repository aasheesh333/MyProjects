const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const archiver = require('archiver');
const ytdlp = require('yt-dlp-exec');
const axios = require('axios');

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

app.post('/download', async (req, res) => {
    console.log(`[DEBUG] YOUTUBE_COOKIES_PATH: ${process.env.YOUTUBE_COOKIES_PATH}`);
    const { url, type: contentType, quality, platform } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
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

                const response = await axios.get(apiUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Referer': 'https://www.instagram.com/',
                    }
                });

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

                    for (let i = 0; i < mediaUrls.length; i++) {
                        const mediaUrl = mediaUrls[i];
                        const fileResponse = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
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
                    const fileResponse = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
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
        } else if (contentType === 'image') {
            try {
                const ytdlpArgs = {
                    skipDownload: true,
                    printJson: true,
                    addHeader: [
                        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                        'Accept-Language: en-US,en;q=0.9',
                        'Referer: https://www.google.com/',
                    ],
                };

                if (url.includes('youtube.com') || url.includes('youtu.be')) {
                    ytdlpArgs.addHeader = [
                        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                        'Accept-Language: en-US,en;q=0.9',
                        'Referer: https://www.youtube.com/',
                    ];
                    ytdlpArgs.geoBypass = true;
                    ytdlpArgs.geoBypassCountry = 'US';
                    ytdlpArgs.forceIpv4 = true;
                    ytdlpArgs.extractorArgs = 'youtube:player_client=android;youtube:skip=authcheck';
                    if (process.env.YOUTUBE_COOKIES_PATH) {
                        ytdlpArgs.cookies = process.env.YOUTUBE_COOKIES_PATH;
                    }
                }

                const output = await ytdlp(url, ytdlpArgs);

                const data = JSON.parse(output);

                let mediaUrls = [];
                if (data.entries) {
                    mediaUrls = data.entries.map(entry => entry.url);
                } else {
                    mediaUrls.push(data.url);
                }

                if (mediaUrls.length > 1) {
                    const zipFilename = `JusDown_Images_${uuidv4()}.zip`;
                    const zipFilepath = path.join(requestDir, zipFilename);
                    const output = fs.createWriteStream(zipFilepath);
                    const archive = archiver('zip');

                    archive.pipe(output);

                    for (let i = 0; i < mediaUrls.length; i++) {
                        const imageUrl = mediaUrls[i];
                        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                        archive.append(response.data, { name: `image_${i + 1}.jpg` });
                    }

                    archive.finalize();

                    output.on('close', () => {
                        res.download(zipFilepath, "JusDown - Image Pack.zip", cleanup);
                    });

                    archive.on('error', (err) => {
                        cleanup();
                        return res.status(500).json({ error: 'Unable to download this image at the moment. Please try another link.' });
                    });
                } else {
                    const imageUrl = mediaUrls[0];
                    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                    const filename = `JusDown_Image_${uuidv4()}.jpg`;
                    const finalFilepath = path.join(requestDir, filename);
                    fs.writeFileSync(finalFilepath, response.data);
                    res.download(finalFilepath, "JusDown - Image.jpg", cleanup);
                }
            } catch (error) {
                console.error('Image download error:', error);
                cleanup();
                return res.status(500).json({ error: 'Unable to download this image at the moment. Please try another link.' });
            }
        } else { // Video or Audio
            const ytdlpArgs = {
                output: path.join(requestDir, '%(id)s.%(ext)s'),
                noCheckCertificate: true,
                addHeader: [
                    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Accept-Language: en-US,en;q=0.9',
                    'Referer: https://www.google.com/',
                ],
            };

            if (url.includes('youtube.com') || url.includes('youtu.be')) {
                ytdlpArgs.addHeader = [
                    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Accept-Language: en-US,en;q=0.9',
                    'Referer: https://www.youtube.com/',
                ];
                ytdlpArgs.geoBypass = true;
                ytdlpArgs.geoBypassCountry = 'US';
                ytdlpArgs.forceIpv4 = true;
                ytdlpArgs.extractorArgs = 'youtube:player_client=android;youtube:skip=authcheck';
                if (process.env.YOUTUBE_COOKIES_PATH) {
                    ytdlpArgs.cookies = process.env.YOUTUBE_COOKIES_PATH;
                }
            }

            if (contentType === 'mp3') {
                ytdlpArgs.format = 'bestaudio/best';
                ytdlpArgs.extractAudio = true;
                ytdlpArgs.audioFormat = 'mp3';
                ytdlpArgs.audioQuality = `${quality.replace('kb/s', '')}K`;
            } else {
                ytdlpArgs.format = 'bestvideo[height<=?1080]+bestaudio/best';
            }

            const info = await ytdlp(url, ytdlpArgs);

            const files = fs.readdirSync(requestDir);
            if (files.length === 0) {
                cleanup();
                return res.status(500).json({ error: 'Could not find downloaded file.' });
            }

            const downloadedFile = files[0];
            const finalFilepath = path.join(requestDir, downloadedFile);

            const title = info.title || 'download';
            const ext = path.extname(downloadedFile).substring(1);
            const safeTitle = title.replace(/[^a-zA-Z0-9\s-]/g, '').trim();
            let baseFilename = `JusDown - ${safeTitle} - ${contentType.toUpperCase()}`;
            if (quality) {
                baseFilename += ` | ${quality}`;
            }
            const maxLen = 230 - ext.length - 1;
            const finalFilename = `${baseFilename.slice(0, maxLen)}.${ext}`;

            res.download(finalFilepath, finalFilename, cleanup);
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
