// Thème clair / sombre, sans script inline (la CSP n'autorise que les scripts du site).
// 1. Avant le premier rendu : applique le thème que le visiteur a mémorisé, s'il y en a un.
// 2. Bascule « Thème » : clair → sombre → système. Le choix reste dans le navigateur du visiteur, et nulle part ailleurs.
(function () {
  var h = document.documentElement;
  try {
    var t = localStorage.getItem('theme');
    if (t === 'light' || t === 'dark') h.dataset.theme = t;
  } catch (e) {}
  function brancher() {
    var b = document.getElementById('bascule-theme');
    if (!b) return;
    b.addEventListener('click', function () {
      var suivant = { light: 'dark', dark: '', '': 'light' }[h.dataset.theme || ''] || '';
      if (suivant) h.dataset.theme = suivant; else delete h.dataset.theme;
      try { suivant ? localStorage.setItem('theme', suivant) : localStorage.removeItem('theme'); } catch (e) {}
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', brancher); else brancher();
})();
