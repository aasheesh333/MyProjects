
document.addEventListener('DOMContentLoaded', () => {
    const platformConfig = {
        'youtube': { types: ['MP3', 'MP4'], premium: false },
        'instagram': { types: ['MP3', 'MP4', 'Image'], premium: false },
        'facebook': { types: ['MP3', 'MP4', 'Image'], premium: false },
        'tiktok': { types: ['MP3', 'MP4'], premium: false },
        'pinterest': { types: ['MP3', 'MP4', 'Image'], premium: false },
        'snapchat': { types: ['MP3', 'MP4'], premium: false },
        'dailymotion': { types: ['MP3', 'MP4'], premium: false },
        'x-twitter': { types: ['MP3', 'MP4', 'Image'], premium: false },
        'linkedin': { types: ['MP3', 'MP4', 'Image'], premium: false },
        'reddit': { types: ['MP3', 'MP4', 'Image'], premium: false },
        'threads': { types: ['MP3', 'MP4', 'Image'], premium: true },
        'shutterstock': { types: ['MP3', 'MP4', 'Image'], premium: true },
        'viddyoze': { types: ['MP3', 'MP4'], premium: true },
        'storyblocks': { types: ['MP3', 'MP4'], premium: true },
        'vimeo': { types: ['MP3', 'MP4'], premium: true }
    };

    const qualityConfig = {
        'MP3': ['320 kbps', '256 kbps', '128 kbps', '96 kbps'],
        'MP4': ['1080p', '720p', '480p', '360p', '144p']
    };

    const platformIcons = document.querySelectorAll('.platform-icon');
    let selectedPlatform = 'youtube'; // Default selection

    const scroller = document.querySelector('.platform-slider');
    const scrollLeftBtn = document.getElementById('scroll-left-btn');
    const scrollRightBtn = document.getElementById('scroll-right-btn');

    scrollLeftBtn.addEventListener('click', () => {
        scroller.scrollBy({ left: -200, behavior: 'smooth' });
    });

    scrollRightBtn.addEventListener('click', () => {
        scroller.scrollBy({ left: 200, behavior: 'smooth' });
    });

    const typeSelect = document.getElementById('type-select');
    const qualitySelect = document.getElementById('quality-select');
    const qualityGroup = document.getElementById('quality-group');

    function updateQualityOptions() {
        const selectedType = typeSelect.value;
        if (selectedType === 'Image' || selectedPlatform !== 'youtube') {
            qualityGroup.style.display = 'none';
        } else {
            qualityGroup.style.display = 'block';
            qualitySelect.innerHTML = ''; // Clear existing options
            const qualities = qualityConfig[selectedType];
            qualities.forEach(quality => {
                const option = document.createElement('option');
                option.value = quality.split(' ')[0]; // e.g., '320'
                option.textContent = quality;
                qualitySelect.appendChild(option);
            });
        }
    }

    function updateDropdowns() {
        const config = platformConfig[selectedPlatform];
        typeSelect.innerHTML = ''; // Clear existing options
        config.types.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            typeSelect.appendChild(option);
        });
        updateQualityOptions(); // Update quality based on the new first type
    }

    typeSelect.addEventListener('change', updateQualityOptions);

    platformIcons.forEach(icon => {
        icon.addEventListener('click', () => {
            const platform = icon.dataset.platform;
            const config = platformConfig[platform];

            if (config.premium) {
                alert('You have to Sign up');
                return; // Stop further processing for premium platforms
            }

            platformIcons.forEach(i => i.classList.remove('active'));
            icon.classList.add('active');
            selectedPlatform = platform;
            updateDropdowns();
        });
    });

    // Initial setup
    updateDropdowns();
});
