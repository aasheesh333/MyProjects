import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const PLATFORM_IDENTIFIER = 'reddit';

/**
 * The main download function for Reddit.
 * @param {object} options - The options for the download.
 * @param {string} options.url - The URL of the Reddit post.
 * @param {string} options.contentType - The desired content type ('mp4', 'image').
 * @returns {Promise<object>} - A promise that resolves to the standardized success or error object.
 */
export async function download({ url, contentType }) {
    try {
        const response = await axios.get(url, { headers: { 'User-Agent': USER_AGENT } });
        const html = response.data;
        const $ = cheerio.load(html);

        // Reddit embeds its data in a script tag with id 'data'
        const scriptTag = $('#data').html();
        if (!scriptTag) {
            throw new Error("Could not find the Reddit data script tag. The page structure may have changed.");
        }

        const data = JSON.parse(scriptTag);
        const post = data.posts.models[Object.keys(data.posts.models)[0]]; // Get the first (and usually only) post object

        if (!post) {
            throw new Error("Failed to find post data in the JSON structure.");
        }

        const title = post.title || 'Reddit Content';
        const thumbnail = post.thumbnail.url;

        let downloadUrl;
        let mimeType;
        let finalContentType = contentType;

        const isVideo = post.media && post.media.type === 'video';
        const isImage = post.media && post.media.type === 'image';

        if (contentType === 'mp4' && isVideo) {
            downloadUrl = post.media.dashUrl.split('?')[0]; // Get the DASH URL without query params
            mimeType = 'video/mp4';
        } else if (contentType === 'image' && isImage) {
            downloadUrl = post.media.content;
            mimeType = 'image/jpeg'; // Assuming jpeg, adjust if needed
        }
        // Fallback logic
        else if (isVideo) {
            downloadUrl = post.media.dashUrl.split('?')[0];
            mimeType = 'video/mp4';
            finalContentType = 'mp4';
        } else if (isImage) {
            downloadUrl = post.media.content;
            mimeType = 'image/jpeg';
            finalContentType = 'image';
        } else {
            throw new Error("This Reddit post does not appear to contain a direct video or image.");
        }

        if (!downloadUrl) {
            throw new Error("Failed to extract the direct download URL from the Reddit data.");
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
            error: error.message || "An unknown error occurred while processing the Reddit URL.",
        };
    }
}
