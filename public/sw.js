// Service worker conservador: recursos estáticos ficam disponíveis offline; API nunca é cacheada.
const NAME='registro-validades-v30-procfit-todas-paginas';
const STATIC=['/','/index.html','/lancamentos.html','/visualizacao.html','/assets/visualizacao.js','/assets/queima-grafico.js','/assets/app.css','/assets/app.js','/assets/tabelas-responsivas.js','/assets/conciliacao-estoque.js','/assets/paginacao-completa.js','/assets/procfit.js','/assets/icones-acoes.js','/assets/organizacao-secoes.js','/assets/push.js','/assets/scanner.js','/assets/ods.js','/assets/estoque-importacao.js','/assets/validade.js','/icon-192.png','/manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(NAME).then(c=>c.addAll(STATIC)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('registro-validades-')&&name!==NAME)await caches.delete(name);await self.clients.claim();})());});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET'||req.url.includes('/api/'))return;
 const url=new URL(req.url);
 if(url.origin!==self.location.origin)return;
 event.respondWith((async()=>{
   try{const res=await fetch(req);if(res.ok&&STATIC.includes(url.pathname)){const c=await caches.open(NAME);c.put(req,res.clone());}return res;}
   catch{const cached=await caches.match(req);if(cached)return cached;if(req.mode==='navigate')return (await caches.match('/index.html'))||Response.error();return Response.error();}
 })());
});
