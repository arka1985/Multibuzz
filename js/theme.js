/**
 * Multibuzz - Day & Night Mode Theme Engine
 */
(function() {
    const STORAGE_KEY = 'multibuzz_theme';

    function getPreferredTheme() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'light' || saved === 'dark') {
            return saved;
        }
        return 'dark'; // Default to sleek dark mode
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_KEY, theme);

        // Update mobile status bar theme-color meta tag
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            metaThemeColor.setAttribute('content', theme === 'light' ? '#f8fafc' : '#0a0e17');
        }

        // Update any toggle buttons in DOM
        updateToggleButtons(theme);
    }

    function updateToggleButtons(theme) {
        const btns = document.querySelectorAll('.btn-theme-toggle');
        btns.forEach(btn => {
            if (theme === 'light') {
                btn.innerHTML = `
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                    </svg>
                `;
                btn.title = 'Switch to Night Mode';
                btn.setAttribute('aria-label', 'Switch to Night Mode');
            } else {
                btn.innerHTML = `
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="5"></circle>
                        <line x1="12" y1="1" x2="12" y2="3"></line>
                        <line x1="12" y1="21" x2="12" y2="23"></line>
                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                        <line x1="1" y1="12" x2="3" y2="12"></line>
                        <line x1="21" y1="12" x2="23" y2="12"></line>
                        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                    </svg>
                `;
                btn.title = 'Switch to Day Mode';
                btn.setAttribute('aria-label', 'Switch to Day Mode');
            }
        });
    }

    // Apply immediately to prevent flash
    const currentTheme = getPreferredTheme();
    applyTheme(currentTheme);

    window.toggleTheme = function() {
        const nextTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        applyTheme(nextTheme);
    };

    window.addEventListener('DOMContentLoaded', () => {
        updateToggleButtons(document.documentElement.getAttribute('data-theme') || 'dark');
        document.querySelectorAll('.btn-theme-toggle').forEach(btn => {
            btn.onclick = window.toggleTheme;
        });
    });
})();
