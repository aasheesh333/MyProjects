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

const commonYtdlpOptions = {
    noCheckCertificate: true,
    userAgent: mobileUserAgent,
    referer: 'https://www.facebook.com/',
};

// Helper to format filenames (matches server.js)
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

// Helper to download stream
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

// Helper to resolve redirects
async function resolveRedirect(url) {
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': mobileUserAgent }, // Use mobile UA to get mobile link which is often easier
            maxRedirects: 0,
            validateStatus: (status) => status >= 300 && status < 400
        });
        return response.headers.location;
    } catch (error) {
        // If it was a redirect, axios throws if maxRedirects is 0, but we can catch it
        if (error.response && error.response.status >= 300 && error.response.status < 400) {
            return error.response.headers.location;
        }
        // If it's 200, no redirect, return original
        if (error.response && error.response.status === 200) {
            return url;
        }
        return url; // Fallback
    }
}

async function facebookDownloader({ url, quality, type }) {
    console.log(`[Facebook] Processing: ${url}, Type: ${type}`);

    // Resolve "share" links if needed
    let effectiveUrl = url;
    if (url.includes('share') || url.includes('sfnsn')) {
        console.log('[Facebook] Resolving share URL...');
        const resolved = await resolveRedirect(url);
        if (resolved) {
            effectiveUrl = resolved;
            console.log(`[Facebook] Resolved to: ${effectiveUrl}`);
        }
    }

    // 1. Try yt-dlp first (Best for Videos/Reels)
    try {
        console.log('[Facebook] Attempting yt-dlp...');

        // For Image type, we might want to skip yt-dlp if it's known to fail on photos,
        // but yt-dlp *can* sometimes handle posts. Let's try dumping JSON first.
        const metadata = await ytdlp(effectiveUrl, { ...commonYtdlpOptions, dumpSingleJson: true });

        // Check if it's a video or image
        const isVideo = metadata._type === 'video' || (metadata.formats && metadata.formats.length > 0);

        if (type === 'image' && !isVideo) {
             if (metadata.thumbnail) {
                 const extension = path.extname(new URL(metadata.thumbnail).pathname) || '.jpg';
                 const finalFilename = formatFilename({ title: metadata.title, type: 'Image', quality: null }) + extension;
                 await downloadFile(metadata.thumbnail, path.join(DOWNLOAD_DIR, finalFilename), commonYtdlpOptions.userAgent);
                 return { url: `${BASE_URL}/downloads/${finalFilename}`, filename: finalFilename };
             }
        }

        if ((type === 'mp4' || type === 'mp3') && isVideo) {
             const rawTitle = metadata.title;
             if (type === 'mp3') {
                const finalFilename = formatFilename({ title: rawTitle, type: 'MP3', quality: quality }) + '.mp3';
                await ytdlp.exec(effectiveUrl, {
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
                await ytdlp.exec(effectiveUrl, {
                    ...commonYtdlpOptions,
                    format: formatSelector,
                    output: path.join(DOWNLOAD_DIR, finalFilename),
                    recodeVideo: 'mp4'
                });
                return { url: `${BASE_URL}/downloads/${finalFilename}`, filename: finalFilename };
             }
        }
    } catch (error) {
        console.log(`[Facebook] yt-dlp failed or incomplete: ${error.message}. switching to fallback.`);
    }

    // 2. Fallback Scraper (For Images, Carousels, or private-ish posts)
    console.log('[Facebook] Attempting scraping fallback...');
    try {
        // Use Desktop UA for scraping as it exposes OG tags more reliably on public pages
        const scrapeHeaders = {
            'User-Agent': desktopUserAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1'
        };

        const { data } = await axios.get(effectiveUrl, { headers: scrapeHeaders });
        // console.log("DEBUG HTML START:", data.substring(0, 500)); // Log start of HTML

        const $ = cheerio.load(data);

        // Logic for extracting media URLs
        let mediaUrls = [];

        // A. Check for Open Graph Video/Image
        const ogVideo = $('meta[property="og:video"]').attr('content');
        const ogImage = $('meta[property="og:image"]').attr('content');

        if (type === 'mp4' || type === 'mp3') {
            if (ogVideo) {
                mediaUrls.push({ url: ogVideo.replace(/&amp;/g, '&'), is_video: true });
            }
        } else if (type === 'image') {
            if (ogImage) {
                 mediaUrls.push({ url: ogImage.replace(/&amp;/g, '&'), is_video: false });
            }
        }

        // B. Regex Fallback for "playable_url"
        if (mediaUrls.length === 0 && (type === 'mp4' || type === 'mp3')) {
            const html = data;

            // Try to find playable_url_quality_hd first
            let hdMatch = html.match(/"playable_url_quality_hd":"([^"]+)"/);
            if (!hdMatch) {
                 hdMatch = html.match(/playable_url_quality_hd:"([^"]+)"/);
            }

            // Try to find playable_url (SD)
            let sdMatch = html.match(/"playable_url":"([^"]+)"/);
             if (!sdMatch) {
                 sdMatch = html.match(/playable_url:"([^"]+)"/);
            }

            if (hdMatch && hdMatch[1]) {
                 const cleanUrl = hdMatch[1].replace(/\\/g, '');
                 mediaUrls.push({ url: cleanUrl, is_video: true });
            } else if (sdMatch && sdMatch[1]) {
                 const cleanUrl = sdMatch[1].replace(/\\/g, '');
                 mediaUrls.push({ url: cleanUrl, is_video: true });
            }
        }

        // Handle results
        if (mediaUrls.length === 0) {
            console.log("DEBUG: No media found. Title:", $('title').text());
            throw new Error('No media found via scraping.');
        }

        const results = [];
        const rawTitle = $('title').text().trim() || 'facebook_post';

        for (let i = 0; i < mediaUrls.length; i++) {
            const item = mediaUrls[i];

            if (type === 'mp3' && item.is_video) {
                 const finalFilename = formatFilename({ title: rawTitle, type: 'MP3', quality: quality, index: mediaUrls.length > 1 ? i : -1 }) + '.mp3';
                 // We need ffmpeg to convert from the direct URL.
                 // We can use yt-dlp to download the direct URL and convert!
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

    } catch (scrapeError) {
        console.error(`[Facebook] Scraping failed: ${scrapeError.message}`);
        throw new Error('Failed to download content. The post might be private or unavailable.');
    }
}

module.exports = facebookDownloader;
