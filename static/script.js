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
    let availableFormats = [];

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

    function populateQualityOptionsFromDynamic(formats) {
        qualitySelect.innerHTML = '';
        qualityGroup.style.display = 'flex';

        availableFormats = formats;

        if (availableFormats.length === 0) {
            qualityGroup.style.display = 'none';
            return;
        }

        availableFormats.forEach(format => {
            const opt = document.createElement('option');
            opt.value = format.id;
            opt.textContent = format.text;
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
            const formats = await response.json();
            populateQualityOptionsFromDynamic(formats);
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
            typeGroup.style.display = 'none';
            fetchYouTubeFormats();
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
        if (selectedPlatform !== 'youtube') {
            updateQualityOptionsForStatic();
        }
    });

    function resetUI() {
        urlInput.value = '';
        downloaderSection.style.display = 'block';
        infoSection.style.display = 'block';
        supportedSites.style.display = 'block';
        convertingSection.style.display = 'none';
        downloadStartedSection.style.display = 'none';
        convertBtn.disabled = false;
        convertBtn.textContent = 'Convert';
    }

    convertBtn.addEventListener('click', async () => {
        const url = urlInput.value;
        if (!url) {
            alert('Please paste a link first!');
            return;
        }

        downloaderSection.style.display = 'none';
        infoSection.style.display = 'none';
        supportedSites.style.display = 'none';
        convertingSection.style.display = 'block';
        convertingSection.querySelector('h2').textContent = 'Processing...';

        if (selectedPlatform === 'youtube') {
            try {
                const formatId = qualitySelect.value;
                const response = await fetch('/api/get-download-url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url, formatId }),
                });
                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.error || 'Failed to get download URL.');
                }
                const { downloadUrl } = await response.json();

                const selectedFormat = availableFormats.find(f => f.id === formatId);
                const fileExtension = selectedFormat.type === 'audio' ? 'mp3' : 'mp4';
                const safeTitle = (document.title || 'download').replace(/[^a-zA-Z0-9\s-]/g, '').trim();
                const filename = `JusDown - ${safeTitle}.${fileExtension}`;

                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

                convertingSection.style.display = 'none';
                downloadStartedSection.style.display = 'block';

            } catch (error) {
                alert(error.message);
                resetUI();
            }
        } else {
            // Legacy download logic for other platforms
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

    handlePlatformSelection(selectedPlatform);
    updateQualityOptionsForStatic();
});
