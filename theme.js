// Whisker &amp; Wag theme toggle - remembers choice in localStorage
(function () {
  var saved = localStorage.getItem('ww-theme');
  if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.querySelector('.theme-toggle');
    if (!btn) return;
    syncIcon();
    btn.addEventListener('click', function () {
      var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('ww-theme', 'light');
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('ww-theme', 'dark');
      }
      syncIcon();
    });
    function syncIcon() {
      var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      btn.textContent = isDark ? '\u2600\uFE0F' : '\u263D';
      btn.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
    }
  });
})();
