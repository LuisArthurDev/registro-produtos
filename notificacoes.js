/* Notificações do Registro de Mapa de Validade.
 * Configure ONESIGNAL_APP_ID após criar o app no OneSignal.
 * A chave REST nunca deve ser colocada neste arquivo.
 */
(function () {
  "use strict";
  const ONESIGNAL_APP_ID = ""; // preencher com o App ID público do OneSignal
  const SERVICE_WORKER_PATH = "/registro-produtos/OneSignalSDKWorker.js";
  const SERVICE_WORKER_SCOPE = "/registro-produtos/";
  let initPromise = null;

  function normalizarSlug(valor) {
    return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }
  function externalId() {
    const loja = String(window.Auth?.loja?.() || "").replace(/\D/g, "");
    const nome = window.Auth?.usuario?.() || "";
    return loja && nome ? "mv_" + loja + "_" + normalizarSlug(nome) : "";
  }
  function carregarSdk() {
    if (window.OneSignal) return Promise.resolve();
    if (window.__mvOneSignalSdkPromise) return window.__mvOneSignalSdkPromise;
    window.__mvOneSignalSdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Não foi possível carregar o serviço de notificações."));
      document.head.appendChild(script);
    });
    return window.__mvOneSignalSdkPromise;
  }
  async function iniciarOneSignal() {
    if (!ONESIGNAL_APP_ID) return null;
    if (initPromise) return initPromise;
    initPromise = (async () => {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      await carregarSdk();
      return new Promise((resolve, reject) => {
        window.OneSignalDeferred.push(async function (OneSignal) {
          try {
            await OneSignal.init({
              appId: ONESIGNAL_APP_ID,
              serviceWorkerPath: SERVICE_WORKER_PATH,
              serviceWorkerParam: { scope: SERVICE_WORKER_SCOPE },
              notifyButton: { enable: false }
            });
            const id = externalId();
            if (id) await OneSignal.login(id);
            resolve(OneSignal);
          } catch (erro) { initPromise = null; reject(erro); }
        });
      });
    })();
    return initPromise;
  }
  function ehDesktop() {
    return !(/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) &&
      window.matchMedia("(pointer: fine) and (min-width: 768px)").matches;
  }
  async function ativar() {
    const botao = document.getElementById("btnAtivarNotificacoes") || document.getElementById("btnAtivarNotificacoesPainel");
    if (botao) botao.disabled = true;
    try {
      if (ONESIGNAL_APP_ID) {
        const OneSignal = await iniciarOneSignal();
        await OneSignal.Notifications.requestPermission();
        if (OneSignal.Notifications.permission) {
          alert("Notificações ativadas neste dispositivo. Você poderá receber avisos mesmo com o navegador fechado, conforme o suporte do navegador e do sistema.");
        } else {
          alert("A permissão de notificações não foi concedida. Você pode ativá-la nas configurações do navegador.");
        }
      } else if ("Notification" in window) {
        const permissao = await Notification.requestPermission();
        if (permissao === "granted") {
          alert(ehDesktop()
            ? "Permissão ativada. O computador avisará quando você abrir o sistema e houver produtos vencidos. Para receber push com o navegador fechado, falta configurar o aplicativo OneSignal."
            : "Permissão do navegador ativada. Para receber notificações com o navegador fechado, falta configurar o aplicativo OneSignal.");
        } else {
          alert("A permissão não foi concedida. Ative as notificações nas configurações do navegador.");
        }
      } else {
        alert("Este navegador não oferece suporte a notificações.");
      }
    } catch (erro) {
      console.error("Falha ao ativar notificações:", erro);
      alert(erro.message || "Não foi possível ativar as notificações.");
    } finally { if (botao) botao.disabled = false; }
  }
  function notificarDesktop(dados) {
    if (!ehDesktop() || !("Notification" in window) || Notification.permission !== "granted") return;
    const quantidade = Number(dados?.quantidade || 0);
    if (!quantidade) return;
    const loja = String(dados.loja || Auth.loja() || "");
    const chave = "mv_notif_pc_" + loja + "_" + normalizarSlug(dados.nome || "loja");
    const agora = Date.now();
    let anterior = null;
    try { anterior = JSON.parse(localStorage.getItem(chave) || "null"); } catch (_) {}
    // Evita notificações duplicadas ao navegar entre páginas; reavisa após 6 horas.
    if (anterior && agora - Number(anterior.em || 0) < 6 * 60 * 60 * 1000 && Number(anterior.quantidade) === quantidade) return;
    try { localStorage.setItem(chave, JSON.stringify({ em: agora, quantidade })); } catch (_) {}
    const nome = String(dados.nome || "Sua loja");
    const singular = quantidade === 1;
    const titulo = dados.url === "painelconferente.html" ? "Produtos vencidos na loja" : "Produtos vencidos no mapa";
    const corpo = dados.url === "painelconferente.html"
      ? quantidade + (singular ? " registro vencido" : " registros vencidos") + " precisam de conferência na " + nome + "."
      : nome + (singular ? " possui 1 produto vencido." : " possui " + quantidade + " produtos vencidos.");
    const notificacao = new Notification(titulo, { body: corpo, tag: chave, renotify: false });
    notificacao.onclick = function () { window.focus(); if (dados.url) window.location.href = dados.url; notificacao.close(); };
  }
  async function iniciar() {
    if (ONESIGNAL_APP_ID) {
      try { await iniciarOneSignal(); } catch (erro) { console.warn("OneSignal ainda não inicializado:", erro); }
    }
    document.querySelectorAll("#btnAtivarNotificacoes, #btnAtivarNotificacoesPainel").forEach(btn => {
      btn.hidden = false;
    });
  }
  async function sair() {
    try {
      if (ONESIGNAL_APP_ID) {
        const OneSignal = await iniciarOneSignal();
        if (OneSignal && typeof OneSignal.logout === "function") await OneSignal.logout();
      }
    } catch (_) {}
  }
  window.MVNotificacoes = { iniciar, ativar, notificarDesktop, sair, externalId };
  window.addEventListener("load", function () {
    if (window.Auth && window.Auth.token()) iniciar();
  }, { once: true });
})();
