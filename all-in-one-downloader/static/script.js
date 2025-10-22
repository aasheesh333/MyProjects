document.addEventListener('DOMContentLoaded', () => {
    const currentPage = window.location.pathname.split('/').pop();

    // Logic for the main downloader page (index.html)
    if (currentPage === 'index.html' || currentPage === '') {
        const platformSelect = document.getElementById('platform-select');
        const qualityGroup = document.getElementById('quality-group');
        const convertBtn = document.getElementById('convert-btn');

        const platformsWithoutQuality = [
            'instagram', 'facebook', 'tiktok', 'snapchat', 'threads', 'pinterest'
        ];

        const premiumPlatforms = [
            'shutterstock', 'viddyoze', 'storyblocks'
        ];

        platformSelect.addEventListener('change', () => {
            const selectedPlatform = platformSelect.value;

            // Check for premium platform selection
            if (premiumPlatforms.includes(selectedPlatform)) {
                alert('This is a premium platform. Please sign up to continue.');
                window.location.href = 'signup.html';
                return;
            }

            // Handle quality dropdown visibility
            if (platformsWithoutQuality.includes(selectedPlatform)) {
                qualityGroup.style.display = 'none';
            } else {
                qualityGroup.style.display = 'flex';
            }
        });

        // Initial check on page load
        platformSelect.dispatchEvent(new Event('change'));

        convertBtn.addEventListener('click', () => {
            const urlInput = document.getElementById('url-input').value;
            if (urlInput) {
                window.location.href = 'download.html';
            } else {
                alert('Please paste a link first!');
            }
        });
    }

    // Logic for the download page (download.html)
    if (currentPage === 'download.html') {
        const convertNextBtn = document.getElementById('convert-next-btn');
        setTimeout(() => {
            convertNextBtn.style.display = 'inline-block';
            convertNextBtn.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = 'index.html'; // Go back to the main page
            });
        }, 3000);
    }
});