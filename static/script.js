document.addEventListener('DOMContentLoaded', () => {
    const platformConfig = {
        'youtube': { types: ['MP3', 'MP4'], premium: false },
        'instagram': { types: ['MP3', 'MP4', 'Image'], premium: false },
        'facebook': { types: ['MP3', 'MP4', 'Image'], premium: false },
        'tiktok': { types: ['MP3', 'MP4'], premium: false },
        'pinterest': { types: ['MP3', 'MP4', 'Image'], premium: false },
        'snapchat': { types: ['MP3', 'MP4'], premium: false },
        'dailymotion': { types: ['MP3', 'MP4'], premium: false },
        'x-twitter': { types: ['MP3', 'MP4', 'Image'], premium: false },
        'linkedin': { types: ['MP3', 'MP4', 'Image'], premium: false },
        'reddit': { types: ['MP3', 'MP4', 'Image'], premium: false },
        'threads': { types: ['MP3', 'MP4', 'Image'], premium: true },
        'shutterstock': { types: ['MP3', 'MP4', 'Image'], premium: true },
        'viddyoze': { types: ['MP3', 'MP4'], premium: true },
        'storyblocks': { types: ['MP3', 'MP4'], premium: true },
        'vimeo': { types: ['MP3', 'MP4'], premium: true }
    };

    const qualityConfig = {
        'MP3': ['320 kbps', '256 kbps', '128 kbps', '96 kbps'],
        'MP4': ['1080p', '720p', '480p', '360p', '144p']
    };

    const platformIcons = document.querySelectorAll('.platform-icon');
    let selectedPlatform = 'youtube'; // Default selection

    const scroller = document.querySelector('.platform-slider');
    const scrollLeftBtn = document.getElementById('scroll-left-btn');
    const scrollRightBtn = document.getElementById('scroll-right-btn');
    const urlInput = document.getElementById('url-input');
    const convertBtn = document.getElementById('convert-btn');
    const convertBtnText = document.querySelector('.button-text');
    const spinner = document.querySelector('.spinner');
    const downloaderSection = document.getElementById('downloader-section');
    const downloadStartedSection = document.getElementById('download-started-section');
    const convertNextBtn = document.getElementById('convert-next-btn');

    scrollLeftBtn.addEventListener('click', () => scroller.scrollBy({ left: -200, behavior: 'smooth' }));
    scrollRightBtn.addEventListener('click', () => scroller.scrollBy({ left: 200, behavior: 'smooth' }));

    const typeSelect = document.getElementById('type-select');
    const qualitySelect = document.getElementById('quality-select');
    const qualityGroup = document.getElementById('quality-group');

    function updateQualityOptions() {
        const selectedType = typeSelect.value.toUpperCase();
        if (selectedType === 'IMAGE' || selectedPlatform !== 'youtube') {
            qualityGroup.style.display = 'none';
        } else {
            qualityGroup.style.display = 'block';
            qualitySelect.innerHTML = '';
            const qualities = qualityConfig[selectedType] || [];
            qualities.forEach(quality => {
                const option = document.createElement('option');
                option.value = quality.split(' ')[0];
                option.textContent = quality;
                qualitySelect.appendChild(option);
            });
             // Set default quality
            if (selectedType === 'MP3') qualitySelect.value = '128';
            if (selectedType === 'MP4') qualitySelect.value = '720';
        }
    }

    function updateDropdowns() {
        const config = platformConfig[selectedPlatform];
        typeSelect.innerHTML = '';
        config.types.forEach(type => {
            const option = document.createElement('option');
            option.value = type.toLowerCase();
            option.textContent = type;
            typeSelect.appendChild(option);
        });
        updateQualityOptions();
    }

    typeSelect.addEventListener('change', updateQualityOptions);

    platformIcons.forEach(icon => {
        icon.addEventListener('click', () => {
            const platform = icon.dataset.platform;
            const config = platformConfig[platform];
            if (config.premium) {
                alert('This is a premium feature. Please sign up to use it.');
                return;
            }
            platformIcons.forEach(i => i.classList.remove('active'));
            icon.classList.add('active');
            selectedPlatform = platform;
            updateDropdowns();
        });
    });

    function setButtonState(isProcessing) {
        if (isProcessing) {
            convertBtn.disabled = true;
            spinner.style.display = 'inline-block';
            convertBtnText.textContent = 'Processing...';
        } else {
            convertBtn.disabled = false;
            spinner.style.display = 'none';
            convertBtnText.textContent = 'Convert';
        }
    }

    function triggerDownload(url) {
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = '';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => document.body.removeChild(a), 5000);
    }

    function pollJobStatus(jobId) {
        const interval = setInterval(async () => {
            try {
                const response = await fetch(`/api/status/${jobId}`);
                const data = await response.json();

                if (data.status === 'completed') {
                    clearInterval(interval);
                    setButtonState(false);
                    downloaderSection.style.display = 'none';
                    downloadStartedSection.style.display = 'block';

                    if (data.urls && Array.isArray(data.urls)) {
                        // Carousel: Download each file
                        data.urls.forEach((url, index) => {
                            setTimeout(() => triggerDownload(url), index * 1000);
                        });
                    } else if (data.url) {
                        // Single file
                        triggerDownload(data.url);
                    }
                } else if (data.status === 'failed') {
                    clearInterval(interval);
                    setButtonState(false);
                    alert(`Download failed: ${data.error || 'An unknown error occurred.'}`);
                }
            } catch (error) {
                clearInterval(interval);
                setButtonState(false);
                alert('An error occurred while checking the download status.');
            }
        }, 3000);
    }

    convertBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        if (!url) {
            alert('Please paste a valid URL.');
            return;
        }

        setButtonState(true);

        try {
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url,
                    quality: qualitySelect.value,
                    type: typeSelect.value,
                    platform: selectedPlatform
                })
            });

            const data = await response.json();

            if (response.status !== 200) {
                 throw new Error(data.error || 'Failed to start download.');
            }

            if (data.status === 'completed') {
                setButtonState(false);
                downloaderSection.style.display = 'none';
                downloadStartedSection.style.display = 'block';

                if (data.urls && Array.isArray(data.urls)) {
                    data.urls.forEach((url, index) => {
                        setTimeout(() => triggerDownload(url), index * 1000);
                    });
                } else if (data.url) {
                    triggerDownload(data.url);
                }
            } else if (data.jobId) {
                pollJobStatus(data.jobId);
            } else {
                 throw new Error('Invalid response from server.');
            }
        } catch (error) {
            setButtonState(false);
            alert(`Error: ${error.message}`);
        }
    });

    convertNextBtn.addEventListener('click', () => {
        downloadStartedSection.style.display = 'none';
        downloaderSection.style.display = 'block';
        urlInput.value = '';
    });

    // Initial setup
    updateDropdowns();
});
