
/* =========================================================
   AUTENTICAÇÃO DO MAPA DE VALIDADE
   ========================================================= */

(function () {
  "use strict";

  const API_URL = "https://script.google.com/macros/s/AKfycbxDx57h_RgrSCBIPtkwCDZd00dFyM3SyAmtxWS5QzfqXJaLETbHKlVffZiclqhwKYApIA/exec";

  const CHAVE_SESSAO = "mv_sessao";
  const PAGINA_LOGIN = "index.html";
  const PAGINA_ERRO = "erro.html";

  function lerSessao() {
    try {
      const sessao = JSON.parse(
        localStorage.getItem(CHAVE_SESSAO) || "null"
      );

      return sessao &&
        sessao.token &&
        sessao.ate > Date.now()
        ? sessao
        : null;

    } catch (e) {
      return null;
    }
  }

  function limparSessao() {
    try {
      localStorage.removeItem(CHAVE_SESSAO);
    } catch (e) {}
  }

  function redirecionarErro(mensagem) {
    limparSessao();

    location.replace(
      PAGINA_ERRO + "?motivo=" +
      encodeURIComponent(mensagem || "Acesso não autorizado.")
    );
  }

  function chamar(action, callback, params, opcoes) {
    const incluirSessao = !opcoes || opcoes.semSessao !== true;

    return new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      let finalizado = false;

      const dados = Object.assign(
        {},
        params || {},
        {
          action: action,
          callback: callback
        }
      );

      const sessao = lerSessao();

      if (incluirSessao && sessao) {
        dados.sessao = sessao.token;
      }

      const timeout = setTimeout(function () {
        finalizar(
          new Error("O servidor demorou para responder.")
        );
      }, 20000);

      function finalizar(erro, resposta) {
        if (finalizado) return;

        finalizado = true;
        clearTimeout(timeout);
        script.remove();
        delete window[callback];

        if (erro) {
          reject(erro);
          return;
        }

        if (resposta && resposta.precisaLogin) {
          redirecionarErro("Sua sessão expirou.");
          return;
        }

        resolve(resposta);
      }

      window[callback] = function (resposta) {
        finalizar(null, resposta);
      };

      script.onerror = function () {
        finalizar(
          new Error("Não foi possível conectar ao servidor.")
        );
      };

      script.src =
        API_URL + "?" + new URLSearchParams(dados).toString();

      document.head.appendChild(script);
    });
  }

  async function validarPerfil(perfilEsperado) {
    const sessao = lerSessao();

    if (!sessao) {
      redirecionarErro("Você precisa entrar no sistema.");
      return false;
    }

    try {
      const resposta = await chamar(
        "sessao",
        "__sessaoCb",
        {},
        {}
      );

      if (!resposta || resposta.sucesso !== true) {
        redirecionarErro("Sua sessão expirou.");
        return false;
      }

      if (
        perfilEsperado === "admin" &&
        resposta.administrador !== true
      ) {
        redirecionarErro(
          "Esta página é exclusiva para administradores."
        );
        return false;
      }

      if (
        perfilEsperado === "funcionario" &&
        resposta.administrador === true
      ) {
        redirecionarErro(
          "Administradores devem acessar o Painel Conferente."
        );
        return false;
      }

      return true;

    } catch (erro) {
      redirecionarErro(
        "Não foi possível validar sua sessão."
      );
      return false;
    }
  }

  async function sair() {
    const sessao = lerSessao();

    if (sessao) {
      try {
        await chamar(
          "logout",
          "__logoutCb",
          {},
          {}
        );
      } catch (e) {}
    }

    limparSessao();
    location.replace(PAGINA_LOGIN);
  }

  window.Auth = {
    token: function () {
      const s = lerSessao();
      return s ? s.token : "";
    },

    usuario: function () {
      const s = lerSessao();
      return s ? s.nome : "";
    },

    loja: function () {
      const s = lerSessao();
      return s ? s.loja : "";
    },

    administrador: function () {
      const s = lerSessao();
      return !!(s && s.administrador === true);
    },

    perfil: function () {
      return this.administrador()
        ? "Administrador"
        : "Funcionário";
    },

    chamar: chamar,

    exigirLogin: function () {
      return validarPerfil(null);
    },

    exigirFuncionario: function () {
      return validarPerfil("funcionario");
    },

    exigirAdmin: function () {
      return validarPerfil("admin");
    },

    sair: sair,

    mostrarUsuario: function (idElemento) {
      const elemento = document.getElementById(idElemento);
      if (!elemento) return;

      elemento.textContent =
        this.usuario() + " · Loja " + this.loja();
    }
  };

})();
