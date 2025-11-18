import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const PLATFORM_IDENTIFIER = 'tiktok';

export async function download({ url, contentType, quality }) {
    try {
        if (contentType !== 'mp4') {
            return { success: false, error: `TikTok downloader only supports 'mp4', not '${contentType}'.`, platform: PLATFORM_IDENTIFIER };
        }

        const { data: html } = await axios.get(url, { headers: { 'User-Agent': USER_AGENT } });
        const $ = cheerio.load(html);

        const scriptTag = $('#__UNIVERSAL_DATA_FOR_REHYDRATION__').html();
        if (!scriptTag) {
            return { success: false, error: "Could not find TikTok data script. The page structure may have changed.", platform: PLATFORM_IDENTIFIER };
        }

        const data = JSON.parse(scriptTag);
        const videoData = data['__DEFAULT_SCOPE__']['webapp.video-detail']['itemInfo']['itemStruct'];

        if (!videoData || !videoData.video || !videoData.video.playAddr) {
            return { success: false, error: "Failed to find video data in the page's JSON structure.", platform: PLATFORM_IDENTIFIER };
        }

        const downloadUrl = videoData.video.playAddr;
        const title = videoData.desc || 'TikTok Video';
        const thumbnail = videoData.video.cover;
        const filename = `${title.substring(0, 50)}.mp4`;

        return {
            success: true,
            platform: PLATFORM_IDENTIFIER,
            title,
            thumbnail,
            downloadUrl,
            filename,
            mimeType: 'video/mp4',
            contentType: 'mp4',
            quality: `${videoData.video.height}p` || 'default'
        };
    } catch (error) {
        return { success: false, error: error.message, platform: PLATFORM_IDENTIFIER };
    }
}
