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

    let selectedPlatform = 'youtube';

    // --- New Simplified UI Logic ---

    function updateQualityDropdown() {
        const selectedType = typeSelect.value; // 'mp3' or 'mp4'

        // Hide all options first
        qualityOptions.forEach(option => {
            option.style.display = 'none';
        });

        // Show options that match the selected content type
        const relevantOptions = Array.from(qualityOptions).filter(option => option.dataset.type === selectedType);
        relevantOptions.forEach(option => {
            option.style.display = 'block';
        });

        // Select the first visible option by default
        if (relevantOptions.length > 0) {
            qualitySelect.value = relevantOptions[0].value;
        }
    }

    typeSelect.addEventListener('change', updateQualityDropdown);

    function handlePlatformSelection(platform) {
        selectedPlatform = platform;
        platformIcons.forEach(icon => {
            icon.classList.remove('active');
            if (icon.dataset.platform === platform) {
                icon.classList.add('active');
            }
        });

        // For now, the new logic only applies to YouTube.
        // Other platforms can have their own logic added here later.
        if (platform === 'youtube') {
            typeSelect.value = 'mp3'; // Default to MP3
            updateQualityDropdown();
        } else {
            // Hide quality for non-YouTube platforms for now
             document.getElementById('quality-group').style.display = 'none';
        }
    }

    platformIcons.forEach(icon => {
        icon.addEventListener('click', () => {
            const platform = icon.dataset.platform;
            if (icon.classList.contains('premium')) {
                alert('This is a premium platform. Please sign up to continue.');
                window.location.href = 'signup.html';
                return;
            }
            handlePlatformSelection(platform);
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

        try {
            if (selectedPlatform === 'youtube') {
                const quality = qualitySelect.value;
                const type = typeSelect.value;

                const response = await fetch('/api/get-link', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url, quality, type, platform: selectedPlatform }),
                });

                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.error || 'An unknown server error occurred.');
                }

                const data = await response.json();

                // Redirect to start the download
                window.location.href = data.downloadUrl;

                downloaderSection.style.display = 'none';
                downloadStartedSection.style.display = 'block';

            } else {
                // Here you could add the logic for other platforms using the old /download endpoint if needed
                alert('This feature is currently only available for YouTube.');
            }
        } catch (error) {
            alert(error.message);
        } finally {
            // Reset button state
            convertBtn.textContent = originalBtnText;
            convertBtn.disabled = false;
        }
    });

    function resetUI() {
        urlInput.value = '';
        downloaderSection.style.display = 'block';
        downloadStartedSection.style.display = 'none';
        handlePlatformSelection('youtube'); // Reset to default
    }

    convertNextBtn.addEventListener('click', resetUI);

    // Initial setup
    handlePlatformSelection(selectedPlatform);
});
