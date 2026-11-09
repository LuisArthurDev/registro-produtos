// Desativa o service worker antigo da PWA no endereço GitHub Pages.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil((async()=>{
  const cacheNames=await caches.keys();
  await Promise.all(cacheNames.map(k=>caches.delete(k)));
  await self.registration.unregister();
  const clientsList=await self.clients.matchAll({type:'window'});
  for(const c of clientsList) c.navigate(c.url);
})()));
