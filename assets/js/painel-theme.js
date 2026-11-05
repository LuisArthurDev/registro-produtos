/* Tema do Painel Conferente: escolha manual persistente ou preferência do sistema. */
(function () {
  'use strict';
  const root = document.documentElement;
  const key = 'tema';
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const read = () => { try { return localStorage.getItem(key); } catch (_) { return null; } };
  const resolve = value => value === 'dark' || value === 'light' ? value : (media.matches ? 'dark' : 'light');
  function apply(value) {
    const theme = resolve(value);
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#0b1220' : '#f3f6fb';
    const button = document.getElementById('painelThemeToggle');
    if (button) {
      button.textContent = theme === 'dark' ? '☀' : '☾';
      button.title = theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro';
      button.setAttribute('aria-label', button.title);
    }
  }
  apply(read());
  function mount() {
    const host = document.querySelector('.topbar-right');
    if (!host || document.getElementById('painelThemeToggle')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'painelThemeToggle';
    button.className = 'icon-button';
    button.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(key, next); } catch (_) {}
      apply(next);
    });
    host.appendChild(button);
    apply(read());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  const onSystemChange = () => { if (read() !== 'dark' && read() !== 'light') apply('auto'); };
  if (media.addEventListener) media.addEventListener('change', onSystemChange);
  else if (media.addListener) media.addListener(onSystemChange);
  window.addEventListener('storage', event => { if (event.key === key) apply(event.newValue || 'auto'); });
})();
