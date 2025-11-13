document.addEventListener('DOMContentLoaded', () => {
    const typeSelect = document.getElementById('type-select');
    const qualitySelect = document.getElementById('quality-select');
    const qualityOptions = qualitySelect.querySelectorAll('option');
    const convertBtn = document.getElementById('convert-btn');
    const urlInput = document.getElementById('url-input');
    const downloaderSection = document.getElementById('downloader-section');
    const downloadStartedSection = document.getElementById('download-started-section');
    const convertNextBtn = document.getElementById('convert-next-btn');

    // --- New Progress Bar Elements ---
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
    // --- End New Elements ---

    let pollInterval;

    function updateQualityDropdown() {
        const selectedType = typeSelect.value;
        qualityOptions.forEach(option => {
            option.style.display = option.dataset.type === selectedType ? 'block' : 'none';
        });
        if (selectedType === 'mp4') {
            qualitySelect.value = '720';
        } else if (selectedType === 'mp3') {
            qualitySelect.value = '128';
        }
    }

    typeSelect.addEventListener('change', updateQualityDropdown);

    async function pollStatus(jobId) {
        pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`/api/status/${jobId}`);
                if (!response.ok) {
                    throw new Error('Could not get job status.');
                }
                const data = await response.json();

                progressStatus.textContent = `Status: ${data.status}`;
                if (data.status === 'queued') {
                    progressBarInner.style.width = '25%';
                } else if (data.status === 'processing') {
                    progressBarInner.style.width = '60%';
                } else if (data.status === 'completed') {
                    clearInterval(pollInterval);
                    progressBarInner.style.width = '100%';
                    progressStatus.textContent = 'Download Ready!';
                    window.location.href = data.url; // Start download immediately

                    // Show the 'Convert Next' screen after a short delay
                    setTimeout(() => {
                        downloaderSection.style.display = 'none';
                        downloadStartedSection.style.display = 'block';
                    }, 1000);

                } else if (data.status === 'failed') {
                    clearInterval(pollInterval);
                    alert(`Error: ${data.error}`);
                    resetUI();
                }
            } catch (error) {
                clearInterval(pollInterval);
                alert(`Error: ${error.message}`);
                resetUI();
            }
        }, 2000); // Poll every 2 seconds
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

            const response = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, quality, type }),
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'A server error occurred.');
            }

            const data = await response.json();

            if (data.jobId) {
                // It's a queued job, start polling
                pollStatus(data.jobId);
            } else if (data.status === 'completed' && data.url) {
                // It was a cached result, download immediately
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

        initializeDefaults();
    }

    convertNextBtn.addEventListener('click', resetUI);

    function initializeDefaults() {
        typeSelect.value = 'mp3';
        updateQualityDropdown();
    }

    initializeDefaults();
});
