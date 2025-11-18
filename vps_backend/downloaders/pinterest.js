import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const PLATFORM_IDENTIFIER = 'pinterest';

export async function download({ url, contentType, quality }) {
    try {
        const { data: html } = await axios.get(url, { headers: { 'User-Agent': USER_AGENT } });
        const $ = cheerio.load(html);

        const scriptTag = $('#__PINTEREST_INITIAL_STATE__').html();
        if (!scriptTag) {
            return { success: false, error: "Could not find Pinterest data script. The page structure may have changed.", platform: PLATFORM_IDENTIFIER };
        }

        const data = JSON.parse(scriptTag);
        const pinData = Object.values(data.resources.PinResource || {})[0]?.data;
        if (!pinData) {
            return { success: false, error: "Failed to find pin data in the JSON structure.", platform: PLATFORM_IDENTIFIER };
        }

        const title = pinData.title || pinData.description || 'Pinterest Content';
        const thumbnail = pinData.images?.['736x']?.url || Object.values(pinData.images || {})[0]?.url;
        const videoUrl = pinData.videos?.video_list?.V_720P?.url;
        const imageUrl = pinData.images?.['originals']?.url || thumbnail;

        let downloadUrl, finalContentType, mimeType;

        if (contentType === 'mp4' && videoUrl) {
            downloadUrl = videoUrl;
            finalContentType = 'mp4';
            mimeType = 'video/mp4';
        } else if (contentType === 'image' && imageUrl) {
            downloadUrl = imageUrl;
            finalContentType = 'image';
            mimeType = 'image/jpeg';
        } else if (videoUrl) { // Fallback
            downloadUrl = videoUrl;
            finalContentType = 'mp4';
            mimeType = 'video/mp4';
        } else if (imageUrl) {
            downloadUrl = imageUrl;
            finalContentType = 'image';
            mimeType = 'image/jpeg';
        } else {
            return { success: false, error: "No downloadable video or image found for this pin.", platform: PLATFORM_IDENTIFIER };
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
            quality: '720p' // Assuming 720p from the videoUrl key
        };
    } catch (error) {
        return { success: false, error: error.message, platform: PLATFORM_IDENTIFIER };
    }
}
