document.addEventListener('DOMContentLoaded', () => {
    const videoUrlDisplay = document.getElementById('video-url-display');
    const qualitySelect = document.getElementById('quality-select');
    const convertBtn = document.getElementById('convert-btn');
    const downloadStartedSection = document.getElementById('download-started-section');
    const convertNextBtn = document.getElementById('convert-next-btn');
    const downloaderSection = document.getElementById('downloader-section');

    const urlParams = new URLSearchParams(window.location.search);
    const youtubeUrl = urlParams.get('url');

    let videoTitle = '';

    if (!youtubeUrl) {
        downloaderSection.innerHTML = '<h2>Error: No YouTube URL provided. Please go back and try again.</h2>';
        return;
    }

    videoUrlDisplay.textContent = `URL: ${youtubeUrl}`;

    async function fetchFormatsFromServer() {
        try {
            const response = await fetch('/api/youtube-info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: youtubeUrl }),
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Failed to fetch formats from server.');
            }

            const data = await response.json();
            videoTitle = data.title;
            const formats = data.formats || [];

            qualitySelect.innerHTML = ''; // Clear "Loading..."

            if (formats.length === 0) {
                qualitySelect.innerHTML = '<option>No formats found.</option>';
                convertBtn.disabled = true;
                return;
            }

            formats.forEach(format => {
                const option = document.createElement('option');
                option.value = format.url;
                option.textContent = format.text;
                qualitySelect.appendChild(option);
            });

        } catch (error) {
            console.error('Error fetching formats:', error);
            qualitySelect.innerHTML = '<option>Could not fetch formats.</option>';
            convertBtn.textContent = 'Error';
            convertBtn.disabled = true;
        }
    }

    fetchFormatsFromServer();

    convertBtn.addEventListener('click', () => {
        const downloadUrl = qualitySelect.value;
        if (!downloadUrl) {
            alert('Please select a format to download.');
            return;
        }

        const selectedOptionText = qualitySelect.options[qualitySelect.selectedIndex].text;
        const fileExtension = selectedOptionText.includes('Video') ? 'mp4' : 'm4a';
        const safeTitle = (videoTitle || 'download').replace(/[^a-zA-Z0-9\s-]/g, '').trim();

        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${safeTitle}.${fileExtension}`;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        downloaderSection.style.display = 'none';
        downloadStartedSection.style.display = 'block';
    });

    convertNextBtn.addEventListener('click', () => {
        window.location.href = '/';
    });
});
