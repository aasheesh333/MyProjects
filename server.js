const express = require('express');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const archiver = require('archiver');
const ytdlp = require('yt-dlp-exec');
const { instagram, pinterest } = require('btch-downloader');

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
        if (contentType === 'image') {
            let downloadFunc;
            if (platform === 'instagram') downloadFunc = instagram;
            else if (platform === 'pinterest') downloadFunc = pinterest;
            else {
                cleanup();
                return res.status(400).json({ error: 'Image downloads are only supported for Instagram and Pinterest.' });
            }

            const result = await downloadFunc(url);
            if (!result || !result.media || result.media.length === 0) {
                 cleanup();
                return res.status(500).json({ error: 'Could not download images from the provided URL.' });
            }

            if (result.media.length > 1) {
                const zipFilename = `JusDown_Images_${uuidv4()}.zip`;
                const zipFilepath = path.join(TEMP_DIR, zipFilename);
                const output = fs.createWriteStream(zipFilepath);
                const archive = archiver('zip');

                archive.pipe(output);

                for (const mediaUrl of result.media) {
                    archive.append(mediaUrl, { name: path.basename(mediaUrl) });
                }

                archive.finalize();

                output.on('close', () => {
                    res.download(zipFilepath, "JusDown - Image Pack.zip", () => {
                        cleanup();
                        fs.unlink(zipFilepath, () => {});
                    });
                });
                 archive.on('error', (err) => {
                    cleanup();
                    res.status(500).json({ error: 'Failed to create zip file.' });
                });


            } else {
                 const finalFilepath = result.media[0];
                 const { name, ext } = path.parse(finalFilepath);
                 const safeTitle = name.replace(/[^a-zA-Z0-9\s-]/g, '').trim();
                 const finalFilename = `JusDown - ${safeTitle}${ext}`;
                 res.download(finalFilepath, finalFilename, cleanup);
            }
        } else { // Video or Audio
            const ytdlpArgs = {
                output: path.join(requestDir, '%(id)s.%(ext)s'),
                noCheckCertificate: true,
            };

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
