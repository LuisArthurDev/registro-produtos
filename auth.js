/* =========================================================
   auth.js — sessão do funcionário (Mapa de Validade)
   Use nas páginas de lançamento e de visualização:

     <script src="auth.js"></script>
     <script>
       Auth.exigirLogin();                  // volta ao login se não houver sessão
       const usuario = Auth.usuario();      // nome do funcionário logado
       const token = Auth.token();          // enviar como "sessao" nas ações
     </script>

   O token é conferido no servidor (Apps Script); este arquivo apenas o guarda.
   ========================================================= */
(function () {
  "use strict";

  const API_URL = "https://script.google.com/macros/s/AKfycbxDx57h_RgrSCBIPtkwCDZd00dFyM3SyAmtxWS5QzfqXJaLETbHKlVffZiclqhwKYApIA/exec";
  const CHAVE_SESSAO = "mv_sessao";
  const PAGINA_LOGIN = "login.html";

  function lerSessao() {
    try {
      const s = JSON.parse(localStorage.getItem(CHAVE_SESSAO) || "null");
      return s && s.token && s.ate > Date.now() ? s : null;
    } catch (_) {
      return null;
    }
  }

  function limparSessao() {
    try { localStorage.removeItem(CHAVE_SESSAO); } catch (_) {}
  }

  function irParaLogin() {
    limparSessao();
    const atual = (location.pathname.split("/").pop() || "").trim();
    const next = /^[A-Za-z0-9_\-]+\.html$/.test(atual) && atual !== PAGINA_LOGIN
      ? "?next=" + encodeURIComponent(atual)
      : "";
    location.replace(PAGINA_LOGIN + next);
  }

  let contador = 0;

  // Consulta ao Apps Script (JSONP). O token da sessão é enviado automaticamente.
  function chamar(action, callback, params, opcoes) {
    const incluirSessao = !opcoes || opcoes.semSessao !== true;

    return new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      const nomeCb = callback;
      let finalizado = false;

      const dados = Object.assign({}, params || {}, { action: action, callback: nomeCb });
      const sessao = lerSessao();
      if (incluirSessao && sessao) dados.sessao = sessao.token;

      const timeout = setTimeout(function () {
        finalizar(new Error("O servidor demorou para responder. Tente novamente."));
      }, 20000);

      function finalizar(erro, resposta) {
        if (finalizado) return;
        finalizado = true;
        clearTimeout(timeout);
        script.remove();
        delete window[nomeCb];

        if (erro) { reject(erro); return; }

        // Sessão vencida no servidor: volta ao login.
        if (resposta && resposta.precisaLogin) { irParaLogin(); return; }

        resolve(resposta);
      }

      window[nomeCb] = function (resposta) { finalizar(null, resposta); };
      script.onerror = function () { finalizar(new Error("Não foi possível conectar ao servidor.")); };
      script.src = API_URL + "?" + new URLSearchParams(dados).toString();
      document.head.appendChild(script);
      contador++;
    });
  }

  window.Auth = {
    usuario: function () { const s = lerSessao(); return s ? s.nome : ""; },
    token: function () { const s = lerSessao(); return s ? s.token : ""; },

    // Redireciona ao login quando não há sessão local; confirma com o servidor em seguida.
    exigirLogin: function () {
      if (!lerSessao()) { irParaLogin(); return false; }

      chamar("sessao", "__sessaoCb", {})
        .then(function (d) { if (!d || d.sucesso !== true) irParaLogin(); })
        .catch(function () { /* sem rede: mantém a tela; o servidor ainda valida cada ação */ });

      return true;
    },

    sair: function () {
      const sessao = lerSessao();
      const terminar = function () { limparSessao(); location.replace(PAGINA_LOGIN); };

      if (!sessao) { terminar(); return; }

      chamar("logout", "__logoutCb", {}).then(terminar, terminar);
    },

    // Chamada genérica ao servidor com o token da sessão.
    chamar: chamar,

    // Preenche um elemento com "Nome (Sair)".
    mostrarUsuario: function (idElemento) {
      const el = document.getElementById(idElemento);
      if (!el) return;

      el.textContent = "";
      const nome = document.createElement("strong");
      nome.textContent = Auth.usuario();
      const botao = document.createElement("button");
      botao.type = "button";
      botao.textContent = "Sair";
      botao.style.marginLeft = "10px";
      botao.addEventListener("click", Auth.sair);

      el.appendChild(nome);
      el.appendChild(botao);
    }
  };
})();
