// Desativa o Service Worker antigo do GitHub Pages após a migração.
// Não limpa caches de outros sites/projetos no mesmo domínio github.io.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await self.clients.claim();
    await self.registration.unregister();
  })());
});
