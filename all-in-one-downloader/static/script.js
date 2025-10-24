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
        image: [],
    };

    const platformsWithImage = ['instagram', 'facebook', 'tiktok', 'snapchat', 'x-twitter', 'linkedin', 'pinterest'];
    const noQualitySelection = ['facebook', 'instagram', 'tiktok', 'snapchat', 'x-twitter', 'linkedin'];
    let selectedPlatform = 'youtube';

    function updateContentTypeOptions() {
        const imageOption = typeSelect.querySelector('option[value="image"]');
        if (platformsWithImage.includes(selectedPlatform)) {
            if (!imageOption) {
                const opt = document.createElement('option');
                opt.value = 'image';
                opt.textContent = 'Image';
                typeSelect.appendChild(opt);
            }
        } else {
            if (imageOption) {
                typeSelect.removeChild(imageOption);
            }
        }
    }

    function updateQualityOptions() {
        const format = typeSelect.value;
        qualitySelect.innerHTML = '';

        if (format === 'image' || noQualitySelection.includes(selectedPlatform)) {
            qualityGroup.style.display = 'none';
            return;
        }

        qualityGroup.style.display = 'flex';
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
        updateContentTypeOptions();
        updateQualityOptions();
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
        const url = urlInput.value;
        const type = typeSelect.value;
        const quality = qualitySelect.value;

        if (!url) {
            alert('Please paste a link first!');
            return;
        }

        if (url.match(/\.(jpeg|jpg|gif|png)$/) != null && type !== 'image') {
            alert('You have pasted an image link. Please select the "Image" content type.');
            return;
        }

        downloaderSection.style.display = 'none';
        infoSection.style.display = 'none';
        supportedSites.style.display = 'none';
        convertingSection.style.display = 'block';

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
            // Display the specific error message from the server
            alert(error.message);
            urlInput.value = '';
            downloaderSection.style.display = 'block';
            infoSection.style.display = 'block';
            supportedSites.style.display = 'block';
            convertingSection.style.display = 'none';
        });
    });

    convertNextBtn.addEventListener('click', () => {
        urlInput.value = '';
        downloaderSection.style.display = 'block';
        infoSection.style.display = 'block';
        supportedSites.style.display = 'block';
        downloadStartedSection.style.display = 'none';
        convertBtn.disabled = false;
        convertBtn.textContent = 'Convert';
    });

    updateContentTypeOptions();
    updateQualityOptions();
    handlePlatformSelection(selectedPlatform);
});