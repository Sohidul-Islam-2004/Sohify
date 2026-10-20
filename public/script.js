        // Mobile navbar drawer toggle
        const mobileToggle = document.getElementById('mobileToggle');
        const navLinks = document.getElementById('navLinks');

        mobileToggle.addEventListener('click', () => {
            navLinks.classList.toggle('open');
            const icon = mobileToggle.querySelector('i');
            icon.className = navLinks.classList.contains('open')
                ? 'fa-solid fa-xmark'
                : 'fa-solid fa-bars';
        });

        // Interactive track previewer: updates the Hero Now Playing card when clicking any Trending Card
        function previewTrack(title, artist, imgUrl) {
            document.getElementById('npTitle').textContent = title;
            document.getElementById('npArtist').textContent = artist;
            document.getElementById('npImage').src = imgUrl;

            const card = document.getElementById('heroNowPlaying');
            card.style.borderColor = '#1ed760';
            setTimeout(() => {
                card.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            }, 800);

            window.scrollTo({ top: 0, behavior: 'smooth' });
        }  