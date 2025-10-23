document.addEventListener('DOMContentLoaded', () => {
    // This script now only runs on the main page, so no need to check the current page.
    const platformIcons = document.querySelectorAll('.platform-icon');
    const typeSelect = document.getElementById('type-select');
    const qualitySelect = document.getElementById('quality-select');
    const qualityGroup = document.getElementById('quality-group');
    const convertBtn = document.getElementById('convert-btn');

    const qualityOptions = {
        mp3: [
            { value: '320', text: '320kb/s' }, // Values updated to match backend expectation
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
    let selectedPlatform = 'youtube'; // Default selected platform

    function updateQualityOptions() {
        const format = typeSelect.value;
        qualitySelect.innerHTML = ''; // Clear existing options
        qualityOptions[format].forEach(option => {
            const opt = document.createElement('option');
            opt.value = option.value;
            opt.textContent = option.text;
            qualitySelect.appendChild(opt);
        });
        // Set a default value after populating
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
        const url = document.getElementById('url-input').value;
        const type = typeSelect.value;
        const quality = qualitySelect.value;

        if (!url) {
            alert('Please paste a link first!');
            return;
        }

        convertBtn.disabled = true;
        convertBtn.textContent = 'Converting...';

        fetch('/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, type, quality }),
        })
        .then(response => {
            if (!response.ok) {
                // If response is not OK, it's an error from the server (e.g., bad URL)
                // The backend sends a JSON error object, so we parse it.
                return response.json().then(errData => {
                    throw new Error(errData.error || 'An unknown server error occurred.');
                });
            }
            // If response is OK, the body is the file blob.
            // We also need the filename from the Content-Disposition header.
            const disposition = response.headers.get('Content-Disposition');
            let filename = 'download'; // Default filename
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
            // Create a temporary link to trigger the download
            const a = document.createElement('a');
            const objectUrl = URL.createObjectURL(blob);
            a.href = objectUrl;
            a.download = filename; // Use the filename from the server
            document.body.appendChild(a);
            a.click();

            // Clean up the temporary link and URL
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(objectUrl);
            }, 100);

            // Reset the button
            convertBtn.disabled = false;
            convertBtn.textContent = 'Convert';
        })
        .catch(error => {
            alert(`Error: ${error.message}`);
            convertBtn.disabled = false;
            convertBtn.textContent = 'Convert';
        });
    });

    // Initial setup
    updateQualityOptions();
    handlePlatformSelection(selectedPlatform);
});