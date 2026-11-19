// Mobile navbar drawer toggle
const mobileToggle = document.getElementById('mobileToggle');
const navLinks = document.getElementById('navLinks');

if (mobileToggle && navLinks) {
    function setMobileMenuOpen(isOpen) {
        navLinks.classList.toggle('open', isOpen);
        mobileToggle.setAttribute('aria-expanded', String(isOpen));
        const icon = mobileToggle.querySelector('i');
        if (icon) {
            icon.className = isOpen
                ? 'fa-solid fa-xmark'
                : 'fa-solid fa-bars';
        }
    }

    mobileToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        setMobileMenuOpen(!navLinks.classList.contains('open'));
    });

    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => setMobileMenuOpen(false));
    });

    document.addEventListener('click', (e) => {
        if (navLinks.classList.contains('open') && !navLinks.contains(e.target) && !mobileToggle.contains(e.target)) {
            setMobileMenuOpen(false);
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && navLinks.classList.contains('open')) {
            setMobileMenuOpen(false);
        }
    });

    window.addEventListener('resize', () => {
        if (window.innerWidth >= 769 && navLinks.classList.contains('open')) {
            setMobileMenuOpen(false);
        }
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
