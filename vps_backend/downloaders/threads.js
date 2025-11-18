import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const PLATFORM_IDENTIFIER = 'threads';

/**
 * The main download function for Threads.
 * @param {object} options - The options for the download.
 * @param {string} options.url - The URL of the Threads post.
 * @param {string} options.contentType - The desired content type ('mp4', 'image').
 * @returns {Promise<object>} - A promise that resolves to the standardized success or error object.
 */
export async function download({ url, contentType }) {
    try {
        const response = await axios.get(url, { headers: { 'User-Agent': USER_AGENT } });
        const html = response.data;
        const $ = cheerio.load(html);

        // Threads, like Instagram, uses Open Graph (og) meta tags.
        const videoUrl = $('meta[property="og:video"]').attr('content');
        const imageUrl = $('meta[property="og:image"]').attr('content');
        const title = $('meta[property="og:title"]').attr('content') || 'Threads Content';
        const thumbnail = imageUrl;

        let downloadUrl;
        let mimeType;
        let finalContentType = contentType;

        if (contentType === 'mp4' && videoUrl) {
            downloadUrl = videoUrl;
            mimeType = 'video/mp4';
        } else if (contentType === 'image' && imageUrl) {
            downloadUrl = imageUrl;
            mimeType = 'image/jpeg';
        }
        // Fallback logic
        else if (videoUrl) {
            downloadUrl = videoUrl;
            mimeType = 'video/mp4';
            finalContentType = 'mp4';
        } else if (imageUrl) {
            downloadUrl = imageUrl;
            mimeType = 'image/jpeg';
            finalContentType = 'image';
        } else {
            throw new Error("Could not find any video or image in this Threads post.");
        }

        if (!downloadUrl) {
            throw new Error("Failed to extract the direct download URL.");
        }

        const filename = `${title.substring(0, 50)}.${finalContentType}`;

        return {
            success: true,
            platform: PLATFORM_IDENTIFIER,
            title,
            thumbnail,
            downloadUrl,
            filename,
            mimeType,
            contentType: finalContentType,
            quality: 'default',
        };

    } catch (error) {
        console.error(`[${PLATFORM_IDENTIFIER}] Error downloading from ${url}:`, error.message);
        return {
            success: false,
            platform: PLATFORM_IDENTIFIER,
            error: error.message || "An unknown error occurred while processing the Threads URL.",
        };
    }
}
