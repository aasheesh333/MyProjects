document.addEventListener('DOMContentLoaded', () => {
    const platformIcons = document.querySelectorAll('.platform-icon');
    const typeSelect = document.getElementById('type-select');
    const qualitySelect = document.getElementById('quality-select');
    const qualityGroup = document.getElementById('quality-group');
    const convertBtn = document.getElementById('convert-btn');
    const downloaderSection = document.getElementById('downloader-section');
    const downloadStartedSection = document.getElementById('download-started-section');
    const convertNextBtn = document.getElementById('convert-next-btn');

    // New element for the "Converting..." message
    const convertingSection = document.createElement('section');
    convertingSection.id = 'converting-section';
    convertingSection.style.display = 'none';
    convertingSection.innerHTML = '<h2>Converting...</h2><p>Your file is being processed. Please wait.</p>';
    downloaderSection.parentNode.insertBefore(convertingSection, downloadStartedSection);

    const qualityOptions = {
        mp3: [
            { value: '320', text: '320kb/s' },
            { value: '256', text: '256kb/s' },
            { value: '128', text: '128kb/s' },
            { value: '96', text: '96kb/s' },
        ],
        mp4: [
            { value: '1080p', text: '1080p' },
            { value: '720p', text: '720p' },
            { value: '480p', text: '480p' },
            { value: '360p', text: '360p' },
        ],
    };

    const platformsWithoutQuality = ['instagram', 'facebook', 'tiktok', 'snapchat', 'threads', 'pinterest'];
    let selectedPlatform = 'youtube';

    function updateQualityOptions() {
        const format = typeSelect.value;
        qualitySelect.innerHTML = '';
        qualityOptions[format].forEach(option => {
            const opt = document.createElement('option');
            opt.value = option.value;
            opt.textContent = option.text;
            qualitySelect.appendChild(opt);
        });
        if (format === 'mp3') {
            qualitySelect.value = '320';
        } else {
            qualitySelect.value = '1080p';
        }
    }

    function handlePlatformSelection(platform) {
        selectedPlatform = platform;
        platformIcons.forEach(icon => {
            icon.classList.remove('active');
            if (icon.dataset.platform === platform) {
                icon.classList.add('active');
            }
        });
        if (platformsWithoutQuality.includes(platform)) {
            qualityGroup.style.display = 'none';
        } else {
            qualityGroup.style.display = 'flex';
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

    typeSelect.addEventListener('change', updateQualityOptions);

    convertBtn.addEventListener('click', () => {
        const urlInput = document.getElementById('url-input');
        const url = urlInput.value;
        const type = typeSelect.value;
        const quality = qualitySelect.value;

        if (!url) {
            alert('Please paste a link first!');
            return;
        }

        downloaderSection.style.display = 'none';
        convertingSection.style.display = 'block';

        fetch('/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, type, quality }),
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
            alert(`Error: ${error.message}`);
            downloaderSection.style.display = 'block';
            convertingSection.style.display = 'none';
        });
    });

    convertNextBtn.addEventListener('click', () => {
        const urlInput = document.getElementById('url-input');
        urlInput.value = '';

        downloaderSection.style.display = 'block';
        downloadStartedSection.style.display = 'none';

        convertBtn.disabled = false;
        convertBtn.textContent = 'Convert';
    });

    updateQualityOptions();
    handlePlatformSelection(selectedPlatform);
});