// Mobile navbar drawer toggle
const mobileToggle = document.getElementById('mobileToggle');
const navLinks = document.getElementById('navLinks');

if (mobileToggle && navLinks) {
    mobileToggle.addEventListener('click', () => {
        navLinks.classList.toggle('open');
        const icon = mobileToggle.querySelector('i');
        if (icon) {
            icon.className = navLinks.classList.contains('open')
                ? 'fa-solid fa-xmark'
                : 'fa-solid fa-bars';
        }
    });

    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('open');
            const icon = mobileToggle.querySelector('i');
            if (icon) icon.className = 'fa-solid fa-bars';
        });
    });
}

// Interactive collection preview toast (opens when clicking Trending cards)
let previewToastTimer = null;
function previewTrack(title, artist, imgUrl) {
    const toast = document.getElementById('landingPreviewToast');
    const titleEl = document.getElementById('previewToastTitle');
    const artistEl = document.getElementById('previewToastArtist');
    const imageEl = document.getElementById('previewToastImg');

    if (!toast) {
        window.location.href = '/Dashboard';
        return;
    }

    if (titleEl) titleEl.textContent = title;
    if (artistEl) artistEl.textContent = artist;
    if (imageEl) {
        imageEl.src = imgUrl;
        imageEl.alt = title;
    }

    toast.classList.add('visible');
    if (previewToastTimer) clearTimeout(previewToastTimer);
    previewToastTimer = setTimeout(() => {
        toast.classList.remove('visible');
    }, 5000);
}

// Scroll reveal animation for Reflect-inspired cards
document.addEventListener('DOMContentLoaded', () => {
    const revealEls = document.querySelectorAll('.music-card, .feature-card, .price-card, .hero-banner');
    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry, idx) => {
                if (entry.isIntersecting) {
                    setTimeout(() => {
                        entry.target.classList.add('revealed');
                    }, (idx % 4) * 80);
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12 });

        revealEls.forEach(el => {
            el.classList.add('reveal-init');
            observer.observe(el);
        });
    }
});
