import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const PLATFORM_IDENTIFIER = 'tiktok';

/**
 * The main download function for TikTok.
 * @param {object} options - The options for the download.
 * @param {string} options.url - The URL of the TikTok video.
 * @param {string} options.contentType - The desired content type ('mp4').
 * @returns {Promise<object>} - A promise that resolves to the standardized success or error object.
 */
export async function download({ url, contentType }) {
    try {
        if (contentType !== 'mp4') {
            throw new Error(`TikTok downloader only supports 'mp4', not '${contentType}'.`);
        }

        const response = await axios.get(url, { headers: { 'User-Agent': USER_AGENT } });
        const html = response.data;
        const $ = cheerio.load(html);

        // TikTok embeds a JSON object with all the data in a script tag with id '__UNIVERSAL_DATA_FOR_REHYDRATION__'
        const scriptTag = $('#__UNIVERSAL_DATA_FOR_REHYDRATION__').html();
        if (!scriptTag) {
            throw new Error("Could not find the TikTok data script tag. The page structure may have changed.");
        }

        const data = JSON.parse(scriptTag);

        // Navigate through the complex JSON object to find the video data
        const videoData = data['__DEFAULT_SCOPE__']['webapp.video-detail']['itemInfo']['itemStruct'];

        if (!videoData || !videoData.video || !videoData.video.playAddr) {
            throw new Error("Failed to find video data in the JSON structure.");
        }

        const downloadUrl = videoData.video.playAddr;
        const title = videoData.desc || 'TikTok Video';
        const thumbnail = videoData.video.cover;

        if (!downloadUrl) {
            throw new Error("Failed to extract the direct download URL from the TikTok data.");
        }

        const filename = `${title.substring(0, 50)}.mp4`;
        const mimeType = 'video/mp4';

        return {
            success: true,
            platform: PLATFORM_IDENTIFIER,
            title,
            thumbnail,
            downloadUrl,
            filename,
            mimeType,
            contentType: 'mp4',
            quality: 'default',
        };

    } catch (error) {
        console.error(`[${PLATFORM_IDENTIFIER}] Error downloading from ${url}:`, error.message);
        return {
            success: false,
            platform: PLATFORM_IDENTIFIER,
            error: error.message || "An unknown error occurred while processing the TikTok URL.",
        };
    }
}
