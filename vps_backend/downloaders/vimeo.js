import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const PLATFORM_IDENTIFIER = 'vimeo';

/**
 * The main download function for Vimeo.
 * @param {object} options - The options for the download.
 * @param {string} options.url - The URL of the Vimeo video.
 * @param {string} options.contentType - The desired content type ('mp4').
 * @returns {Promise<object>} - A promise that resolves to the standardized success or error object.
 */
export async function download({ url, contentType }) {
    try {
        if (contentType !== 'mp4') {
            throw new Error(`Vimeo downloader only supports 'mp4', not '${contentType}'.`);
        }

        const response = await axios.get(url, { headers: { 'User-Agent': USER_AGENT } });
        const html = response.data;
        const $ = cheerio.load(html);

        // Vimeo includes structured data in a <script type="application/ld+json"> tag.
        const scriptTag = $('script[type="application/ld+json"]').html();
        if (!scriptTag) {
            throw new Error("Could not find the Vimeo ld+json script tag. The page structure may have changed.");
        }

        const data = JSON.parse(scriptTag);

        // The direct video URL is often in the 'contentUrl' or 'embedUrl' property.
        // We might need to fetch the config from the embed URL to get the final mp4 link.
        const videoPageUrl = data.embedUrl || data.contentUrl;
        if (!videoPageUrl) {
            throw new Error("Failed to find the video embed URL in the JSON data.");
        }

        // Fetch the player configuration to find the actual mp4 links
        const playerConfigResponse = await axios.get(videoPageUrl, { headers: { 'User-Agent': USER_AGENT } });
        const playerHtml = playerConfigResponse.data;

        // Find the player config JSON within the player HTML
        const configMatch = playerHtml.match(/var config = ({.+?});/);
        if (!configMatch || !configMatch[1]) {
            throw new Error("Could not find the player configuration object.");
        }

        const playerConfig = JSON.parse(configMatch[1]);
        const progressiveFiles = playerConfig.request.files.progressive;

        if (!progressiveFiles || progressiveFiles.length === 0) {
            throw new Error("No downloadable video files found in the player configuration.");
        }

        // Find the best quality available, usually the last one in the array
        const bestQuality = progressiveFiles.sort((a, b) => a.height - b.height).pop();

        const downloadUrl = bestQuality.url;
        const title = data.name || 'Vimeo Video';
        const thumbnail = data.thumbnailUrl;

        if (!downloadUrl) {
            throw new Error("Failed to extract the final download URL.");
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
            quality: `${bestQuality.height}p`,
        };

    } catch (error) {
        console.error(`[${PLATFORM_IDENTIFIER}] Error downloading from ${url}:`, error.message);
        return {
            success: false,
            platform: PLATFORM_IDENTIFIER,
            error: error.message || "An unknown error occurred while processing the Vimeo URL.",
        };
    }
}
