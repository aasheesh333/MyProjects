import { chromium } from 'playwright';

let browserInstance = null;

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
];

const getRandomUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

/**
 * Initializes and returns a persistent, shared browser instance.
 * @returns {Promise<import('playwright').Browser>}
 */
export const getBrowser = async () => {
    if (!browserInstance || !browserInstance.isConnected()) {
        console.log('Initializing new headless Chromium instance...');
        browserInstance = await chromium.launch({ headless: true });
        console.log('Browser initialized successfully.');
    }
    return browserInstance;
};

/**
 * Creates a new, isolated browser context with a random user-agent.
 * @returns {Promise<import('playwright').BrowserContext>}
 */
export const newContext = async () => {
    const browser = await getBrowser();
    return browser.newContext({
        userAgent: getRandomUserAgent(),
        bypassCSP: true, // Bypass Content-Security-Policy
    });
};

/**
 * Closes the persistent browser instance during graceful shutdown.
 */
export const closeBrowser = async () => {
    if (browserInstance) {
        await browserInstance.close();
        browserInstance = null;
        console.log('Headless browser instance closed.');
    }
};
