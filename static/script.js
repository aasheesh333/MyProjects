document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const platformSlider = document.querySelector('.platform-slider');
    const typeSelect = document.getElementById('type-select');
    const qualityGroup = document.getElementById('quality-group');
    const qualitySelect = document.getElementById('quality-select');
    const convertBtn = document.getElementById('convert-btn');
    const urlInput = document.getElementById('url-input');
    const downloaderSection = document.getElementById('downloader-section');
    const downloadStartedSection = document.getElementById('download-started-section');
    const convertNextBtn = document.getElementById('convert-next-btn');

    // --- Platform Configuration ---
    const platformConfig = {
        'youtube': { types: ['mp3', 'mp4'], quality: true },
        'instagram': { types: ['mp4', 'image'], quality: false },
        'facebook': { types: ['mp3', 'mp4'], quality: true },
        'tiktok': { types: ['mp3', 'mp4'], quality: false },
        'snapchat': { types: ['mp4'], quality: false },
        'dailymotion': { types: ['mp3', 'mp4'], quality: true },
        'x-twitter': { types: ['mp4', 'image'], quality: false },
        'linkedin': { types: ['mp4'], quality: false },
        'reddit': { types: ['mp3', 'mp4'], quality: true },
        'pinterest': { types: ['image'], quality: false },
        'threads': { types: ['mp4', 'image'], quality: false },
        'shutterstock': { types: ['image', 'mp4'], quality: false }, // Assuming video/image
        'viddyoze': { types: ['mp4'], quality: true }, // Assuming quality matters
        'storyblocks': { types: ['mp4'], quality: true }, // Assuming quality matters
        'vimeo': { types: ['mp3', 'mp4'], quality: true }
    };

    let selectedPlatform = 'youtube'; // Default platform

    // --- Progress Bar Elements ---
    const progressContainer = document.createElement('div');
    progressContainer.className = 'progress-container';
    progressContainer.style.display = 'none';
    const progressStatus = document.createElement('p');
    progressStatus.id = 'progress-status';
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    const progressBarInner = document.createElement('div');
    progressBarInner.className = 'progress-bar-inner';
    progressBar.appendChild(progressBarInner);
    progressContainer.appendChild(progressStatus);
    progressContainer.appendChild(progressBar);
    downloaderSection.appendChild(progressContainer);

    let pollInterval;

    // --- UI Update Functions ---
    function updateUIForPlatform(platform) {
        selectedPlatform = platform;
        const config = platformConfig[platform];

        // Update active button style
        document.querySelectorAll('.platform-icon').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.platform === platform);
        });

        // Update content type dropdown
        typeSelect.innerHTML = ''; // Clear existing options
        config.types.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type.toUpperCase();
            typeSelect.appendChild(option);
        });

        // Show/hide quality dropdown
        qualityGroup.style.display = config.quality ? 'block' : 'none';
    }

    // --- Event Listeners ---
    platformSlider.addEventListener('click', (e) => {
        if (e.target.classList.contains('platform-icon')) {
            const platform = e.target.dataset.platform;
            updateUIForPlatform(platform);
        }
    });

    async function pollStatus(jobId) {
        pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`/api/status/${jobId}`);
                if (!response.ok) throw new Error('Could not get job status.');
                const data = await response.json();

                progressStatus.textContent = `Status: ${data.status}`;
                if (data.status === 'queued') progressBarInner.style.width = '25%';
                else if (data.status === 'processing') progressBarInner.style.width = '60%';
                else if (data.status === 'completed') {
                    clearInterval(pollInterval);
                    progressBarInner.style.width = '100%';
                    progressStatus.textContent = 'Download Ready!';
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

        convertBtn.style.display = 'none';
        progressContainer.style.display = 'block';
        progressStatus.textContent = 'Status: sending request...';
        progressBarInner.style.width = '5%';

        try {
            const quality = qualitySelect.value;
            const type = typeSelect.value;

            // NEW: Send the selected platform to the backend
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
                progressStatus.textContent = 'Status: completed (from cache)';
                progressBarInner.style.width = '100%';
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
        convertBtn.style.display = 'block';
        progressContainer.style.display = 'none';
        progressBarInner.style.width = '0%';
        if(pollInterval) clearInterval(pollInterval);
        // Re-initialize to the default platform
        updateUIForPlatform('youtube');
    }

    convertNextBtn.addEventListener('click', resetUI);

    // --- Initial Setup ---
    updateUIForPlatform(selectedPlatform); // Initialize UI for the default platform
});
