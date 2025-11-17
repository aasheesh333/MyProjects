import { getBrowser } from './playwright_engine.js';

/**
 * Downloads media from a Facebook URL.
 * @param {string} url - The Facebook URL.
 * @returns {Promise<{title: string, urls: string[]}>}
 */
export const downloadFacebook = async (url) => {
    const browser = await getBrowser();
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });
    const page = await context.newPage();

    let videoUrl = null;
    let title = 'facebook_download';

    try {
        // Listen for responses that could contain the video data
        page.on('response', async (response) => {
            try {
                const request = response.request();
                if (request.resourceType() === 'media' && response.ok()) {
                     videoUrl = response.url();
                }
                else if (response.url().includes('video_data')) {
                     const json = await response.json();
                     if(json?.video_data?.length > 0){
                        videoUrl = json.video_data[0].hd_src || json.video_data[0].sd_src;
                     }
                }
            } catch (e) {
                // Ignore parsing errors for irrelevant responses
            }
        });

        await page.goto(url, { waitUntil: 'networkidle' });

        // Try to get a title from the page
        try {
            const pageTitle = await page.title();
            title = pageTitle.split('|')[0].trim() || title;
        } catch (e) {
            console.warn('Could not extract title from Facebook page.');
        }

        // A short delay to ensure network interception has time to complete
        if (!videoUrl) {
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

    } catch (error) {
        console.error('Error during Facebook download:', error);
        throw new Error('Could not download from Facebook.');
    } finally {
        await context.close();
    }

    if (!videoUrl) {
        throw new Error('No media found at the provided Facebook link.');
    }

    return { title, urls: [videoUrl] };
};
