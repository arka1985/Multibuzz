/**
 * Multibuzz - PWA Mobile Installation Controller
 */
(function() {
    // Register Service Worker
    if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').then((reg) => {
                console.log('[PWA] Service Worker registered with scope:', reg.scope);
            }).catch((err) => {
                console.warn('[PWA] Service Worker registration failed:', err);
            });
        });
    }

    let deferredPrompt = null;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent the mini-infobar from appearing on mobile
        e.preventDefault();
        deferredPrompt = e;

        // Show install buttons if present
        const installBtns = document.querySelectorAll('.btn-install-app');
        installBtns.forEach(btn => {
            btn.style.display = 'inline-flex';
            btn.onclick = () => triggerInstall();
        });
    });

    window.addEventListener('appinstalled', () => {
        console.log('[PWA] Multibuzz was installed successfully');
        deferredPrompt = null;
        const installBtns = document.querySelectorAll('.btn-install-app');
        installBtns.forEach(btn => btn.style.display = 'none');
    });

    function triggerInstall() {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then((choiceResult) => {
                if (choiceResult.outcome === 'accepted') {
                    console.log('[PWA] User accepted the install prompt');
                }
                deferredPrompt = null;
            });
        } else {
            // iOS or already installed or unsupported
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            if (isIOS) {
                alert("To install Multibuzz on your iPhone/iPad:\n\n1. Tap the Share button (square with arrow ⎋)\n2. Scroll down and tap 'Add to Home Screen' ➕");
            } else if (isStandalone) {
                alert("Multibuzz is already installed and running as an app!");
            } else {
                alert("To install Multibuzz:\nOpen browser menu (⋮) and tap 'Add to Home Screen' or 'Install App'.");
            }
        }
    }

    window.triggerPWAInstall = triggerInstall;
})();
