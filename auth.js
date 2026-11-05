
/* =========================================================
   AUTENTICAÇÃO DO MAPA DE VALIDADE
   ========================================================= */

(function () {
  "use strict";

  const API_URL = "https://script.google.com/macros/s/AKfycbxDx57h_RgrSCBIPtkwCDZd00dFyM3SyAmtxWS5QzfqXJaLETbHKlVffZiclqhwKYApIA/exec";

  const CHAVE_SESSAO = "mv_sessao";
  const PAGINA_LOGIN = "index.html";
  const PAGINA_ERRO = "erro.html";
  const INATIVIDADE_MS = 30 * 60 * 1000;
  const PING_MINIMO_MS = 60 * 1000;
  let monitorAtivo = false;
  let timerInatividade = null;
  let ultimoPing = 0;
  let pingEmAndamento = false;

  function lerSessao() {
    try {
      const sessao = JSON.parse(
        localStorage.getItem(CHAVE_SESSAO) || "null"
      );

      const agora = Date.now();
      const atividade = Number(sessao && sessao.atividadeEm || agora);
      return sessao &&
        sessao.token &&
        sessao.ate > agora &&
        (sessao.manterConectado === true || agora - atividade < INATIVIDADE_MS)
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

  function salvarDadosSessao(dados) {
    try {
      const atual = JSON.parse(localStorage.getItem(CHAVE_SESSAO) || "null");
      if (!atual || !atual.token) return;
      if (dados && dados.criadaEm) {
        atual.criadaEm = Number(dados.criadaEm);
        atual.ate = Number(dados.ate || (atual.criadaEm + 8 * 60 * 60 * 1000));
      }
      if (dados && dados.atividadeEm) {
        atual.atividadeEm = Math.max(Number(atual.atividadeEm || 0), Number(dados.atividadeEm));
      }
      if (dados && typeof dados.manterConectado === "boolean") {
        atual.manterConectado = dados.manterConectado;
      }
      localStorage.setItem(CHAVE_SESSAO, JSON.stringify(atual));
    } catch (_) {}
  }

  function encerrarSessao(mensagem) {
    limparSessao();
    location.replace(PAGINA_ERRO + "?motivo=" + encodeURIComponent(
      mensagem || "Sua sessão expirou. Entre novamente."
    ));
  }

  function programarExpiracaoInatividade() {
    clearTimeout(timerInatividade);
    let sessaoBruta = null;
    try { sessaoBruta = JSON.parse(localStorage.getItem(CHAVE_SESSAO) || "null"); } catch (_) {}
    const sessao = lerSessao();
    if (!sessao) {
      if (sessaoBruta && Number(sessaoBruta.ate || 0) <= Date.now()) {
        encerrarSessao("Sua sessão atingiu o limite máximo de 8 horas. Entre novamente.");
      } else {
        encerrarSessao("Sua sessão foi encerrada após 30 minutos de inatividade. Entre novamente.");
      }
      return;
    }
    const atividade = Number(sessao.atividadeEm || Date.now());
    const restanteInatividade = sessao.manterConectado === true
      ? Number.POSITIVE_INFINITY
      : INATIVIDADE_MS - (Date.now() - atividade);
    const restanteAbsoluto = Number(sessao.ate) - Date.now();
    timerInatividade = setTimeout(function () {
      if (Date.now() >= Number(sessao.ate)) {
        encerrarSessao("Sua sessão atingiu o limite máximo de 8 horas. Entre novamente.");
      } else {
        encerrarSessao("Sua sessão foi encerrada após 30 minutos de inatividade. Entre novamente.");
      }
    }, Math.max(0, Math.min(restanteInatividade, restanteAbsoluto)));
  }

  function registrarAtividadeLocal() {
    const sessao = lerSessao();
    if (!sessao) {
      programarExpiracaoInatividade();
      return;
    }

    const agora = Date.now();
    sessao.atividadeEm = agora;
    try { localStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao)); } catch (_) {}
    programarExpiracaoInatividade();

    if (pingEmAndamento || agora - ultimoPing < PING_MINIMO_MS) return;
    pingEmAndamento = true;
    chamar("atividade", "__atividadeCb", {}, {}).then(function (resposta) {
      if (resposta && resposta.sucesso) {
        ultimoPing = Date.now();
        salvarDadosSessao({ atividadeEm: resposta.atividadeEm, ate: resposta.ate });
        programarExpiracaoInatividade();
      }
    }).catch(function () {}).finally(function () {
      pingEmAndamento = false;
    });
  }

  function iniciarMonitorAtividade(dadosServidor) {
    if (dadosServidor) salvarDadosSessao(dadosServidor);
    if (monitorAtivo) {
      programarExpiracaoInatividade();
      return;
    }
    monitorAtivo = true;
    programarExpiracaoInatividade();
    ["pointerdown", "keydown", "touchstart", "scroll"].forEach(function (evento) {
      window.addEventListener(evento, registrarAtividadeLocal, { passive: true });
    });
    window.addEventListener("storage", function (evento) {
      if (evento.key === CHAVE_SESSAO) programarExpiracaoInatividade();
    });
  }

  function ehComputador() {
    try {
      return !(/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) &&
        window.matchMedia("(pointer: fine) and (min-width: 768px)").matches;
    } catch (_) { return false; }
  }

  function atualizarBotoesPermanencia() {
    let sessao = null;
    try { sessao = JSON.parse(localStorage.getItem(CHAVE_SESSAO) || "null"); } catch (_) {}
    document.querySelectorAll("[data-manter-conectado]").forEach(function (botao) {
      if (!ehComputador()) { botao.hidden = true; return; }
      botao.hidden = false;
      const ativo = !!(sessao && sessao.manterConectado === true);
      botao.textContent = ativo ? "Conexão mantida" : "Manter conectado";
      botao.setAttribute("aria-pressed", ativo ? "true" : "false");
      botao.title = ativo
        ? "Desativar permanência; o limite de 30 minutos voltará a valer"
        : "Ignorar inatividade nesta sessão, mantendo o limite absoluto de 8 horas";
    });
  }

  async function alternarPermanencia() {
    if (!ehComputador()) return false;
    const atual = lerSessao();
    if (!atual) { encerrarSessao("Sua sessão expirou. Entre novamente."); return false; }
    const novoEstado = atual.manterConectado !== true;
    const resposta = await chamar("definirPermanenciaSessao", "__permanenciaCb", {
      ativo: novoEstado ? "1" : "0"
    }, {});
    if (!resposta || resposta.sucesso !== true) {
      throw new Error(resposta && resposta.mensagem || "Não foi possível atualizar a permanência da sessão.");
    }
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE_SESSAO) || "null");
      if (salvo) {
        salvo.manterConectado = novoEstado;
        if (!novoEstado) salvo.atividadeEm = Date.now();
        localStorage.setItem(CHAVE_SESSAO, JSON.stringify(salvo));
      }
    } catch (_) {}
    programarExpiracaoInatividade();
    atualizarBotoesPermanencia();
    return novoEstado;
  }

  function configurarBotoesPermanencia() {
    document.querySelectorAll("[data-manter-conectado]").forEach(function (botao) {
      if (botao.dataset.configurado === "1") return;
      botao.dataset.configurado = "1";
      botao.addEventListener("click", async function () {
        botao.disabled = true;
        try {
          const ativo = await alternarPermanencia();
          botao.textContent = ativo ? "Conexão mantida" : "Manter conectado";
        } catch (erro) {
          alert(erro.message || "Não foi possível alterar a sessão.");
        } finally { botao.disabled = false; atualizarBotoesPermanencia(); }
      });
    });
    atualizarBotoesPermanencia();
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
        (resposta.administrador !== true || resposta.administradorGeral === true)
      ) {
        redirecionarErro(
          "Esta página é exclusiva para administradores."
        );
        return false;
      }

      if (
        perfilEsperado === "geral" &&
        resposta.administradorGeral !== true
      ) {
        redirecionarErro("Esta página é exclusiva para o Administrador Geral.");
        return false;
      }

      if (
        perfilEsperado === "funcionario" &&
        (resposta.administrador === true || resposta.administradorGeral === true)
      ) {
        redirecionarErro(
          "Esta página é exclusiva para funcionários."
        );
        return false;
      }

      if (
        perfilEsperado === "lancamento" &&
        resposta.administradorGeral === true
      ) {
        redirecionarErro(
          "O Administrador Geral não realiza lançamentos."
        );
        return false;
      }

      // Sincroniza os prazos oficiais e monitora atividade real do usuário.
      iniciarMonitorAtividade(resposta);
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", configurarBotoesPermanencia, { once: true });
      } else {
        configurarBotoesPermanencia();
      }

      // Libera a interface somente depois da confirmação do servidor.
      document.documentElement.classList.add("auth-ok");
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
    try { if (window.MVNotificacoes && typeof window.MVNotificacoes.sair === "function") await window.MVNotificacoes.sair(); } catch (_) {}

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

    loginId: function () {
      const s = lerSessao();
      return s ? s.loginId : "";
    },

    loginId: function () {
      const s = lerSessao();
      return s ? s.loginId : "";
    },

    administrador: function () {
      const s = lerSessao();
      return !!(s && s.administrador === true);
    },

    administradorGeral: function () {
      const s = lerSessao();
      return !!(s && s.administradorGeral === true);
    },

    manterConectado: function () {
      const s = lerSessao();
      return !!(s && s.manterConectado === true);
    },

    dispositivoCelularProprio: function () {
      const s = lerSessao();
      return !!(s && s.dispositivoCelularProprio === true);
    },

    alternarPermanencia: alternarPermanencia,

    perfil: function () {
      const s = lerSessao();
      return s && s.perfil === "geral" ? "Administrador Geral" :
        (s && s.administrador ? "Administrador de Loja" : "Funcionário");
    },

    chamar: chamar,

    exigirLogin: function () {
      return validarPerfil(null);
    },

    exigirFuncionario: function () {
      return validarPerfil("funcionario");
    },

    exigirLancamento: function () {
      return validarPerfil("lancamento");
    },

    exigirAdmin: function () {
      return validarPerfil("admin");
    },

    exigirAdminGeral: function () {
      return validarPerfil("geral");
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
