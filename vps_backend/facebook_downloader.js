const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const ytdlp = require('yt-dlp-exec');
const axios = require('axios');
const cheerio = require('cheerio');

// Ensure directories exist (referenced from server.js logic)
const DOWNLOAD_DIR = path.join(__dirname, 'public_downloads');
const BASE_URL = process.env.BASE_URL || 'http://localhost:5002'; // Fallback for dev

const mobileUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const desktopUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
const fbExternalHitUA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

const commonYtdlpOptions = {
    noCheckCertificate: true,
    userAgent: desktopUserAgent,
    referer: 'https://www.facebook.com/',
};

function formatFilename({ title, type, quality, index = -1 }) {
    const safeTitle = (title || `facebook_download_${uuidv4()}`)
        .replace(/[<>:"/\\|?*#]/g, '_')
        .substring(0, 50);

    let qualityString = '';
    if (type === 'mp3') qualityString = `${quality}kbps`;
    else if (type === 'mp4') qualityString = `${quality}p`;

    const typeString = type.toUpperCase();
    const indexString = index >= 0 ? `_part_${index + 1}` : '';

    const finalTitle = qualityString ?
        `JusDown - ${safeTitle}${indexString} - ${typeString} | ${qualityString}` :
        `JusDown - ${safeTitle}${indexString} - ${typeString}`;

    return finalTitle;
}

async function downloadFile(url, filepath, userAgent) {
    const response = await axios({
        url,
        responseType: 'stream',
        headers: { 'User-Agent': userAgent }
    });
    const writer = fs.createWriteStream(filepath);
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

async function resolveRedirect(url) {
    // 1. Try fbExternalHitUA (often yields story.php?id=...)
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': fbExternalHitUA },
            maxRedirects: 0,
            validateStatus: (status) => status >= 300 && status < 400
        });
        if (response.headers.location) return response.headers.location;
    } catch (e) {}

    // 2. Try Mobile UA (yields m.facebook.com)
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': mobileUserAgent },
            maxRedirects: 0,
            validateStatus: (status) => status >= 300 && status < 400
        });
        if (response.headers.location) return response.headers.location;
    } catch (error) {}

    return url;
}

function extractId(url, html = '') {
    const patterns = [
        /fbid[=_](\d+)/,
        /story_fbid=(\d+)/,
        /\/reel\/(\d+)/,
        /\/videos\/(\d+)/,
        /\/watch\/\?v=(\d+)/
    ];
    for (const p of patterns) {
        const m = url.match(p);
        if (m) return m[1];
    }

    if (html) {
        // ID in path
        const idMatch = html.match(/\/(\d{15,16})\//);
        if (idMatch) return idMatch[1];

        // ID in meta
        const contentMatch = html.match(/"content_id":"(\d+)"/);
        if (contentMatch) return contentMatch[1];

        // ID in property
        const propMatch = html.match(/"target_id":(\d+)/);
        if (propMatch) return propMatch[1];
    }
    return null;
}

async function facebookDownloader({ url, quality, type }) {
    console.log(`[Facebook] Processing: ${url}, Type: ${type}`);

    let effectiveUrl = url;
    let extractedId = null;

    // A. Resolve Redirects (Share Links)
    if (url.includes('share') || url.includes('sfnsn')) {
        console.log('[Facebook] Resolving share URL...');
        const resolved = await resolveRedirect(url);
        if (resolved) {
            effectiveUrl = resolved;
            console.log(`[Facebook] Resolved to: ${effectiveUrl}`);
            extractedId = extractId(effectiveUrl);
        }
    } else {
        extractedId = extractId(url);
    }

    // B. Attempt yt-dlp on Canonical URL if ID found
    if (extractedId) {
        console.log(`[Facebook] Found ID: ${extractedId}.`);
        // Try Canonical Reel URL first
        const canonicalUrl = `https://www.facebook.com/reel/${extractedId}`;
        try {
            console.log(`[Facebook] Attempting yt-dlp on canonical: ${canonicalUrl}`);
            return await runYtDlp(canonicalUrl, type, quality);
        } catch (e) {
            console.log(`[Facebook] Canonical yt-dlp failed: ${e.message}`);
            // Try Video.php URL
             const videoPhpUrl = `https://www.facebook.com/video.php?v=${extractedId}`;
             try {
                console.log(`[Facebook] Attempting yt-dlp on video.php: ${videoPhpUrl}`);
                return await runYtDlp(videoPhpUrl, type, quality);
            } catch (e2) {
                console.log(`[Facebook] Video.php yt-dlp failed: ${e2.message}`);
            }
        }
    } else {
        // Try yt-dlp on effective URL directly
        try {
            console.log(`[Facebook] Attempting yt-dlp on effective URL: ${effectiveUrl}`);
            return await runYtDlp(effectiveUrl, type, quality);
        } catch (e) {
            console.log(`[Facebook] Effective URL yt-dlp failed: ${e.message}`);
        }
    }

    // C. Fallback Scraper
    console.log('[Facebook] Attempting scraping fallback...');
    // We scrape the effective URL (which might be m.facebook.com if resolved via Mobile UA)
    // or we construct a m.facebook.com URL from ID
    let scrapeUrl = effectiveUrl;
    if (extractedId) {
        scrapeUrl = `https://m.facebook.com/reel/${extractedId}/`;
    }

    return await runScraper(scrapeUrl, type, quality, extractedId);
}

async function runYtDlp(url, type, quality) {
    const metadata = await ytdlp(url, { ...commonYtdlpOptions, dumpSingleJson: true });

    const isVideo = metadata._type === 'video' || (metadata.formats && metadata.formats.length > 0);
    const rawTitle = metadata.title;

    if (type === 'image' && !isVideo) {
         if (metadata.thumbnail) {
             const extension = path.extname(new URL(metadata.thumbnail).pathname) || '.jpg';
             const finalFilename = formatFilename({ title: rawTitle, type: 'Image', quality: null }) + extension;
             await downloadFile(metadata.thumbnail, path.join(DOWNLOAD_DIR, finalFilename), commonYtdlpOptions.userAgent);
             return { url: `${BASE_URL}/downloads/${finalFilename}`, filename: finalFilename };
         }
         throw new Error('No image found.');
    }

    if ((type === 'mp4' || type === 'mp3') && isVideo) {
         if (type === 'mp3') {
            const finalFilename = formatFilename({ title: rawTitle, type: 'MP3', quality: quality }) + '.mp3';
            await ytdlp.exec(url, {
                ...commonYtdlpOptions,
                extractAudio: true,
                audioFormat: 'mp3',
                audioQuality: `${quality}K`,
                output: path.join(DOWNLOAD_DIR, finalFilename)
            });
            return { url: `${BASE_URL}/downloads/${finalFilename}`, filename: finalFilename };
         } else {
            // MP4
            const finalFilename = formatFilename({ title: rawTitle, type: 'MP4', quality: quality }) + '.mp4';
            const formatSelector = `bestvideo[height<=${parseInt(quality)}][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best`;
            await ytdlp.exec(url, {
                ...commonYtdlpOptions,
                format: formatSelector,
                output: path.join(DOWNLOAD_DIR, finalFilename),
                recodeVideo: 'mp4'
            });
            return { url: `${BASE_URL}/downloads/${finalFilename}`, filename: finalFilename };
         }
    }
    throw new Error('yt-dlp could not process content type.');
}

async function runScraper(url, type, quality, knownId) {
    // Use Mobile UA
    const scrapeHeaders = {
        'User-Agent': mobileUserAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
    };

    console.log(`[Facebook] Scraping: ${url}`);
    const { data } = await axios.get(url, { headers: scrapeHeaders });
    const $ = cheerio.load(data);
    let mediaUrls = [];

    // 1. OG Video
    const ogVideo = $('meta[property="og:video"]').attr('content');
    const ogImage = $('meta[property="og:image"]').attr('content');

    if ((type === 'mp4' || type === 'mp3') && ogVideo) {
         mediaUrls.push({ url: ogVideo.replace(/&amp;/g, '&'), is_video: true });
    } else if (type === 'image' && ogImage) {
         mediaUrls.push({ url: ogImage.replace(/&amp;/g, '&'), is_video: false });
    }

    // 2. Regex Search
    if (mediaUrls.length === 0 && (type === 'mp4' || type === 'mp3')) {
        const html = data;
        const patterns = [
            /"playable_url_quality_hd":"([^"]+)"/,
            /"playable_url":"([^"]+)"/,
            /data-video-url="([^"]+)"/,
            /"video_src",\s*"([^"]+)"/,
            /https:\\?\/\\?\/[^"']+\.mp4/ // Generic search
        ];

        for (const p of patterns) {
            const m = html.match(p);
            if (m) {
                 // Use first capturing group if exists, else match itself
                 let raw = m[1] || m[0];
                 // Decode
                 let clean = raw.replace(/\\/g, '');
                 if (clean.startsWith('http')) {
                     mediaUrls.push({ url: clean, is_video: true });
                     break;
                 }
            }
        }
    }

    // 3. Last Resort: Extract ID and retry yt-dlp if we haven't already
    if (mediaUrls.length === 0 && !knownId) {
        const newId = extractId(url, data);
        if (newId) {
             console.log(`[Facebook] Found ID via scraping: ${newId}. Retrying yt-dlp fallback.`);
             return await runYtDlp(`https://www.facebook.com/reel/${newId}`, type, quality);
        }
    }

    if (mediaUrls.length === 0) {
        throw new Error('No media found via scraping.');
    }

    // Download matches (Scraper logic)
    const results = [];
    const rawTitle = $('title').text().trim() || 'facebook_post';

    for (let i = 0; i < mediaUrls.length; i++) {
        const item = mediaUrls[i];

        if (type === 'mp3' && item.is_video) {
             const finalFilename = formatFilename({ title: rawTitle, type: 'MP3', quality: quality, index: mediaUrls.length > 1 ? i : -1 }) + '.mp3';
             await ytdlp.exec(item.url, {
                ...commonYtdlpOptions,
                extractAudio: true,
                audioFormat: 'mp3',
                audioQuality: `${quality}K`,
                output: path.join(DOWNLOAD_DIR, finalFilename)
            });
            results.push(finalFilename);

        } else if (type === 'mp4' && item.is_video) {
             const finalFilename = formatFilename({ title: rawTitle, type: 'MP4', quality: quality, index: mediaUrls.length > 1 ? i : -1 }) + '.mp4';
             await downloadFile(item.url, path.join(DOWNLOAD_DIR, finalFilename), commonYtdlpOptions.userAgent);
             results.push(finalFilename);

        } else if (type === 'image' && !item.is_video) {
             const finalFilename = formatFilename({ title: rawTitle, type: 'Image', quality: null, index: mediaUrls.length > 1 ? i : -1 }) + '.jpg';
             await downloadFile(item.url, path.join(DOWNLOAD_DIR, finalFilename), commonYtdlpOptions.userAgent);
             results.push(finalFilename);
        }
    }

    if (results.length === 0) throw new Error('Scraping found media but processing failed.');

    if (results.length === 1) {
         return { url: `${BASE_URL}/downloads/${results[0]}`, filename: results[0] };
    } else {
         const urls = results.map(f => `${BASE_URL}/downloads/${f}`);
         return { urls, filenames: results };
    }
}

module.exports = facebookDownloader;
