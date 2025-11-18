import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const PLATFORM_IDENTIFIER = 'vimeo';

export async function download({ url, contentType, quality }) {
    try {
        if (contentType !== 'mp4') {
            return { success: false, error: `Vimeo downloader only supports 'mp4', not '${contentType}'.`, platform: PLATFORM_IDENTIFIER };
        }

        const { data: html } = await axios.get(url, { headers: { 'User-Agent': USER_AGENT } });

        const configMatch = html.match(/var config = ({.+?});/);
        if (!configMatch || !configMatch[1]) {
            return { success: false, error: "Could not find the player configuration object on the Vimeo page.", platform: PLATFORM_IDENTIFIER };
        }

        const playerConfig = JSON.parse(configMatch[1]);
        const progressiveFiles = playerConfig.request.files.progressive;

        if (!progressiveFiles || progressiveFiles.length === 0) {
            return { success: false, error: "No downloadable video files found in the player configuration.", platform: PLATFORM_IDENTIFIER };
        }

        // Find the best match for the requested quality, or the highest quality if not specified.
        let targetFile = progressiveFiles.find(f => f.quality === quality) || progressiveFiles.sort((a, b) => b.height - a.height)[0];

        const downloadUrl = targetFile.url;
        const title = playerConfig.video.title || 'Vimeo Video';
        const thumbnail = playerConfig.video.thumbs['640'] || playerConfig.video.thumbs[Object.keys(playerConfig.video.thumbs)[0]];
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
            quality: targetFile.quality
        };
    } catch (error) {
        return { success: false, error: error.message, platform: PLATFORM_IDENTIFIER };
    }
}
