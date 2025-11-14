document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const platformSlider = document.querySelector('.platform-slider');
    const typeSelect = document.getElementById('type-select');
    const qualityGroup = document.getElementById('quality-group');
    const qualitySelect = document.getElementById('quality-select');
    const convertBtn = document.getElementById('convert-btn');
    const buttonText = convertBtn.querySelector('.button-text');
    const spinner = convertBtn.querySelector('.spinner');
    const urlInput = document.getElementById('url-input');
    const downloaderSection = document.getElementById('downloader-section');
    const downloadStartedSection = document.getElementById('download-started-section');
    const convertNextBtn = document.getElementById('convert-next-btn');

    // --- Platform Configuration ---
    const platformConfig = {
        'youtube':     { types: ['mp3', 'mp4'], quality: true, premium: false },
        'instagram':   { types: ['mp3', 'mp4', 'image'], quality: false, premium: false },
        'facebook':    { types: ['mp3', 'mp4', 'image'], quality: false, premium: false },
        'tiktok':      { types: ['mp3', 'mp4'], quality: false, premium: false },
        'snapchat':    { types: ['mp4'], quality: false, premium: false },
        'dailymotion': { types: ['mp3', 'mp4'], quality: true, premium: false },
        'x-twitter':   { types: ['mp3', 'mp4', 'image'], quality: false, premium: false },
        'linkedin':    { types: ['mp3', 'mp4', 'image'], quality: false, premium: false },
        'reddit':      { types: ['mp3', 'mp4', 'image'], quality: false, premium: false },
        'pinterest':   { types: ['mp3', 'mp4', 'image'], quality: false, premium: false },
        'threads':     { types: ['mp4', 'image'], quality: false, premium: true },
        'shutterstock': { types: ['image', 'mp4'], quality: false, premium: true },
        'viddyoze':    { types: ['mp4'], quality: false, premium: true },
        'storyblocks': { types: ['mp4'], quality: false, premium: true },
        'vimeo':       { types: ['mp3', 'mp4'], quality: true, premium: true }
    };

    let selectedPlatform = 'youtube';
    let pollInterval;

    // --- UI Update Functions ---
    function updateUIForPlatform(platform) {
        selectedPlatform = platform;
        const config = platformConfig[platform];

        document.querySelectorAll('.platform-icon').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.platform === platform);
        });

        typeSelect.innerHTML = '';
        config.types.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type.toUpperCase();
            typeSelect.appendChild(option);
        });

        qualityGroup.style.display = config.quality ? 'block' : 'none';
        updateQualityOptions(); // Fix for YouTube quality bug
    }

    // NEW: Function to fix the YouTube quality display bug
    function updateQualityOptions() {
        const selectedType = typeSelect.value;
        const isQualityVisible = qualityGroup.style.display !== 'none';

        if (isQualityVisible) {
            qualitySelect.querySelectorAll('option').forEach(option => {
                option.style.display = option.dataset.type === selectedType ? 'block' : 'none';
            });
            // Set a default value if the current one is hidden
            if (qualitySelect.selectedOptions.length === 0 || qualitySelect.selectedOptions[0].style.display === 'none') {
                for (let option of qualitySelect.options) {
                    if (option.style.display !== 'none') {
                        option.selected = true;
                        break;
                    }
                }
            }
        }
    }

    // --- Event Listeners ---
    platformSlider.addEventListener('click', (e) => {
        if (e.target.classList.contains('platform-icon')) {
            updateUIForPlatform(e.target.dataset.platform);
        }
    });

    typeSelect.addEventListener('change', updateQualityOptions);

    async function pollStatus(jobId) {
        pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`/api/status/${jobId}`);
                if (!response.ok) throw new Error('Could not get job status.');
                const data = await response.json();

                if (data.status === 'completed') {
                    clearInterval(pollInterval);
                    buttonText.textContent = 'Download Ready!';
                    window.location.href = data.url;
                    setTimeout(() => {
                        downloaderSection.style.display = 'none';
                        downloadStartedSection.style.display = 'block';
                    }, 1000);
                } else if (data.status === 'failed') {
                    clearInterval(pollInterval);
                    alert(`Error: ${data.error || 'Processing failed.'}`);
                    resetUI();
                }
                // No need for queued/processing text update here, it's on the button
            } catch (error) {
                clearInterval(pollInterval);
                alert(`Error: ${error.message}`);
                resetUI();
            }
        }, 2000);
    }

    convertBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        if (!url) {
            alert('Please paste a link first!');
            return;
        }

        // NEW: Premium platform check
        const config = platformConfig[selectedPlatform];
        if (config.premium) {
            alert('This is a premium platform. Please sign up to download from this site.');
            return;
        }

        // NEW: Improved button state
        convertBtn.disabled = true;
        buttonText.textContent = 'Processing...';
        spinner.style.display = 'inline-block';

        try {
            const quality = qualitySelect.value;
            const type = typeSelect.value;

            const response = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, quality, type, platform: selectedPlatform }),
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'A server error occurred.');
            }

            const data = await response.json();
            if (data.jobId) {
                pollStatus(data.jobId);
            } else if (data.status === 'completed' && data.url) {
                buttonText.textContent = 'Download Ready!';
                window.location.href = data.url;
                setTimeout(() => {
                    downloaderSection.style.display = 'none';
                    downloadStartedSection.style.display = 'block';
                }, 1000);
            }
        } catch (error) {
            alert(`Error: ${error.message}`);
            resetUI();
        }
    });

    function resetUI() {
        urlInput.value = '';
        downloaderSection.style.display = 'block';
        downloadStartedSection.style.display = 'none';

        // NEW: Reset button state
        convertBtn.disabled = false;
        buttonText.textContent = 'Convert';
        spinner.style.display = 'none';

        if (pollInterval) clearInterval(pollInterval);
        updateUIForPlatform('youtube');
    }

    convertNextBtn.addEventListener('click', resetUI);

    // --- Initial Setup ---
    updateUIForPlatform(selectedPlatform);
});
