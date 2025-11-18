import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const PLATFORM_IDENTIFIER = 'linkedin';

/**
 * The main download function for LinkedIn.
 * @param {object} options - The options for the download.
 *- The main download function for LinkedIn.
 * @param {object} options - The options for the download.
 * @param {string} options.url - The URL of the LinkedIn post.
 * @param {string} options.contentType - The desired content type ('mp4').
 * @returns {Promise<object>} - A promise that resolves to the standardized success or error object.
 */
export async function download({ url, contentType }) {
    try {
        if (contentType !== 'mp4' && contentType !== 'image') {
            throw new Error(`LinkedIn downloader only supports 'mp4' or 'image', not '${contentType}'.`);
        }

        const response = await axios.get(url, { headers: { 'User-Agent': USER_AGENT } });
        const html = response.data;
        const $ = cheerio.load(html);

        // LinkedIn often uses Open Graph (og) meta tags for its media.
        const videoUrl = $('meta[property="og:video:secure_url"]').attr('content') || $('meta[property="og:video"]').attr('content');
        const imageUrl = $('meta[property="og:image"]').attr('content');
        const title = $('meta[property="og:title"]').attr('content') || 'LinkedIn Content';
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
        // Fallback
        else if(videoUrl) {
            downloadUrl = videoUrl;
            mimeType = 'video/mp4';
            finalContentType = 'mp4';
        } else if(imageUrl) {
            downloadUrl = imageUrl;
            mimeType = 'image/jpeg';
            finalContentType = 'image';
        } else {
            throw new Error("Could not find any public video or image. The post may require a login to view.");
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
            error: error.message || "An unknown error occurred while processing the LinkedIn URL.",
        };
    }
}
