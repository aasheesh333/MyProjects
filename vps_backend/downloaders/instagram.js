import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const PLATFORM_IDENTIFIER = 'instagram';

export async function download({ url, contentType, quality }) {
    try {
        const { data: html } = await axios.get(url, { headers: { 'User-Agent': USER_AGENT } });
        const $ = cheerio.load(html);

        const videoUrl = $('meta[property="og:video"]').attr('content');
        const imageUrl = $('meta[property="og:image"]').attr('content');
        const title = $('meta[property="og:title"]').attr('content')?.replace(/"/g, '') || 'Instagram Content';

        let downloadUrl, finalContentType, mimeType;

        if (contentType === 'mp4' && videoUrl) {
            downloadUrl = videoUrl;
            finalContentType = 'mp4';
            mimeType = 'video/mp4';
        } else if (contentType === 'image' && imageUrl) {
            downloadUrl = imageUrl;
            finalContentType = 'image';
            mimeType = 'image/jpeg';
        } else if (videoUrl) { // Fallback to best available
            downloadUrl = videoUrl;
            finalContentType = 'mp4';
            mimeType = 'video/mp4';
        } else if (imageUrl) {
            downloadUrl = imageUrl;
            finalContentType = 'image';
            mimeType = 'image/jpeg';
        } else {
            return { success: false, error: "No public video or image found. The post may be private or a story.", platform: PLATFORM_IDENTIFIER };
        }

        const filename = `${title.substring(0, 50)}.${finalContentType}`;

        return {
            success: true,
            platform: PLATFORM_IDENTIFIER,
            title,
            thumbnail: imageUrl || '',
            downloadUrl,
            filename,
            mimeType,
            contentType: finalContentType,
            quality: 'default'
        };
    } catch (error) {
        return { success: false, error: error.message, platform: PLATFORM_IDENTIFIER };
    }
}
