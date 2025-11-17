import { getBrowser } from './playwright_engine.js';

/**
 * Downloads media from an Instagram URL.
 * @param {string} url - The Instagram URL.
 * @returns {Promise<{title: string, urls: string[]}>}
 */
export const downloadInstagram = async (url) => {
    const browser = await getBrowser();
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Mobile/15E148 Safari/604.1'
    });
    const page = await context.newPage();

    let mediaUrls = [];
    let title = 'instagram_download';

    try {
        // Intercept network requests to find media URLs
        page.on('response', async (response) => {
            try {
                const request = response.request();
                if (request.resourceType() === 'media' || response.url().includes('video_versions')) {
                    mediaUrls.push(response.url());
                } else if (response.url().includes('/api/graphql')) {
                    const json = await response.json();
                    const post = json.data?.xdt_api__v1__media__shortcode__web_info?.items[0];
                    if (post) {
                        title = post.code || title;
                        if (post.video_versions) {
                            post.video_versions.forEach(v => mediaUrls.push(v.url));
                        }
                        if (post.carousel_media) {
                            post.carousel_media.forEach(item => {
                                if (item.video_versions) {
                                    item.video_versions.forEach(v => mediaUrls.push(v.url));
                                } else if (item.image_versions2?.candidates) {
                                    mediaUrls.push(item.image_versions2.candidates[0].url);
                                }
                            });
                        } else if (post.image_versions2?.candidates) {
                            mediaUrls.push(post.image_versions2.candidates[0].url);
                        }
                    }
                }
            } catch (e) {
                // Ignore errors from responses that are not relevant
            }
        });

        await page.goto(url, { waitUntil: 'networkidle' });

        // A short delay to ensure all network requests are captured
        await new Promise(resolve => setTimeout(resolve, 3000));

    } catch (error) {
        console.error('Error during Instagram download:', error);
        throw new Error('Could not download from Instagram.');
    } finally {
        await context.close();
    }

    // Remove duplicates
    const uniqueUrls = [...new Set(mediaUrls)];
    if (uniqueUrls.length === 0) {
        throw new Error('No media found at the provided Instagram link.');
    }

    return { title, urls: uniqueUrls };
};
