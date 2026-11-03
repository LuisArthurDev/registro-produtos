/* =========================================================
   auth.js — Controle de sessão e segurança
   ========================================================= */
(function () {
  "use strict";

  const CHAVE_SESSAO = "mv_sessao";
  const PAGINA_LOGIN = "index.html";

  function lerSessao() {
    try {
      const s = JSON.parse(localStorage.getItem(CHAVE_SESSAO) || "null");
      return s && s.token && s.ate > Date.now() ? s : null;
    } catch (_) {
      return null;
    }
  }

  function irParaLogin() {
    try { localStorage.removeItem(CHAVE_SESSAO); } catch (_) {}
    const atual = (location.pathname.split("/").pop() || "").trim();
    if (atual !== PAGINA_LOGIN) {
      location.replace(PAGINA_LOGIN + "?erro=nao_autenticado");
    }
  }

  window.Auth = {
    usuario: function () { const s = lerSessao(); return s ? s.nome : ""; },
    token: function () { const s = lerSessao(); return s ? s.token : ""; },
    isAdmin: function () { const s = lerSessao(); return s ? !!s.isAdmin : false; },
    loja: function () { const s = lerSessao(); return s ? s.loja : ""; },

    exigirLogin: function (requerAdmin = false) {
      const s = lerSessao();
      if (!s) {
        irParaLogin();
        return false;
      }
      if (requerAdmin && !s.isAdmin) {
        alert("Acesso restrito a administradores.");
        location.replace(PAGINA_LOGIN);
        return false;
      }
      return true;
    },

    sair: function () {
      try { localStorage.removeItem(CHAVE_SESSAO); } catch (_) {}
      location.replace(PAGINA_LOGIN);
    }
  };
})();
