const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Extracts media URLs from an Instagram post, handling single items and carousels.
 * @param {string} url The Instagram post URL.
 * @returns {Promise<object>} An object containing the extracted media URLs and metadata.
 */
async function download(url) {
    try {
        const { data: html } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        });

        const $ = cheerio.load(html);
        let jsonData = null;

        // Find the script tag containing the media data. This is a more robust method.
        $('script[type="text/javascript"]').each((i, el) => {
            const scriptContent = $(el).html();
            if (scriptContent.includes('xdt_api__v1__media__shortcode__web_info')) {
                // The JSON is embedded within the script content. We need to extract it.
                const jsonString = scriptContent.match(/\\{"data\\":{.*}/);
                if (jsonString) {
                    try {
                        // The string is escaped. We need to un-escape it before parsing.
                        jsonData = JSON.parse(JSON.parse(`"${jsonString[0]}"`));
                        return false; // Exit loop
                    } catch (e) {
                        console.error('Failed to parse embedded JSON:', e);
                    }
                }
            }
        });

        if (!jsonData || !jsonData.data || !jsonData.data.items || jsonData.data.items.length === 0) {
            throw new Error('Could not find or parse media JSON data. The post may be private, deleted, or the page structure has changed.');
        }

        const postData = jsonData.data.items[0];
        const media = [];

        // Check for carousels (multi-media posts)
        if (postData.carousel_media) {
            postData.carousel_media.forEach(item => {
                if (item.video_versions) {
                    media.push({
                        url: item.video_versions[0].url,
                        type: 'video',
                    });
                } else if (item.image_versions2) {
                    media.push({
                        url: item.image_versions2.candidates[0].url,
                        type: 'image',
                    });
                }
            });
        } else { // Single media post
            if (postData.video_versions) {
                media.push({
                    url: postData.video_versions[0].url,
                    type: 'video',
                });
            } else if (postData.image_versions2) {
                media.push({
                    url: postData.image_versions2.candidates[0].url,
                    type: 'image',
                });
            }
        }

        if (media.length === 0) {
            throw new Error('No media found in the post data.');
        }

        const title = postData.caption ? postData.caption.text.substring(0, 50) : 'Instagram Post';
        const username = postData.user.username;
        const type = media.length > 1 ? 'gallery' : media[0].type;

        // Note: This downloader returns a structured object with direct media URLs,
        // which is different from the simpler downloader. The server will need to handle this.
        return {
            success: true,
            platform: 'instagram',
            title: title,
            username: username,
            media: media,
            type: type
        };

    } catch (error) {
        console.error(`[Instagram Downloader] Error for URL ${url}:`, error.message);
        return {
            success: false,
            error: 'Failed to download from Instagram. The post may be private, deleted, or the URL is incorrect.',
        };
    }
}

module.exports = { download };
