(function(){
  const root=document.documentElement, key='tema';
  let saved=null;
  try{saved=localStorage.getItem(key)}catch(e){}
  const media=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)');
  function apply(theme){root.dataset.theme=theme;root.style.colorScheme=theme;const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=theme==='dark'?'#101827':'#f4f7fb';document.querySelectorAll('[data-theme-control]').forEach(b=>{b.setAttribute('aria-label',theme==='dark'?'Ativar tema claro':'Ativar tema escuro');b.title=theme==='dark'?'Ativar tema claro':'Ativar tema escuro';b.innerHTML=theme==='dark'?'<span aria-hidden="true">☀</span>':'<span aria-hidden="true">☾</span>';});}
  apply(saved==='light'||saved==='dark'?saved:(media&&media.matches?'dark':'light'));
  if(media){media.addEventListener('change',e=>{let v=null;try{v=localStorage.getItem(key)}catch(_){}if(v!=='light'&&v!=='dark')apply(e.matches?'dark':'light')});}
  function addControl(){if(document.querySelector('.theme-toggle,#themeToggle,[data-theme-control]')){document.querySelectorAll('.theme-toggle,#themeToggle').forEach(b=>{b.dataset.themeControl='1';});return;}
    const b=document.createElement('button');b.type='button';b.className='theme-toggle theme-toggle-global';b.dataset.themeControl='1';b.style.cssText='position:fixed;right:18px;top:18px;z-index:9999;width:44px;height:44px;border-radius:14px;border:1px solid var(--ui-border);background:var(--ui-surface);color:var(--ui-text);box-shadow:var(--ui-shadow);font-size:21px;cursor:pointer';b.addEventListener('click',()=>{const n=root.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem(key,n)}catch(_){}apply(n)});document.body.appendChild(b);apply(root.dataset.theme||'light');}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addControl,{once:true});else addControl();
})();
