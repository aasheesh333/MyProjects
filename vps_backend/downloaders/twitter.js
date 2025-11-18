import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
const PLATFORM_IDENTIFIER = 'twitter';

export async function download({ url, contentType, quality }) {
    try {
        const { data: html } = await axios.get(url, { headers: { 'User-Agent': USER_AGENT } });
        const $ = cheerio.load(html);

        const scriptTag = $('#__NEXT_DATA__').html();
        if (!scriptTag) {
            return { success: false, error: "Could not find Twitter's data script. The page structure may have changed or the tweet is protected.", platform: PLATFORM_IDENTIFIER };
        }

        const data = JSON.parse(scriptTag);
        const tweetData = data.props.pageProps.trpcState.json.queries[0].state.data.tweetResult.result;

        if (!tweetData || !tweetData.legacy) {
            return { success: false, error: "Failed to find tweet data in the JSON structure.", platform: PLATFORM_IDENTIFIER };
        }

        const title = tweetData.legacy.full_text.split(' http')[0];
        const media = tweetData.legacy.extended_entities?.media[0];

        if (!media) {
            return { success: false, error: "This tweet does not appear to contain any media.", platform: PLATFORM_IDENTIFIER };
        }

        const thumbnail = media.media_url_https;
        let downloadUrl, finalContentType, mimeType, qualityLabel = 'default';

        if (media.type === 'video' && media.video_info?.variants) {
            const videoVariants = media.video_info.variants
                .filter(v => v.content_type === 'video/mp4')
                .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

            if (videoVariants.length === 0) {
                 return { success: false, error: "No MP4 video variants found.", platform: PLATFORM_IDENTIFIER };
            }

            downloadUrl = videoVariants[0].url;
            finalContentType = 'mp4';
            mimeType = 'video/mp4';
            qualityLabel = `${media.sizes.large.h}p`; // Approximate quality

        } else if (media.type === 'photo') {
            downloadUrl = media.media_url_https;
            finalContentType = 'image';
            mimeType = 'image/jpeg';
        } else {
            return { success: false, error: "Unsupported media type found in tweet.", platform: PLATFORM_IDENTIFIER };
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
            quality: qualityLabel
        };
    } catch (error) {
        return { success: false, error: "Failed to process Twitter URL. The tweet may be private, deleted, or its data structure has changed.", platform: PLATFORM_IDENTIFIER };
    }
}
