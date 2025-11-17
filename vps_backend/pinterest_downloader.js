import { getBrowser } from './playwright_engine.js';

/**
 * Downloads media from a Pinterest URL.
 * @param {string} url - The Pinterest URL.
 * @returns {Promise<{title: string, urls: string[]}>}
 */
export const downloadPinterest = async (url) => {
    const browser = await getBrowser();
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });
    const page = await context.newPage();

    let mediaUrl = null;
    let title = 'pinterest_download';

    try {
        // Pinterest often embeds the direct video URL in the page source or a JSON blob
        await page.goto(url, { waitUntil: 'domcontentloaded' });

        // Wait for a potential video element to be available
        try {
            await page.waitForSelector('video', { timeout: 5000 });
            mediaUrl = await page.locator('video').first().getAttribute('src');
        } catch(e) {
            console.log('No video element found, will check for images.');
        }

        // If no video, look for the main pin image
        if (!mediaUrl) {
             try {
                await page.waitForSelector('img[data-test-id="pin-closeup-image"]', { timeout: 3000 });
                mediaUrl = await page.locator('img[data-test-id="pin-closeup-image"]').first().getAttribute('src');
             } catch(e){
                // Fallback if the main selector fails
                console.log('Primary image selector failed, trying fallback.');
                mediaUrl = await page.locator('img').first().getAttribute('src');
             }
        }

        // Try to get a title
        try {
            title = await page.locator('h1').first().innerText();
        } catch (e) {
            console.warn('Could not extract title from Pinterest page.');
        }

    } catch (error) {
        console.error('Error during Pinterest download:', error);
        throw new Error('Could not download from Pinterest.');
    } finally {
        await context.close();
    }

    if (!mediaUrl) {
        throw new Error('No media found at the provided Pinterest link.');
    }

    return { title, urls: [mediaUrl] };
};
