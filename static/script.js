document.addEventListener('DOMContentLoaded', () => {
    const platformIcons = document.querySelectorAll('.platform-icon');
    const typeSelect = document.getElementById('type-select');
    const qualitySelect = document.getElementById('quality-select');
    const qualityOptions = qualitySelect.querySelectorAll('option');
    const convertBtn = document.getElementById('convert-btn');
    const urlInput = document.getElementById('url-input');
    const downloaderSection = document.getElementById('downloader-section');
    const downloadStartedSection = document.getElementById('download-started-section');
    const convertNextBtn = document.getElementById('convert-next-btn');

    // Add a new element for conversion progress messages
    const processingMessage = document.createElement('p');
    processingMessage.id = 'processing-message';
    processingMessage.style.display = 'none';
    convertBtn.parentNode.insertBefore(processingMessage, convertBtn.nextSibling);

    let selectedPlatform = 'youtube';

    function updateQualityDropdown() {
        const selectedType = typeSelect.value;
        qualityOptions.forEach(option => {
            option.style.display = option.dataset.type === selectedType ? 'block' : 'none';
        });

        // Explicitly set the default quality for the selected type
        if (selectedType === 'mp4') {
            qualitySelect.value = '720';
        } else if (selectedType === 'mp3') {
            qualitySelect.value = '128';
        }
    }

    typeSelect.addEventListener('change', updateQualityDropdown);

    function handlePlatformSelection(platform) {
        selectedPlatform = platform;
        platformIcons.forEach(icon => {
            icon.classList.remove('active');
            if (icon.dataset.platform === platform) icon.classList.add('active');
        });

        // This logic is for YouTube, other platforms can be handled here
        if (platform === 'youtube') {
            document.getElementById('quality-group').style.display = 'flex';
            updateQualityDropdown();
        } else {
            // For simplicity, hide quality selection for other platforms
            document.getElementById('quality-group').style.display = 'none';
        }
    }

    platformIcons.forEach(icon => {
        icon.addEventListener('click', () => {
            handlePlatformSelection(icon.dataset.platform);
        });
    });

    convertBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        if (!url) {
            alert('Please paste a link first!');
            return;
        }

        const originalBtnText = convertBtn.textContent;
        convertBtn.textContent = 'Processing...';
        convertBtn.disabled = true;
        processingMessage.textContent = 'Your download will begin shortly. High-quality conversions may take several minutes...';
        processingMessage.style.display = 'block';

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

            const blob = await response.blob();
            const header = response.headers.get('Content-Disposition');
            const parts = header.split(';');
            let filename = 'download';
            parts.forEach(part => {
                if (part.trim().startsWith('filename=')) {
                    filename = part.split('=')[1].replace(/"/g, '');
                }
            });

            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = decodeURIComponent(filename);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);

            downloaderSection.style.display = 'none';
            downloadStartedSection.style.display = 'block';

        } catch (error) {
            alert(`Error: ${error.message}`);
        } finally {
            convertBtn.textContent = originalBtnText;
            convertBtn.disabled = false;
            processingMessage.style.display = 'none';
        }
    });

    function resetUI() {
        urlInput.value = '';
        downloaderSection.style.display = 'block';
        downloadStartedSection.style.display = 'none';
        handlePlatformSelection('youtube');
    }

    convertNextBtn.addEventListener('click', resetUI);

    // --- Initial Setup ---
    function initializeDefaults() {
        typeSelect.value = 'mp3';
        qualitySelect.value = '128'; // Default MP3 quality
        updateQualityDropdown();
    }

    // Set initial state when the page loads
    initializeDefaults();

    // Also reset to defaults when 'youtube' is selected (or page is reset)
    handlePlatformSelection(selectedPlatform);
});
