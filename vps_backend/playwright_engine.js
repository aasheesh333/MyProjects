import { chromium } from 'playwright';

let browserInstance = null;

/**
 * Initializes and returns a persistent browser instance.
 * @returns {Promise<import('playwright').Browser>}
 */
export const getBrowser = async () => {
    if (!browserInstance) {
        console.log('Initializing new headless browser instance...');
        browserInstance = await chromium.launch({ headless: true });
        console.log('Browser initialized.');
    }
    return browserInstance;
};

/**
 * Closes the persistent browser instance.
 */
export const closeBrowser = async () => {
    if (browserInstance) {
        await browserInstance.close();
        browserInstance = null;
        console.log('Browser instance closed.');
    }
};
