const express = require('express');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 5001;

// --- Setup Temporary Directory ---
const TEMP_DIR = path.join(__dirname, 'temp_downloads');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR);
}

app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use('/static', express.static(path.join(__dirname, 'static')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/download', (req, res) => {
    const { url, type: contentType, quality, platform } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    // --- Server-Side Validation ---
    const PLATFORM_PATTERNS = {
        'YouTube': ['youtube.com', 'youtu.be'], 'Instagram': ['instagram.com'],
        'Facebook': ['facebook.com', 'fb.watch'], 'TikTok': ['tiktok.com'],
        'Dailymotion': ['dailymotion.com'], 'Twitter': ['twitter.com', 'x.com'],
        'Vimeo': ['vimeo.com'],
    };

    if (platform && PLATFORM_PATTERNS[platform]) {
        if (!PLATFORM_PATTERNS[platform].some(pat => url.includes(pat))) {
            return res.status(400).json({ error: 'Please select relevant platform to download content.' });
        }
    }

    const requestDir = path.join(TEMP_DIR, uuidv4());
    fs.mkdirSync(requestDir);

    const cleanup = () => {
        if (fs.existsSync(requestDir)) {
            fs.rm(requestDir, { recursive: true, force: true }, () => {});
        }
    };

    if (contentType === 'image') {
        const command = `gallery-dl -q -d "${requestDir}" --no-check-certificate --no-mtime "${url}"`;
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`gallery-dl error: ${stderr}`);
                 if (stderr.toLowerCase().includes("login required") || stderr.toLowerCase().includes("rate-limit")) {
                    cleanup();
                    return res.status(403).json({ error: 'This platform requires a login and is blocking our server. We are working on a solution, but for now, this content cannot be downloaded.' });
                }
                cleanup();
                return res.status(500).json({ error: 'Failed to download images.' });
            }

            fs.readdir(requestDir, (err, files) => {
                if (err || files.length === 0) {
                    cleanup();
                    return res.status(500).json({ error: 'Could not find downloaded files.' });
                }

                if (files.length > 1) {
                    const zipFilename = `JusDown_Images_${uuidv4()}.zip`;
                    const zipFilepath = path.join(TEMP_DIR, zipFilename);
                    const output = fs.createWriteStream(zipFilepath);
                    const archive = archiver('zip');

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

                    archive.pipe(output);
                    archive.directory(requestDir, false);
                    archive.finalize();

                } else {
                    const finalFilepath = path.join(requestDir, files[0]);
                    const { name, ext } = path.parse(files[0]);
                    const safeTitle = name.replace(/[^a-zA-Z0-9\s-]/g, '').trim();
                    const finalFilename = `JusDown - ${safeTitle}${ext}`;
                    res.download(finalFilepath, finalFilename, cleanup);
                }
            });
        });
    } else {
         const outtmpl = path.join(requestDir, '%(id)s.%(ext)s');
        let command = `yt-dlp --no-check-certificate -o "${outtmpl}"`;

        if (contentType === 'mp3') {
            command += ` -f bestaudio/best --extract-audio --audio-format mp3 --audio-quality ${quality.replace('kb/s', '')}K`;
        } else {
            command += ' -f "bestvideo[height<=?1080]+bestaudio/best"';
        }
        command += ` "${url}"`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`yt-dlp error: ${stderr}`);
                if (stderr.toLowerCase().includes("login required") || stderr.toLowerCase().includes("rate-limit")) {
                    cleanup();
                    return res.status(403).json({ error: 'This platform requires a login and is blocking our server. We are working on a solution, but for now, this content cannot be downloaded.' });
                }
                cleanup();
                return res.status(500).json({ error: 'Please check your link. The content may be private or unavailable.' });
            }

            // Extracting info from stdout
            let title = 'download';
            let ext = contentType === 'mp3' ? 'mp3' : 'mp4';
            const titleMatch = stdout.match(/\[info\]\s+(.*)\s+has already been downloaded/i) || stdout.match(/Destination:\s*(.*)/) || stdout.match(/Extracting thumbnail .* from URL (.*)/);
            if (titleMatch && titleMatch[1]) {
                 const filePath = titleMatch[1].split('.')[0]
                 title = filePath.split('/').pop()
            }

            fs.readdir(requestDir, (err, files) => {
                if (err || files.length === 0) {
                    cleanup();
                    return res.status(500).json({ error: 'Could not find downloaded file. Check FFmpeg installation.' });
                }

                const downloadedFile = files.find(f => f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.mkv') || f.endsWith('.mov'));
                const finalFilepath = path.join(requestDir, downloadedFile);

                const safeTitle = title.replace(/[^a-zA-Z0-9\s-]/g, '').trim();
                let baseFilename = `JusDown - ${safeTitle} - ${contentType.toUpperCase()}`;
                if (quality) {
                    baseFilename += ` | ${quality}`;
                }
                const maxLen = 230 - ext.length - 1;
                const finalFilename = `${baseFilename.slice(0, maxLen)}.${ext}`;

                res.download(finalFilepath, finalFilename, cleanup);
            });
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
