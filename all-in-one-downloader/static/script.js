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
            const urlInput = document.getElementById('url-input').value;
            if (urlInput) {
                window.location.href = 'download.html';
            } else {
                alert('Please paste a link first!');
            }
        });

        // Initial setup
        updateQualityOptions();
        handlePlatformSelection(selectedPlatform);
    }

    if (currentPage === 'download.html') {
        const convertNextBtn = document.getElementById('convert-next-btn');
        setTimeout(() => {
            convertNextBtn.style.display = 'inline-block';
            convertNextBtn.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = 'index.html';
            });
        }, 3000);
    }
});