document.addEventListener('DOMContentLoaded', () => {
    const currentPage = window.location.pathname.split('/').pop();

    if (currentPage === 'index.html' || currentPage === '') {
        const platformIcons = document.querySelectorAll('.platform-icon');
        const typeSelect = document.getElementById('type-select');
        const qualitySelect = document.getElementById('quality-select');
        const qualityGroup = document.getElementById('quality-group');
        const convertBtn = document.getElementById('convert-btn');

        const qualityOptions = {
            mp3: [
                { value: '320kb/s', text: '320kb/s' },
                { value: '256kb/s', text: '256kb/s' },
                { value: '128kb/s', text: '128kb/s' },
                { value: '96kb/s', text: '96kb/s' },
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
        }

        function handlePlatformSelection(platform) {
            selectedPlatform = platform;

            // Update active state for icons
            platformIcons.forEach(icon => {
                icon.classList.remove('active');
                if (icon.dataset.platform === platform) {
                    icon.classList.add('active');
                }
            });

            // Handle quality dropdown visibility
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

            // Disable button and show loading state
            convertBtn.disabled = true;
            convertBtn.textContent = 'Converting...';

            fetch('/download', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url, type, quality }),
            })
            .then(response => {
                if (!response.ok) {
                    // Try to get the error message from the server's JSON response
                    return response.json().then(err => { throw new Error(err.error || 'An unknown error occurred.') });
                }
                return response.json();
            })
            .then(data => {
                if (data.download_url) {
                    // Store the URL for the next page and redirect
                    sessionStorage.setItem('downloadUrl', data.download_url);
                    window.location.href = 'download.html';
                } else {
                    throw new Error(data.error || 'Could not retrieve the download link.');
                }
            })
            .catch(error => {
                // Show error message and re-enable the button
                alert(`Error: ${error.message}`);
                convertBtn.disabled = false;
                convertBtn.textContent = 'Convert';
            });
        });

        // Initial setup
        updateQualityOptions();
        handlePlatformSelection(selectedPlatform);
    }

    if (currentPage === 'download.html') {
        const downloadUrl = sessionStorage.getItem('downloadUrl');
        const downloadContainer = document.getElementById('download-container');

        if (downloadUrl) {
            const downloadButton = document.createElement('a');
            downloadButton.href = downloadUrl;
            downloadButton.textContent = 'Download Now';
            downloadButton.className = 'button';
            downloadButton.setAttribute('download', ''); // This encourages the browser to download the file

            downloadContainer.appendChild(downloadButton);
        } else {
            downloadContainer.innerHTML = '<p>Could not find a download link. Please try again.</p>';
        }

        // Clean up the stored URL
        sessionStorage.removeItem('downloadUrl');
    }
});