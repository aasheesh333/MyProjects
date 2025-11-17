import { Innertube } from 'youtubei.js';

/**
 * Downloads media from a YouTube URL.
 * @param {string} url - The YouTube URL.
 * @param {string} type - 'mp3' or 'mp4'.
 * @returns {Promise<{title: string, urls: string[]}>}
 */
export const downloadYouTube = async (url, type) => {
    try {
        const youtube = await Innertube.create();
        const info = await youtube.getInfo(url);

        const title = info.basic_info.title || 'youtube_download';
        let format;

        if (type === 'mp3') {
            // Find the best audio-only format (usually itag 140 for m4a)
            format = info.formats.find(f => f.itag === 140);
        } else {
            // Find a reasonable quality video format with both video and audio (e.g., itag 18 for 360p)
            format = info.formats.find(f => f.itag === 18);
        }

        if (!format) {
            // As a fallback, try to get any streaming URL
            const stream = await youtube.download(url, { type: type === 'mp3' ? 'audio' : 'video' });
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            // This is not ideal as it buffers the whole file in memory, but it's a fallback.
            // A proper implementation would stream this to a file.
            // For now, we will just return the format URL if found.
            throw new Error('Could not find a direct stream URL. Streaming download not yet implemented.');
        }

        return { title, urls: [format.url] };
    } catch (error) {
        console.error('Error during YouTube download:', error);
        throw new Error('Could not download from YouTube.');
    }
};
