import axios from 'axios';

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const PLATFORM_IDENTIFIER = 'reddit';

export async function download({ url, contentType, quality }) {
    try {
        const jsonUrl = url.endsWith('.json') ? url : `${url}.json`;
        const { data } = await axios.get(jsonUrl, { headers: { 'User-Agent': USER_AGENT } });

        const post = data[0]?.data?.children[0]?.data;
        if (!post) {
            return { success: false, error: "Failed to find post data in the JSON response.", platform: PLATFORM_IDENTIFIER };
        }

        const title = post.title || 'Reddit Content';
        const thumbnail = post.thumbnail || '';

        let downloadUrl, finalContentType, mimeType, qualityLabel = 'default';

        const isVideo = post.is_video && post.media?.reddit_video?.fallback_url;
        const isImage = post.url_overridden_by_dest && !post.is_self && !isVideo;

        if (contentType === 'mp4' && isVideo) {
            downloadUrl = post.media.reddit_video.fallback_url;
            finalContentType = 'mp4';
            mimeType = 'video/mp4';
            qualityLabel = `${post.media.reddit_video.height}p`;
        } else if (contentType === 'image' && isImage) {
            downloadUrl = post.url_overridden_by_dest;
            finalContentType = 'image';
            mimeType = 'image/jpeg';
        } else if (isVideo) { // Fallback
            downloadUrl = post.media.reddit_video.fallback_url;
            finalContentType = 'mp4';
            mimeType = 'video/mp4';
            qualityLabel = `${post.media.reddit_video.height}p`;
        } else if (isImage) {
            downloadUrl = post.url_overridden_by_dest;
            finalContentType = 'image';
            mimeType = 'image/jpeg';
        } else {
            return { success: false, error: "This Reddit post does not contain a direct video or image link.", platform: PLATFORM_IDENTIFIER };
        }

        downloadUrl = downloadUrl.split('?')[0];
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
            quality: qualityLabel
        };
    } catch (error) {
        return { success: false, error: "Failed to process Reddit URL. The post may be private or deleted.", platform: PLATFORM_IDENTIFIER };
    }
}
