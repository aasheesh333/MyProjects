import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const PLATFORM_IDENTIFIER = 'instagram';

export async function download({ url, contentType, quality }) {
    try {
        const { data: html } = await axios.get(url, { headers: { 'User-Agent': USER_AGENT } });
        const $ = cheerio.load(html);

        let jsonData = null;
        $('script[type="application/json"]').each((index, element) => {
            const scriptContent = $(element).html();
            if (scriptContent.includes('"xdt_api__v1__media__shortcode__web_info"')) {
                jsonData = JSON.parse(scriptContent);
                return false;
            }
        });

        if (!jsonData) {
            return { success: false, error: "Could not find the required JSON data on the page.", platform: PLATFORM_IDENTIFIER };
        }

        const postData = jsonData.items[0];
        if (!postData) {
            return { success: false, error: "Failed to extract post data from the JSON.", platform: PLATFORM_IDENTIFIER };
        }

        const title = postData.caption?.text || 'Instagram Content';
        const thumbnail = postData.image_versions2?.candidates[0]?.url;

        const isVideo = postData.video_versions && postData.video_versions.length > 0;

        let downloadUrl, finalContentType, mimeType;

        if (contentType === 'mp4' && isVideo) {
            downloadUrl = postData.video_versions[0].url;
            finalContentType = 'mp4';
            mimeType = 'video/mp4';
        } else if (contentType === 'image' && !isVideo) {
            downloadUrl = postData.image_versions2?.candidates[0]?.url;
            finalContentType = 'image';
            mimeType = 'image/jpeg';
        } else if (isVideo) { // Fallback to best available
            downloadUrl = postData.video_versions[0].url;
            finalContentType = 'mp4';
            mimeType = 'video/mp4';
        } else {
            downloadUrl = postData.image_versions2?.candidates[0]?.url;
            finalContentType = 'image';
            mimeType = 'image/jpeg';
        }

        if (!downloadUrl) {
            return { success: false, error: "Failed to extract a downloadable video or image URL.", platform: PLATFORM_IDENTIFIER };
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
            quality: 'default'
        };

    } catch (error) {
        return { success: false, error: error.message, platform: PLATFORM_IDENTIFIER };
    }
}
