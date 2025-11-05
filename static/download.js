document.addEventListener('DOMContentLoaded', () => {
    const videoUrlDisplay = document.getElementById('video-url-display');
    const qualitySelect = document.getElementById('quality-select');
    const convertBtn = document.getElementById('convert-btn');
    const downloadStartedSection = document.getElementById('download-started-section');
    const convertNextBtn = document.getElementById('convert-next-btn');
    const downloaderSection = document.getElementById('downloader-section');

    const urlParams = new URLSearchParams(window.location.search);
    const youtubeUrl = urlParams.get('url');

    let videoInfo = null; // To store video info and reuse it

    if (!youtubeUrl) {
        downloaderSection.innerHTML = '<h2>Error: No YouTube URL provided. Please go back and try again.</h2>';
        return;
    }

    videoUrlDisplay.textContent = `URL: ${youtubeUrl}`;

    async function initializeDownloader() {
        try {
            const innertube = await Innertube.create({ clientName: "WEB" }); // Use WEB client for browser
            videoInfo = await innertube.getBasicInfo(youtubeUrl);

            const formats = videoInfo.streaming_data.adaptive_formats || [];

            qualitySelect.innerHTML = ''; // Clear "Loading..."

            if (formats.length === 0) {
                 qualitySelect.innerHTML = '<option>No formats found.</option>';
                 convertBtn.disabled = true;
                 return;
            }

            // Populate video formats
            formats
                .filter(f => f.mime_type.includes('video/mp4') && f.quality_label)
                .sort((a, b) => b.height - a.height)
                .forEach(format => {
                    const option = document.createElement('option');
                    option.value = format.itag;
                    option.textContent = `Video ${format.quality_label}` + (format.audio_channels ? '' : ' (No Audio)');
                    qualitySelect.appendChild(option);
                });

            // Populate audio formats
            formats
                .filter(f => f.mime_type.includes('audio/mp4'))
                .sort((a, b) => b.bitrate - a.bitrate)
                .forEach(format => {
                    const option = document.createElement('option');
                    option.value = format.itag;
                    const bitrate = Math.round(format.bitrate / 1000);
                    option.textContent = `Audio ${bitrate}kbps (M4A)`;
                    qualitySelect.appendChild(option);
                });

        } catch (error) {
            console.error('Error fetching formats:', error);
            qualitySelect.innerHTML = '<option>Could not fetch formats.</option>';
            convertBtn.textContent = 'Error';
            convertBtn.disabled = true;
        }
    }

    initializeDownloader();

    convertBtn.addEventListener('click', () => {
        const selectedItag = qualitySelect.value;
        if (!selectedItag || !videoInfo) return;

        try {
            convertBtn.textContent = 'Generating...';
            convertBtn.disabled = true;

            const format = videoInfo.streaming_data.adaptive_formats.find(f => f.itag == selectedItag);

            if (!format || !format.url) {
                 throw new Error('Selected format is not available. Please try another.');
            }

            // The URL is directly available in the browser context, no deciphering needed
            const downloadUrl = format.url;

            const a = document.createElement('a');
            a.href = downloadUrl;
            // Add title and extension for a clean filename
            const fileExtension = format.mime_type.includes('video') ? 'mp4' : 'm4a';
            const safeTitle = (videoInfo.basic_info.title || 'download').replace(/[^a-zA-Z0-9\s-]/g, '').trim();
            a.download = `${safeTitle}.${fileExtension}`;

            // This is a workaround for cross-origin download issues
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            downloaderSection.style.display = 'none';
            downloadStartedSection.style.display = 'block';

        } catch (error) {
            console.error('Download error:', error);
            alert(`Failed to get download link: ${error.message}`);
            convertBtn.textContent = 'Download';
            convertBtn.disabled = false;
        }
    });

    convertNextBtn.addEventListener('click', () => {
        window.location.href = '/';
    });
});
