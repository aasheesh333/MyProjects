document.addEventListener('DOMContentLoaded', async () => {
    // --- Global Config ---
    let CONFIG = {};

    // --- DOM Elements ---
    const platformSlider = document.querySelector('.platform-slider');
    const platformContainer = document.querySelector('.platform-selector-container');
    const scrollLeftBtn = document.getElementById('scroll-left-btn');
    const scrollRightBtn = document.getElementById('scroll-right-btn');
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
        'snapchat':    { types: ['mp3', 'mp4'], quality: false, premium: false },
        'dailymotion': { types: ['mp3', 'mp4'], quality: true, premium: false },
        'x-twitter':   { types: ['mp3', 'mp4', 'image'], quality: false, premium: false },
        'linkedin':    { types: ['mp3', 'mp4', 'image'], quality: false, premium: false },
        'reddit':      { types: ['mp3', 'mp4', 'image'], quality: false, premium: false },
        'pinterest':   { types: ['mp3', 'mp4', 'image'], quality: false, premium: false },
        'threads':     { types: ['mp3', 'mp4', 'image'], quality: false, premium: true },
        'shutterstock': { types: ['image', 'mp4'], quality: false, premium: true },
        'viddyoze':    { types: ['mp4'], quality: false, premium: true },
        'storyblocks': { types: ['mp4'], quality: false, premium: true },
        'vimeo':       { types: ['mp3', 'mp4'], quality: true, premium: true }
    };

    let selectedPlatform = 'youtube';
    let pollInterval;

    // --- Config Fetch ---
    async function fetchConfig() {
        try {
            const response = await fetch('/api/config');
            if (!response.ok) throw new Error('Failed to load server configuration.');
            CONFIG = await response.json();
        } catch (error) {
            console.error("CRITICAL ERROR:", error.message);
            alert("Could not load backend configuration. The application will not work.");
        }
    }

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
        updateQualityOptions();
    }

    function updateQualityOptions() {
        const selectedType = typeSelect.value;
        const isQualityVisible = qualityGroup.style.display !== 'none';
        if (isQualityVisible) {
            qualitySelect.querySelectorAll('option').forEach(option => {
                option.style.display = option.dataset.type === selectedType ? 'block' : 'none';
            });
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

    // --- Event Listeners & Download Logic ---
    function forceDownload(url) {
        const oldIframe = document.getElementById('download_iframe');
        if (oldIframe) oldIframe.remove();

        const iframe = document.createElement('iframe');
        iframe.id = 'download_iframe';
        iframe.src = url;
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
    }

    platformSlider.addEventListener('click', (e) => {
        if (e.target.classList.contains('platform-icon')) {
            updateUIForPlatform(e.target.dataset.platform);
        }
    });

    scrollLeftBtn.addEventListener('click', () => platformContainer.scrollBy({ left: -200, behavior: 'smooth' }));
    scrollRightBtn.addEventListener('click', () => platformContainer.scrollBy({ left: 200, behavior: 'smooth' }));
    typeSelect.addEventListener('change', updateQualityOptions);

    async function pollStatus(jobId) {
        pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`${CONFIG.backendUrl}/api/v2/status/${jobId}`, {
                    headers: { 'x-api-key': CONFIG.apiKey }
                });
                if (!response.ok) throw new Error('Could not get job status from backend.');
                const data = await response.json();

                if (data.status === 'completed') {
                    clearInterval(pollInterval);
                    buttonText.textContent = 'Download Ready!';
                    // The backend now provides a full result object
                    const result = data.result;
                    // To ensure downloads work, we now construct the full URL
                    const finalDownloadUrl = `${CONFIG.backendUrl}${result.downloadUrl}`;
                    forceDownload(finalDownloadUrl);
                    setTimeout(() => {
                        downloaderSection.style.display = 'none';
                        downloadStartedSection.style.display = 'block';
                    }, 1000);
                } else if (data.status === 'failed') {
                    clearInterval(pollInterval);
                    alert(`Error: ${data.error || 'Processing failed.'}`);
                    resetUI();
                }
            } catch (error) {
                clearInterval(pollInterval);
                alert(`Error: ${error.message}`);
                resetUI();
            }
        }, 3000); // Polling interval increased slightly
    }

    convertBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        if (!url) {
            alert('Please paste a link first!');
            return;
        }
        if (!CONFIG.backendUrl || !CONFIG.apiKey) {
            alert('Backend configuration is missing. Cannot proceed.');
            return;
        }

        const config = platformConfig[selectedPlatform];
        if (config.premium) {
            alert('This is a premium platform. Please sign up to download from this site.');
            return;
        }

        convertBtn.disabled = true;
        buttonText.textContent = 'Processing...';
        spinner.style.display = 'inline-block';

        try {
            const quality = qualitySelect.value;
            const type = typeSelect.value;

            const response = await fetch(`${CONFIG.backendUrl}/api/v2/download`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': CONFIG.apiKey
                },
                body: JSON.stringify({ url, quality, type, platform: selectedPlatform }),
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'A server error occurred.');
            }

            const data = await response.json();
            if (data.jobId) {
                pollStatus(data.jobId);
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
        convertBtn.disabled = false;
        buttonText.textContent = 'Convert';
        spinner.style.display = 'none';
        if (pollInterval) clearInterval(pollInterval);
        updateUIForPlatform('youtube');
    }

    convertNextBtn.addEventListener('click', resetUI);

    // --- Initial Setup ---
    await fetchConfig();
    updateUIForPlatform(selectedPlatform);
});
