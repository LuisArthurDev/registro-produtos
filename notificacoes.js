/* Notificações do Registro de Mapa de Validade.
 * Configure ONESIGNAL_APP_ID após criar o app no OneSignal.
 * A chave REST nunca deve ser colocada neste arquivo.
 */
(function () {
  "use strict";
  let ONESIGNAL_APP_ID = "";
  const API_URL = "https://script.google.com/macros/s/AKfycbxDx57h_RgrSCBIPtkwCDZd00dFyM3SyAmtxWS5QzfqXJaLETbHKlVffZiclqhwKYApIA/exec";
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
    try {
      const autorizado = JSON.parse(localStorage.getItem("mv_celular_proprio_autorizado") || "{}");
      const token = localStorage.getItem("mv_celular_proprio_token") || "";
      const slug = normalizarSlug(nome);
      if (autorizado && normalizarSlug(autorizado.nome) === slug &&
          String(autorizado.loja || "").replace(/\D/g, "") === loja &&
          /^[a-f0-9]{64}$/i.test(token)) return "mv_celular_" + loja + "_" + slug;
    } catch (_) {}
    return loja && nome ? "mv_" + loja + "_" + normalizarSlug(nome) : "";
  }
  function obterAppId() {
    if (ONESIGNAL_APP_ID) return Promise.resolve(ONESIGNAL_APP_ID);
    if (window.__mvOneSignalAppIdPromise) return window.__mvOneSignalAppIdPromise;
    window.__mvOneSignalAppIdPromise = new Promise((resolve, reject) => {
      const callback = "__mvOneSignalConfig_" + Math.random().toString(36).slice(2, 10);
      const script = document.createElement("script");
      const timeout = setTimeout(() => finalizar(new Error("Tempo esgotado ao carregar a configuração de notificações.")), 15000);
      function finalizar(erro, dados) {
        clearTimeout(timeout); delete window[callback]; script.remove();
        if (erro) { window.__mvOneSignalAppIdPromise = null; reject(erro); return; }
        ONESIGNAL_APP_ID = String(dados && dados.appId || "").trim();
        if (!ONESIGNAL_APP_ID) { window.__mvOneSignalAppIdPromise = null; reject(new Error("O App ID do OneSignal não está configurado nas Propriedades do Script.")); return; }
        resolve(ONESIGNAL_APP_ID);
      }
      window[callback] = dados => finalizar(null, dados);
      script.onerror = () => finalizar(new Error("Não foi possível consultar a configuração de notificações."));
      script.src = API_URL + "?action=configNotificacoes&callback=" + encodeURIComponent(callback) + "&t=" + Date.now();
      document.head.appendChild(script);
    });
    return window.__mvOneSignalAppIdPromise;
  }

  function carregarSdk() {
    if (window.OneSignal) return Promise.resolve();
    if (window.__mvOneSignalSdkPromise) return window.__mvOneSignalSdkPromise;

    const promise = new Promise((resolve, reject) => {
      let script = document.querySelector('script[data-mv-onesignal-sdk="1"]');
      let finalizado = false;
      const timeout = setTimeout(() => finalizar(new Error("Tempo esgotado ao carregar o serviço de notificações.")), 20000);

      function finalizar(erro) {
        if (finalizado) return;
        finalizado = true;
        clearTimeout(timeout);
        if (erro) {
          if (script) script.remove();
          reject(erro);
        } else {
          resolve();
        }
      }

      if (!script) {
        script = document.createElement("script");
        script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
        script.defer = true;
        script.async = true;
        script.dataset.mvOnesignalSdk = "1";
      }
      script.onload = () => finalizar(null);
      script.onerror = () => finalizar(new Error("Não foi possível carregar o serviço de notificações. Verifique a conexão ou bloqueios de conteúdo do navegador e tente novamente."));
      if (!script.isConnected) document.head.appendChild(script);
    });

    window.__mvOneSignalSdkPromise = promise;
    // Uma falha não pode ficar armazenada: a próxima chamada precisa tentar novamente.
    promise.catch(() => {
      if (window.__mvOneSignalSdkPromise === promise) {
        window.__mvOneSignalSdkPromise = null;
      }
    });
    return promise;
  }

  async function iniciarOneSignal() {
    if (initPromise) return initPromise;

    const tentativa = (async () => {
      await obterAppId();
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      await carregarSdk();

      return new Promise((resolve, reject) => {
        let finalizado = false;
        const timeout = setTimeout(() => finalizar(new Error("O OneSignal demorou demais para inicializar. Tente novamente.")), 20000);

        function finalizar(erro, valor) {
          if (finalizado) return;
          finalizado = true;
          clearTimeout(timeout);
          if (erro) reject(erro);
          else resolve(valor);
        }

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
            // Exibe o aviso visual do OneSignal na primeira abertura.
            // A permissão nativa só é solicitada depois que a pessoa interage com o aviso.
            if ("Notification" in window && Notification.permission === "default") {
              let jaSolicitou = false;
              try { jaSolicitou = localStorage.getItem("mv_onesignal_prompt_apresentado") === "1"; } catch (_) {}
              if (!jaSolicitou && OneSignal.Slidedown && typeof OneSignal.Slidedown.promptPush === "function") {
                try {
                  await OneSignal.Slidedown.promptPush();
                  try { localStorage.setItem("mv_onesignal_prompt_apresentado", "1"); } catch (_) {}
                } catch (promptErro) { console.warn("Não foi possível exibir o aviso de permissão:", promptErro); }
              }
            }
            finalizar(null, OneSignal);
          } catch (erro) {
            finalizar(erro);
          }
        });
      });
    })();

    initPromise = tentativa;
    try {
      return await tentativa;
    } catch (erro) {
      // Libera o estado da inicialização para permitir nova tentativa nesta mesma sessão.
      if (initPromise === tentativa) initPromise = null;
      throw erro;
    }
  }
  function ehDesktop() {
    return !(/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) &&
      window.matchMedia("(pointer: fine) and (min-width: 768px)").matches;
  }
  async function ativar() {
    const botao = document.getElementById("btnAtivarNotificacoes") || document.getElementById("btnAtivarNotificacoesPainel");
    if (botao) botao.disabled = true;
    try {
      if (!("Notification" in window)) {
        alert("Este navegador não oferece suporte a notificações.");
        return;
      }
      // O App ID é obtido de forma assíncrona do Apps Script; não testar
      // ONESIGNAL_APP_ID antes de iniciar, pois ele começa vazio nesta página.
      const OneSignal = await iniciarOneSignal();
      await OneSignal.Notifications.requestPermission();
      if (OneSignal.Notifications.permission) {
        alert("Notificações ativadas neste dispositivo. Você poderá receber avisos mesmo com o navegador fechado, conforme o suporte do navegador e do sistema.");
      } else {
        alert("A permissão de notificações não foi concedida. Você pode ativá-la nas configurações do navegador.");
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
    if (window.Auth && window.Auth.token()) {
      try { await iniciarOneSignal(); } catch (erro) { console.warn("OneSignal ainda não inicializado:", erro); }
    }
    document.querySelectorAll("#btnAtivarNotificacoes, #btnAtivarNotificacoesPainel").forEach(btn => {
      btn.hidden = !("Notification" in window) || Notification.permission === "granted";
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
