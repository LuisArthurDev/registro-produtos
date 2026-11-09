/* Melhoria progressiva sem substituir ações de negócio ou listeners antigos. */
(function () {
  'use strict';
  const root = document.documentElement;
  const page = root.dataset.appPage || '';
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  function temaPreferido() {
    try { const s = localStorage.getItem('tema'); if (s === 'dark' || s === 'light') return s; } catch (_) {}
    return media.matches ? 'dark' : 'light';
  }
  function aplicarTema() {
    const tema = temaPreferido();
    root.dataset.theme = tema;
    root.style.colorScheme = tema;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = tema === 'dark' ? '#0c1420' : '#102a3c';
    const botao = document.getElementById('alternarTemaSistema');
    if (botao) { botao.textContent = tema === 'dark' ? '☀' : '☾'; botao.title = tema === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'; botao.setAttribute('aria-label', botao.title); }
  }
  aplicarTema();
  function configurar() {
    if (['painelgeral','instalar','erro'].includes(page) && !document.getElementById('alternarTemaSistema')) {
      const botao = document.createElement('button');
      botao.type = 'button';botao.id = 'alternarTemaSistema';botao.className = 'ui-tema-flutuante';
      botao.addEventListener('click', () => {
        const novo = root.dataset.theme === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem('tema', novo); } catch (_) {}
        aplicarTema();
      });
      document.body.appendChild(botao);
    }
    if (page === 'painelconferente') {
      const sidebar = document.getElementById('sidebar');
      const toggle = document.getElementById('menuToggle');
      if (sidebar && toggle) {
        toggle.setAttribute('aria-controls','sidebar');toggle.setAttribute('aria-expanded',sidebar.classList.contains('open') ? 'true':'false');
        const camada = document.createElement('button');
        camada.type='button';camada.className='ui-sidebar-backdrop';camada.setAttribute('aria-label','Fechar menu');
        document.body.appendChild(camada);
        const sync = () => {
          const aberto = sidebar.classList.contains('open');
          toggle.setAttribute('aria-expanded',String(aberto));
          toggle.setAttribute('aria-label',aberto?'Fechar menu':'Abrir menu');
          camada.hidden = !aberto || !matchMedia('(max-width:900px)').matches;
        };
        toggle.addEventListener('click', () => requestAnimationFrame(sync));
        sidebar.addEventListener('click', e => { if (e.target.closest('.nav-item, #sidebarCollapse')) requestAnimationFrame(sync); });
        camada.addEventListener('click', () => { sidebar.classList.remove('open');sync();toggle.focus(); });
        document.addEventListener('keydown', e => {
          if (e.key === 'Escape' && sidebar.classList.contains('open')) { sidebar.classList.remove('open');sync();toggle.focus(); }
        });
        window.addEventListener('resize',sync,{passive:true});
        sync();
      }
    }
    aplicarTema();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',configurar,{once:true});
  else configurar();
  window.addEventListener('storage', e => { if (e.key === 'tema') aplicarTema(); });
  if (media.addEventListener) media.addEventListener('change', () => { try { if (localStorage.getItem('tema')) return; } catch (_) {} aplicarTema(); });
})();
