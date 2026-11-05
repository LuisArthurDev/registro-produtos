/* Tema global: preferência manual persistente; sem preferência, acompanha o SO. */
(function(){
  'use strict';
  var root=document.documentElement, key='tema', media=window.matchMedia('(prefers-color-scheme: dark)');
  function preference(){try{return localStorage.getItem(key)}catch(_){return null}}
  function apply(value){var theme=value==='light'||value==='dark'?value:(media.matches?'dark':'light');root.dataset.theme=theme;root.style.colorScheme=theme;var meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=theme==='dark'?'#0b1220':'#f3f6fb';document.querySelectorAll('[data-global-theme-toggle]').forEach(function(b){b.textContent=theme==='dark'?'☀':'☾';b.setAttribute('aria-label',theme==='dark'?'Ativar tema claro':'Ativar tema escuro');b.title=theme==='dark'?'Tema escuro — clique para claro':'Tema claro — clique para escuro';});}
  apply(preference());
  if(media.addEventListener)media.addEventListener('change',function(){if(preference()!=='light'&&preference()!=='dark')apply('auto')});else if(media.addListener)media.addListener(function(){if(preference()!=='light'&&preference()!=='dark')apply('auto')});
  document.addEventListener('click',function(e){var b=e.target.closest('[data-global-theme-toggle]');if(!b)return;var next=root.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem(key,next)}catch(_){}apply(next);});
  function ensure(){var existing=document.querySelector('.theme-toggle,#themeToggle');if(existing){existing.setAttribute('data-theme-existing-control','');apply(preference());return;}var b=document.createElement('button');b.type='button';b.className='theme-toggle';b.dataset.globalThemeToggle='';b.textContent=root.dataset.theme==='dark'?'☀':'☾';b.setAttribute('aria-label','Alternar tema');b.style.cssText='position:fixed;right:18px;top:18px;z-index:10002;width:44px;height:44px;border:1px solid var(--app-border);border-radius:14px;background:var(--app-surface);color:var(--app-text);box-shadow:var(--app-shadow);font-size:20px;cursor:pointer';document.body.appendChild(b);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ensure,{once:true});else ensure();
})();
