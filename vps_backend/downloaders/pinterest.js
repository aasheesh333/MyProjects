import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const PLATFORM_IDENTIFIER = 'pinterest';

/**
 * The main download function for Pinterest.
 * @param {object} options - The options for the download.
 * @param {string} options.url - The URL of the Pinterest pin.
 * @param {string} options.contentType - The desired content type ('mp4', 'image').
 * @returns {Promise<object>} - A promise that resolves to the standardized success or error object.
 */
export async function download({ url, contentType }) {
    try {
        const response = await axios.get(url, { headers: { 'User-Agent': USER_AGENT } });
        const html = response.data;
        const $ = cheerio.load(html);

        // Pinterest embeds data in a script tag with id '__PINTEREST_INITIAL_STATE__'
        const scriptTag = $('#__PINTEREST_INITIAL_STATE__').html();
        if (!scriptTag) {
            throw new Error("Could not find the Pinterest data script tag. The page structure may have changed.");
        }

        const data = JSON.parse(scriptTag);

        // The exact path to the media can be complex and may change. This is a common structure.
        const pinData = Object.values(data.resources.PinResource || {})[0]?.data;

        if (!pinData) {
            throw new Error("Failed to find pin data in the JSON structure.");
        }

        const title = pinData.title || pinData.description || 'Pinterest Content';
        const thumbnail = pinData.images?.['736x']?.url || Object.values(pinData.images || {})[0]?.url;

        let downloadUrl;
        let mimeType;
        let finalContentType;

        const videoUrl = pinData.videos?.video_list?.V_720P?.url;
        const imageUrl = pinData.images?.['originals']?.url || thumbnail;

        if (contentType === 'mp4' && videoUrl) {
            downloadUrl = videoUrl;
            mimeType = 'video/mp4';
            finalContentType = 'mp4';
        } else if (contentType === 'image' && imageUrl) {
            downloadUrl = imageUrl;
            mimeType = 'image/jpeg';
            finalContentType = 'image';
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
            throw new Error("Could not find any downloadable video or image for this pin.");
        }

        if (!downloadUrl) {
            throw new Error("Failed to extract the direct download URL from the Pinterest data.");
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
            error: error.message || "An unknown error occurred while processing the Pinterest URL.",
        };
    }
}
