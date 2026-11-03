/* =========================================================
   AUTENTICAÇÃO DO MAPA DE VALIDADE
   index.html é a tela de login; lancamento.html é o formulário.
   ========================================================= */
(function () {
  "use strict";

  const API_URL = "https://script.google.com/macros/s/AKfycbxDx57h_RgrSCBIPtkwCDZd00dFyM3SyAmtxWS5QzfqXJaLETbHKlVffZiclqhwKYApIA/exec";
  const CHAVE_SESSAO = "mv_sessao";
  const PAGINA_LOGIN = "index.html";
  const PAGINA_ERRO = "erro.html";

  function lerSessao() {
    try {
      const s = JSON.parse(localStorage.getItem(CHAVE_SESSAO) || "null");
      return s && s.token && s.ate > Date.now() ? s : null;
    } catch (_) {
      return null;
    }
  }

  function salvarSessaoServidor(dados) {
    const atual = lerSessao() || {};
    const sessao = Object.assign({}, atual, {
      token: atual.token,
      nome: dados.nome || atual.nome || "",
      loja: dados.loja || atual.loja || "",
      administrador: dados.administrador === true,
      especial: dados.especial === true,
      ate: atual.ate || (Date.now() + 5.9 * 60 * 60 * 1000)
    });
    try { localStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao)); } catch (_) {}
    return sessao;
  }

  function limparSessao() {
    try { localStorage.removeItem(CHAVE_SESSAO); } catch (_) {}
  }

  function redirecionarErro(mensagem) {
    limparSessao();
    location.replace(PAGINA_ERRO + "?motivo=" + encodeURIComponent(mensagem || "Acesso não autorizado."));
  }

  function chamar(action, callback, params, opcoes) {
    const incluirSessao = !opcoes || opcoes.semSessao !== true;
    return new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      let finalizado = false;
      const dados = Object.assign({}, params || {}, { action: action, callback: callback });
      const sessao = lerSessao();
      if (incluirSessao && sessao) dados.sessao = sessao.token;

      const timeout = setTimeout(function () {
        finalizar(new Error("O servidor demorou para responder."));
      }, 20000);

      function finalizar(erro, resposta) {
        if (finalizado) return;
        finalizado = true;
        clearTimeout(timeout);
        script.remove();
        try { delete window[callback]; } catch (_) { window[callback] = undefined; }
        if (erro) return reject(erro);
        if (resposta && resposta.precisaLogin) {
          redirecionarErro("Sua sessão expirou.");
          return;
        }
        resolve(resposta);
      }

      window[callback] = resposta => finalizar(null, resposta);
      script.onerror = () => finalizar(new Error("Não foi possível conectar ao servidor."));
      script.src = API_URL + "?" + new URLSearchParams(dados).toString();
      document.head.appendChild(script);
    });
  }

  async function validarPerfil(perfilEsperado) {
    if (!lerSessao()) {
      redirecionarErro("Você precisa entrar no sistema.");
      return false;
    }
    try {
      const resposta = await chamar("sessao", "__sessaoCb", {}, {});
      if (!resposta || resposta.sucesso !== true) {
        redirecionarErro("Sua sessão expirou.");
        return false;
      }
      const sessao = salvarSessaoServidor(resposta);
      if (perfilEsperado === "admin" && !sessao.administrador) {
        redirecionarErro("Esta página é exclusiva para administradores.");
        return false;
      }
      if (perfilEsperado === "funcionario" && sessao.administrador) {
        redirecionarErro("Administradores devem acessar o Painel Conferente.");
        return false;
      }
      atualizarCabecalho();
      return true;
    } catch (_) {
      redirecionarErro("Não foi possível validar sua sessão.");
      return false;
    }
  }

  function atualizarCabecalho() {
    const s = lerSessao();
    if (!s) return;
    const usuario = document.getElementById("authUsuario");
    if (usuario) usuario.textContent = s.nome + " · " + (s.administrador ? "Administrador" : "Funcionário") + " · Loja " + (s.loja || "—");
    document.querySelectorAll("[data-auth-admin]").forEach(el => { el.hidden = !s.administrador; });
  }

  async function sair() {
    const s = lerSessao();
    if (s && s.token) {
      try { await chamar("logout", "__logoutCb", {}, {}); } catch (_) {}
    }
    limparSessao();
    location.replace(PAGINA_LOGIN);
  }

  // API exigirLogin() é síncrona para ser compatível com as páginas existentes:
  // o redirecionamento sem token começa antes de executar a lógica da tela.
  window.Auth = {
    token: () => (lerSessao() || {}).token || "",
    usuario: () => (lerSessao() || {}).nome || "",
    loja: () => (lerSessao() || {}).loja || "",
    administrador: () => !!((lerSessao() || {}).administrador),
    perfil: () => ((lerSessao() || {}).administrador ? "Administrador" : "Funcionário"),
    chamar: chamar,
    exigirLogin: function () {
      if (!lerSessao()) {
        redirecionarErro("Você precisa entrar no sistema.");
        return false;
      }
      validarPerfil(null);
      return true;
    },
    exigirFuncionario: function () { return validarPerfil("funcionario"); },
    exigirAdmin: function () { return validarPerfil("admin"); },
    validarPerfil: validarPerfil,
    sair: sair,
    mostrarUsuario: function (id) {
      const el = document.getElementById(id);
      const s = lerSessao();
      if (el && s) el.textContent = s.nome + " · " + this.perfil() + " · Loja " + (s.loja || "—");
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", atualizarCabecalho);
  else atualizarCabecalho();
})();
