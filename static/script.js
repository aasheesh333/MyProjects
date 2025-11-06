document.addEventListener('DOMContentLoaded', () => {
    const platformIcons = document.querySelectorAll('.platform-icon');
    const typeSelect = document.getElementById('type-select');
    const qualitySelect = document.getElementById('quality-select');
    const qualityGroup = document.getElementById('quality-group');
    const convertBtn = document.getElementById('convert-btn');
    const downloaderSection = document.getElementById('downloader-section');
    const downloadStartedSection = document.getElementById('download-started-section');
    const convertNextBtn = document.getElementById('convert-next-btn');
    const urlInput = document.getElementById('url-input');
    const infoSection = document.querySelector('.info-section');
    const supportedSites = document.querySelector('.supported-sites');

    const convertingSection = document.createElement('section');
    convertingSection.id = 'converting-section';
    convertingSection.style.display = 'none';
    convertingSection.innerHTML = '<h2>Fetching...</h2><p>Getting available formats. Please wait.</p>';
    downloaderSection.parentNode.insertBefore(convertingSection, downloadStartedSection);

    let selectedPlatform = 'youtube';
    let youtubeFormats = [];
    let videoTitle = '';

    const staticQualityOptions = {
        mp3: ["320kb/s", "256kb/s", "128kb/s", "96kb/s"],
        mp4: ["1080p", "720p", "480p", "360p"],
    };

    function updateQualityOptionsForStatic() {
        const format = typeSelect.value;
        qualitySelect.innerHTML = '';

        if (format === 'image' || ['instagram', 'facebook', 'tiktok', 'snapchat', 'x-twitter', 'linkedin', 'pinterest'].includes(selectedPlatform)) {
            qualityGroup.style.display = 'none';
            return;
        }

        qualityGroup.style.display = 'flex';
        const options = staticQualityOptions[format];
        options.forEach(optionText => {
            const opt = document.createElement('option');
            opt.value = optionText;
            opt.textContent = optionText;
            qualitySelect.appendChild(opt);
        });
    }

    function populateYouTubeQualityOptions() {
        const selectedType = typeSelect.value;
        qualitySelect.innerHTML = '';
        qualityGroup.style.display = 'flex';

        const filteredFormats = youtubeFormats.filter(f => f.type === selectedType);

        if (filteredFormats.length === 0) {
            qualitySelect.innerHTML = '<option>No formats found</option>';
            convertBtn.disabled = true;
            return;
        }

        convertBtn.disabled = false;
        filteredFormats.forEach((format, index) => {
            const opt = document.createElement('option');
            opt.value = format.id; // Use format.id instead of format.url
            opt.textContent = format.text.replace(/Video|Audio|\(|\)/g, '').trim(); // Clean up text for display
            opt.selected = index === 0; // The best quality is always first
            qualitySelect.appendChild(opt);
        });
    }

    async function fetchYouTubeFormats() {
        const url = urlInput.value;
        if (!url || selectedPlatform !== 'youtube' || (!url.includes('youtube.com') && !url.includes('youtu.be'))) {
            return;
        }

        downloaderSection.style.display = 'none';
        convertingSection.style.display = 'block';

        try {
            const response = await fetch('/api/get-formats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Failed to fetch formats.');
            }
            const data = await response.json();
            videoTitle = data.title;
            // Map to a more consistent format for the frontend
            youtubeFormats = data.formats.map(f => ({
                text: f.text,
                id: f.id, // Changed from url to id
                type: f.type === 'video' ? 'mp4' : 'mp3',
                quality: f.quality
            }));
            populateYouTubeQualityOptions();
        } catch (error) {
            alert(error.message);
            resetUI();
        } finally {
            downloaderSection.style.display = 'block';
            convertingSection.style.display = 'none';
        }
    }

    urlInput.addEventListener('paste', () => {
        setTimeout(fetchYouTubeFormats, 100);
    });
    urlInput.addEventListener('input', fetchYouTubeFormats);


    function handlePlatformSelection(platform) {
        selectedPlatform = platform;
        platformIcons.forEach(icon => {
            icon.classList.remove('active');
            if (icon.dataset.platform === platform) {
                icon.classList.add('active');
            }
        });

        const typeGroup = document.querySelector('.option-group:has(#type-select)');

        if (platform === 'youtube') {
            typeSelect.value = 'mp3'; // Default to MP3 for YouTube
            typeGroup.style.display = 'flex'; // Always show for YouTube
            qualityGroup.style.display = 'flex'; // Always show for YouTube
            fetchYouTubeFormats(); // Fetch formats if a URL is already present
        } else {
            typeGroup.style.display = 'flex';
            updateQualityOptionsForStatic();
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

    typeSelect.addEventListener('change', () => {
        if (selectedPlatform === 'youtube') {
            populateYouTubeQualityOptions();
        } else {
            updateQualityOptionsForStatic();
        }
    });

    function resetUI() {
        urlInput.value = '';
        youtubeFormats = [];
        downloaderSection.style.display = 'block';
        infoSection.style.display = 'block';
        supportedSites.style.display = 'block';
        convertingSection.style.display = 'none';
        downloadStartedSection.style.display = 'none';
        convertBtn.disabled = false;
        convertBtn.textContent = 'Convert';
        handlePlatformSelection('youtube'); // Reset to default
    }

    convertBtn.addEventListener('click', async () => {
        const url = urlInput.value;
        if (!url) {
            alert('Please paste a link first!');
            return;
        }

        if (selectedPlatform === 'youtube') {
            const formatId = qualitySelect.value;
            if (!formatId) {
                alert('Please select a valid format.');
                return;
            }

            downloaderSection.style.display = 'none';
            convertingSection.style.display = 'block';
            convertingSection.querySelector('h2').textContent = 'Preparing Download...';
            convertingSection.querySelector('p').textContent = 'Your download will begin shortly.';


            try {
                const response = await fetch('/api/requestDownload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url, formatId }),
                });

                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.error || 'Failed to get the final download link.');
                }

                const data = await response.json();
                window.location.href = data.finalDownloadUrl;

                convertingSection.style.display = 'none';
                downloadStartedSection.style.display = 'block';

            } catch (error) {
                alert(error.message);
                resetUI();
            }

        } else {
            // Legacy download logic for other platforms
            downloaderSection.style.display = 'none';
            infoSection.style.display = 'none';
            supportedSites.style.display = 'none';
            convertingSection.style.display = 'block';

            const type = typeSelect.value;
            const quality = qualitySelect.value;

            fetch('/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, type, quality, platform: selectedPlatform }),
            })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(errData => {
                        throw new Error(errData.error || 'An unknown server error occurred.');
                    });
                }
                const disposition = response.headers.get('Content-Disposition');
                let filename = 'download';
                if (disposition && disposition.indexOf('attachment') !== -1) {
                    const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                    const matches = filenameRegex.exec(disposition);
                    if (matches != null && matches[1]) {
                        filename = matches[1].replace(/['"]/g, '');
                    }
                }
                return Promise.all([response.blob(), Promise.resolve(filename)]);
            })
            .then(([blob, filename]) => {
                const a = document.createElement('a');
                const objectUrl = URL.createObjectURL(blob);
                a.href = objectUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(objectUrl);
                }, 100);
                convertingSection.style.display = 'none';
                downloadStartedSection.style.display = 'block';
            })
            .catch(error => {
                alert(error.message);
                resetUI();
            });
        }
    });

    convertNextBtn.addEventListener('click', resetUI);

    // Initial setup
    handlePlatformSelection(selectedPlatform);
});
