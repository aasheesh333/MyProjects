// ===================================================================================
// JUSDOWN UNIVERSAL DOWNLOADER TEMPLATE
// ===================================================================================
//
// HOW TO ADD A NEW PLATFORM:
// 1. COPY this file and rename it to the platform's name (e.g., `vimeo.js`).
//    The filename (without .js) will be used as the platform identifier (e.g., "vimeo").
//
// 2. IMPORT necessary libraries. `axios` and `cheerio` are usually required.
//
// 3. IMPLEMENT the `download` function. This is the only function you need to write.
//
// 4. INSIDE the `download` function:
//    a. Fetch the page content (HTML or JSON) using `axios`.
//    b. Parse the content to find the media data.
//       - For HTML, use `cheerio.load(html)`.
//       - Look for JSON data embedded in `<script>` tags (a very common technique).
//    c. Extract the required information: `title`, `thumbnail`, and `downloadUrl`.
//    d. Handle different content types (`mp4`, `mp3`, `image`) if the platform supports them.
//
// 5. RETURN the standardized success or error object.
//    - On success, the object MUST match the specified format.
//    - On failure, throw an error or return a success:false object. The server will handle it.
//
// 6. PLACE the new file in the `/downloaders` directory. The server will automatically
//    detect and load it on the next startup. NO server code changes are needed.
//
// ===================================================================================

import axios from 'axios';
import cheerio from 'cheerio';

// --- HELPER CONSTANTS (Optional, but recommended) ---

// A standard browser User-Agent can help avoid being blocked.
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const PLATFORM_IDENTIFIER = 'template'; // Change this to the actual platform name

/**
 * The main download function.
 * @param {object} options - The options for the download.
 * @param {string} options.url - The URL of the content to download.
 * @param {string} options.contentType - The desired content type ('mp4', 'mp3', 'image').
 * @param {string} [options.quality] - The desired quality (e.g., '720p', '1080p'), if applicable.
 * @returns {Promise<object>} - A promise that resolves to the standardized success or error object.
 */
export async function download({ url, contentType, quality }) {
    try {
        // -----------------------------------------------------------------------------------
        // STEP 1: Fetch the webpage HTML using axios
        // -----------------------------------------------------------------------------------
        const response = await axios.get(url, {
            headers: { 'User-Agent': USER_AGENT }
        });
        const html = response.data;

        // -----------------------------------------------------------------------------------
        // STEP 2: Parse the HTML and find the media data
        // -----------------------------------------------------------------------------------
        // Load the HTML into cheerio to make it searchable, like jQuery.
        const $ = cheerio.load(html);

        // --- Data Extraction Strategy ---
        // Modern websites often embed a JSON object with all the page data in a <script> tag.
        // Your goal is to find that script tag and parse its content.
        // Common places to find this data:
        // - A `<script type="application/ld+json">` tag.
        // - A `<script>` tag where the content starts with `window.__INITIAL_STATE__ = { ... };`
        // - A `<script>` tag containing a large JSON object.

        // Example: Find a script tag with a specific ID
        // const scriptTag = $('#__NEXT_DATA__').html();
        // if (!scriptTag) {
        //     throw new Error("Could not find the data script tag. The website structure may have changed.");
        // }
        // const data = JSON.parse(scriptTag);

        // --- Placeholder Extraction Logic (REPLACE THIS) ---
        // This is where you will write the specific logic for the new platform.
        // You'll need to inspect the target website's HTML to figure out where the data is.
        const title = $('title').text() || 'Untitled'; // Placeholder
        const thumbnail = $('meta[property="og:image"]').attr('content') || ''; // Placeholder
        let downloadUrl; // This is the most important variable to find.

        // Example check for content type
        if (contentType === 'mp4') {
            // Find the video URL from the parsed data
            // downloadUrl = data.video.url; // Example
        } else if (contentType === 'image') {
            // Find the image URL from the parsed data
            // downloadUrl = data.image.url; // Example
        } else {
            throw new Error(`Content type '${contentType}' is not supported for this platform.`);
        }

        // A simple placeholder since this is a template
        downloadUrl = 'https://example.com/placeholder_media.mp4';

        if (!downloadUrl) {
            throw new Error("Failed to extract the direct download URL.");
        }

        // -----------------------------------------------------------------------------------
        // STEP 3: Return the standardized success object
        // -----------------------------------------------------------------------------------
        const filename = `${title.substring(0, 50)}.${contentType}`;
        const mimeType = contentType === 'mp4' ? 'video/mp4' : 'image/jpeg'; // Adjust as needed

        return {
            success: true,
            platform: PLATFORM_IDENTIFIER,
            title,
            thumbnail,
            downloadUrl,
            filename,
            mimeType,
            contentType,
            quality: quality || 'default', // Return the requested quality or a default
        };

    } catch (error) {
        // -----------------------------------------------------------------------------------
        // STEP 4: Handle errors gracefully
        // -----------------------------------------------------------------------------------
        // If anything goes wrong, catch the error and return a standardized error object.
        // The server will NOT crash. It will report the error to the user.
        console.error(`[${PLATFORM_IDENTIFIER}] Error downloading from ${url}:`, error.message);

        return {
            success: false,
            platform: PLATFORM_IDENTIFIER,
            error: error.message || "An unknown error occurred during the download process.",
        };
    }
}
