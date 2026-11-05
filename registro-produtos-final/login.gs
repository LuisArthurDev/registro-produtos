
/* ============================================================
   LOGIN INDIVIDUAL — FUNCIONÁRIOS E ADMINISTRADORES
   Funcionarios:
   A = Nome
   B = Especial
   F = Check
   G = PIN criptografado
   H = Administrador
   I = Loja
   ============================================================ */

const SESSAO_SEGUNDOS_ = 28800; // duração máxima absoluta: 8 horas
const INATIVIDADE_SEGUNDOS_ = 1800; // encerra após 30 minutos sem atividade
const MAX_TENTATIVAS_ = 5;
const BLOQUEIO_SEGUNDOS_ = 900;
const COLUNA_PIN_ = 7;

let CONFIG_MEMO_ = null;

function lerConfig_() {
  if (CONFIG_MEMO_) return CONFIG_MEMO_;

  let config = {};

  try {
    config = JSON.parse(
      PropertiesService.getScriptProperties()
        .getProperty("MV_CONFIG") || "{}"
    );
  } catch (e) {}

  CONFIG_MEMO_ = config;
  return config;
}

function salvarConfig_(config) {
  PropertiesService.getScriptProperties()
    .setProperty("MV_CONFIG", JSON.stringify(config));

  CONFIG_MEMO_ = config;
}

function ativarLoginObrigatorio() {
  const config = lerConfig_();
  config.obrigatoria = true;
  salvarConfig_(config);
  console.log("Login obrigatório ativado.");
}

function desativarLoginObrigatorio() {
  const config = lerConfig_();
  config.obrigatoria = false;
  salvarConfig_(config);
  console.log("Login obrigatório desativado.");
}

function loginObrigatorio_() {
  return lerConfig_().obrigatoria !== false;
}

function pepperPin_() {
  const config = lerConfig_();

  if (!config.pepper) {
    config.pepper = Utilities.getUuid() + Utilities.getUuid();
    salvarConfig_(config);
  }

  return config.pepper;
}

function hashPin_(pin, salt) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    pepperPin_() + ":" + salt + ":" + pin,
    Utilities.Charset.UTF_8
  );

  return Utilities.base64EncodeWebSafe(bytes);
}

function pinValido_(pin) {
  return /^\d{4,6}$/.test(String(pin || ""));
}

function compararSeguro_(a, b) {
  a = String(a);
  b = String(b);

  if (a.length !== b.length) return false;

  let resultado = 0;

  for (let i = 0; i < a.length; i++) {
    resultado |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return resultado === 0;
}

function novoToken_() {
  return (Utilities.getUuid() + Utilities.getUuid())
    .replace(/-/g, "");
}

function tokenFormatoValido_(token) {
  return /^[a-f0-9]{64}$/.test(String(token || ""));
}

function chaveSessao_(token) {
  return "MV_SESSAO_" + String(token || "");
}

function lerSessao_(token) {
  if (!tokenFormatoValido_(token)) return null;
  const valor = PropertiesService.getScriptProperties()
    .getProperty(chaveSessao_(token));
  if (!valor) return null;
  try { return JSON.parse(valor); } catch (e) { return null; }
}

function salvarSessao_(token, sessao) {
  PropertiesService.getScriptProperties()
    .setProperty(chaveSessao_(token), JSON.stringify(sessao));
}

function removerSessao_(token) {
  if (!tokenFormatoValido_(token)) return;
  PropertiesService.getScriptProperties()
    .deleteProperty(chaveSessao_(token));
}

function limparSessoesExpiradas_() {
  const propriedades = PropertiesService.getScriptProperties();
  const todas = propriedades.getProperties();
  const agora = Date.now();
  Object.keys(todas).forEach(function (chave) {
    if (chave.indexOf("MV_SESSAO_") !== 0) return;
    try {
      const sessao = JSON.parse(todas[chave]);
      const criadaEm = Number(sessao.criadaEm || 0);
      const atividade = Number(sessao.ultimaAtividade || criadaEm);
      if (!criadaEm || agora >= criadaEm + SESSAO_SEGUNDOS_ * 1000 ||
          (!sessao.manterConectado && (!atividade || agora - atividade >= INATIVIDADE_SEGUNDOS_ * 1000))) {
        propriedades.deleteProperty(chave);
      }
    } catch (_) {
      propriedades.deleteProperty(chave);
    }
  });
}

/* ============================================================
   TENTATIVAS DE LOGIN
   ============================================================ */

function chaveTentativas_(id) {
  return "tent_" + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.MD5,
      String(id)
    )
  ).replace(/=/g, "");
}

function verificarBloqueio_(chave) {
  if (CacheService.getScriptCache().get(chave + "_b")) {
    throw new Error(
      "Muitas tentativas incorretas. Aguarde 15 minutos."
    );
  }
}

function registrarFalha_(chave) {
  const cache = CacheService.getScriptCache();
  const quantidade = Number(cache.get(chave) || 0) + 1;

  cache.put(chave, String(quantidade), BLOQUEIO_SEGUNDOS_);

  if (quantidade >= MAX_TENTATIVAS_) {
    cache.put(chave + "_b", "1", BLOQUEIO_SEGUNDOS_);
  }
}

function limparFalhas_(chave) {
  const cache = CacheService.getScriptCache();
  cache.remove(chave);
  cache.remove(chave + "_b");
}

/* ============================================================
   CADASTRO DE FUNCIONÁRIOS
   ============================================================ */

function buscarFuncionarioPorNome_(nome) {
  // Reutiliza a leitura A:J da aba Funcionarios durante esta requisição.
  // doGet reinicia esse cache em toda chamada, então alterações de perfil
  // e inativações continuam sendo verificadas em cada nova requisição.
  const dados = typeof linhasFuncionariosDaRequisicao_ === "function"
    ? linhasFuncionariosDaRequisicao_()
    : (() => {
        const planilha = SpreadsheetApp.openById(SPREADSHEET_ID);
        const aba = planilha.getSheetByName("Funcionarios");
        return (!aba || aba.getLastRow() < 2) ? [] : aba.getRange(2, 1, aba.getLastRow() - 1, 10).getValues();
      })();
  if (!dados.length) return null;

  const alvo = normalizarTexto_(nome);

  for (let i = 0; i < dados.length; i++) {
    const linha = dados[i];
    const nomeCadastro = String(linha[0] || "").trim();

    if (
      !nomeCadastro ||
      normalizarTexto_(nomeCadastro) === "transferencias"
    ) continue;

    if (normalizarTexto_(nomeCadastro) !== alvo) continue;

    return {
      nome: nomeCadastro,
      especial: linha[1] === true,
      pin: String(linha[6] || "").trim(),
      administrador: ehAdministradorValor_(linha[7]),
      administradorGeral: ehAdministradorGeralValor_(linha[7]),
      perfil: ehAdministradorGeralValor_(linha[7]) ? "geral" : (ehAdministradorValor_(linha[7]) ? "admin" : "funcionario"),
      loja: normalizarLoja_(linha[8]),
      ativo: !(String(linha[9] || "").toLowerCase() === "inativo" || linha[9] === false),
      linha: i + 2
    };
  }

  return null;
}

/* ============================================================
   LOGIN
   ============================================================ */

/* ============================================================
   CELULAR PRÓPRIO — autorização individual por funcionário
   O servidor armazena somente hashes dos tokens dos dispositivos.
   ============================================================ */
function chaveCelularProprio_(nome, loja) {
  const identidade = normalizarTexto_(nome) + "|" + normalizarLoja_(loja);
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, identidade, Utilities.Charset.UTF_8
  )).replace(/=+$/g, "").slice(0, 32);
}
function propriedadesCelularProprio_(nome, loja) {
  const chave = chaveCelularProprio_(nome, loja);
  const slug = normalizarTexto_(nome).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return { ativo: "MV_CELULAR_" + chave + "_ATIVO", hash: "MV_CELULAR_" + chave + "_TOKEN_HASH", externalId: "mv_celular_" + normalizarLoja_(loja) + "_" + slug };
}
function celularProprioAtivo_(nome, loja) {
  const funcionario = buscarFuncionarioPorNome_(nome);
  if (!funcionario || normalizarLoja_(funcionario.loja) !== normalizarLoja_(loja)) return false;
  const planilha = typeof planilhaDaRequisicao_ === "function"
    ? planilhaDaRequisicao_()
    : SpreadsheetApp.openById(SPREADSHEET_ID);
  const aba = planilha.getSheetByName("Funcionarios");
  return !!(aba && celularProprioAtivoNaLinha_(aba, funcionario.linha));
}
function hashTokenCelularProprio_(token) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, String(token || ""), Utilities.Charset.UTF_8
  )).replace(/=+$/g, "");
}
function montarSessaoFuncionario_(funcionario, manterConectado) {
  limparSessoesExpiradas_();
  const token = novoToken_();
  const agora = Date.now();
  const sessao = {
    nome: funcionario.nome, loja: funcionario.loja,
    administrador: funcionario.administrador, administradorGeral: funcionario.administradorGeral,
    perfil: funcionario.perfil, especial: funcionario.especial,
    loginId: Utilities.getUuid(), criadaEm: agora, ultimaAtividade: agora,
    manterConectado: manterConectado === true,
    dispositivoCelularProprio: manterConectado === true
  };
  salvarSessao_(token, sessao);
  return {
    sucesso: true, token: token, nome: funcionario.nome, loja: funcionario.loja,
    administrador: funcionario.administrador, administradorGeral: funcionario.administradorGeral,
    perfil: funcionario.perfil, especial: funcionario.especial, loginId: sessao.loginId,
    criadaEm: agora, atividadeEm: agora, ate: agora + SESSAO_SEGUNDOS_ * 1000,
    manterConectado: sessao.manterConectado,
    dispositivoCelularProprio: manterConectado === true
  };
}

function registrarCelularProprio_(p) {
  const cb = "__registrarCelularProprioCb";
  if (String(p.callback || "") !== cb) return respostaTexto_("Callback inválido.");
  try {
    const tokenSessao = String(p.sessao || "");
    const sessao = obterSessaoObrigatoria_({ sessao: tokenSessao });
    const propsCelular = propriedadesCelularProprio_(sessao.nome, sessao.loja);
    const props = PropertiesService.getScriptProperties();
    if (!celularProprioAtivo_(sessao.nome, sessao.loja)) throw new Error("O administrador ainda não habilitou o celular próprio para esta conta.");
    const token = String(p.tokenDispositivo || "");
    if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error("Chave do dispositivo inválida.");
    const funcionario = buscarFuncionarioPorNome_(sessao.nome);
    if (!funcionario || funcionario.ativo === false || normalizarLoja_(funcionario.loja) !== normalizarLoja_(sessao.loja)) throw new Error("Funcionário inativo ou cadastro alterado.");
    props.setProperty(propsCelular.hash, hashTokenCelularProprio_(token));
    sessao.manterConectado = true;
    sessao.dispositivoCelularProprio = true;
    sessao.ultimaAtividade = Date.now();
    salvarSessao_(tokenSessao, sessao);
    return respostaJsonp_(cb, { sucesso: true, externalId: propsCelular.externalId, manterConectado: true, mensagem: "Este celular foi autorizado para " + sessao.nome + "." });
  } catch (erro) {
    return respostaJsonp_(cb, { sucesso: false, mensagem: mensagemErro_(erro) });
  }
}

function loginDispositivoProprio_(p) {
  const cb = "__loginDispositivoProprioCb";
  if (String(p.callback || "") !== cb) return respostaTexto_("Callback inválido.");
  try {
    const nome = String(p.nome || "").trim();
    const loja = normalizarLoja_(p.loja || "");
    const funcionario = buscarFuncionarioPorNome_(nome);
    if (!funcionario || funcionario.ativo === false || normalizarLoja_(funcionario.loja) !== loja) throw new Error("Dispositivo não autorizado.");
    const k = propriedadesCelularProprio_(funcionario.nome, funcionario.loja);
    const props = PropertiesService.getScriptProperties();
    if (!celularProprioAtivo_(funcionario.nome, funcionario.loja)) throw new Error("Dispositivo não autorizado.");
    const token = String(p.tokenDispositivo || "");
    if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error("Dispositivo não autorizado.");
    const salvo = String(props.getProperty(k.hash) || "");
    if (!salvo || !compararSeguro_(hashTokenCelularProprio_(token), salvo)) throw new Error("Dispositivo não autorizado.");
    return respostaJsonp_(cb, montarSessaoFuncionario_(funcionario, true));
  } catch (erro) {
    return respostaJsonp_(cb, { sucesso: false, mensagem: mensagemErro_(erro) });
  }
}

function gerenciarCelularProprio_(p) {
  const cb = "__celularProprioCb";
  if (String(p.callback || "") !== cb) return respostaTexto_("Callback inválido.");
  const lock = LockService.getScriptLock();
  try {
    const admin = obterSessaoObrigatoria_({ sessao: p.sessao });
    if (admin.administrador !== true && admin.administradorGeral !== true) throw new Error("Ação exclusiva para administradores.");
    const nome = String(p.nome || "").trim();
    const loja = normalizarLoja_(p.loja || "");
    const funcionario = buscarFuncionarioPorNome_(nome);
    if (!funcionario || normalizarLoja_(funcionario.loja) !== loja) throw new Error("Funcionário não encontrado.");
    if (admin.administradorGeral !== true && normalizarLoja_(admin.loja) !== loja) throw new Error("Você só pode gerenciar funcionários da sua loja.");
    const aba = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Funcionarios");
    if (!aba) throw new Error('A aba "Funcionarios" não foi encontrada.');
    const modo = String(p.modo || "status");
    let ativo = celularProprioAtivoNaLinha_(aba, funcionario.linha);
    const k = propriedadesCelularProprio_(funcionario.nome, funcionario.loja);
    const props = PropertiesService.getScriptProperties();
    if (modo === "alternar") {
      const novoAtivo = String(p.ativo || "0") === "1";
      if (novoAtivo && funcionario.ativo === false) throw new Error("Reative o funcionário antes de habilitar o celular próprio.");
      lock.waitLock(15000);
      gravarCelularProprioNaLinha_(aba, funcionario.linha, novoAtivo);
      if (!novoAtivo) props.deleteProperty(k.hash);
      ativo = novoAtivo;
    }
    return respostaJsonp_(cb, { sucesso: true, nome: funcionario.nome, loja: funcionario.loja, ativo, dispositivoAutorizado: !!props.getProperty(k.hash), mensagem: ativo ? "Celular próprio habilitado." : "Celular próprio desabilitado." });
  } catch (erro) {
    return respostaJsonp_(cb, { sucesso: false, mensagem: mensagemErro_(erro) });
  } finally {
    try { if (lock.hasLock()) lock.releaseLock(); } catch (_) {}
  }
}

function login_(p) {
  const callback = "__loginCb";

  if (String(p.callback || "") !== callback) {
    return respostaTexto_("Callback inválido.");
  }

  try {
    const usuario = String(p.usuario || "").trim();
    const pin = String(p.pin || "").trim();

    if (!usuario || !pinValido_(pin)) {
      throw new Error("Usuário ou PIN incorretos.");
    }

    const chave = chaveTentativas_(
      normalizarTexto_(usuario)
    );

    verificarBloqueio_(chave);

    const funcionario = buscarFuncionarioPorNome_(usuario);

    if (
      !funcionario ||
      !funcionario.pin ||
      funcionario.pin.indexOf(":") < 0
    ) {
      registrarFalha_(chave);
      throw new Error("Usuário ou PIN incorretos.");
    }

    const partes = funcionario.pin.split(":");
    const hashCalculado = hashPin_(pin, partes[0]);

    if (!compararSeguro_(hashCalculado, partes[1] || "")) {
      registrarFalha_(chave);
      throw new Error("Usuário ou PIN incorretos.");
    }

    if (!funcionario.administradorGeral && !funcionario.loja) {
      throw new Error(
        "Sua loja não está definida no cadastro. Solicite ao administrador."
      );
    }

    limparFalhas_(chave);

    const resultadoSessao = montarSessaoFuncionario_(funcionario, false);
    resultadoSessao.celularProprioDisponivel = celularProprioAtivo_(funcionario.nome, funcionario.loja);
    return respostaJsonp_(callback, resultadoSessao);

  } catch (erro) {
    return respostaJsonp_(callback, {
      sucesso: false,
      mensagem: mensagemErro_(erro)
    });
  }
}

/* ============================================================
   VALIDAR SESSÃO
   ============================================================ */

function consultarSessao_(p) {
  const callback = "__sessaoCb";

  if (String(p.callback || "") !== callback) {
    return respostaTexto_("Callback inválido.");
  }

  try {
    const sessao = obterSessaoObrigatoria_({ sessao: p.sessao });
    return respostaJsonp_(callback, {
      sucesso: true,
      nome: sessao.nome,
      loja: sessao.loja,
      administrador: sessao.administrador,
      administradorGeral: sessao.administradorGeral === true,
      perfil: sessao.perfil || (sessao.administrador ? "admin" : "funcionario"),
      especial: sessao.especial,
      loginId: sessao.loginId,
      criadaEm: sessao.criadaEm,
      atividadeEm: sessao.ultimaAtividade || sessao.criadaEm,
      ate: sessao.criadaEm + SESSAO_SEGUNDOS_ * 1000,
      manterConectado: sessao.manterConectado === true,
      celularProprioDisponivel: celularProprioAtivo_(sessao.nome, sessao.loja)
    });
  } catch (erro) {
    return respostaJsonp_(callback, {
      sucesso: false,
      precisaLogin: true,
      mensagem: mensagemErro_(erro)
    });
  }
}

/* ============================================================
   REGISTRAR ATIVIDADE DO USUÁRIO
   ============================================================ */
function definirPermanenciaSessao_(p) {
  const callback = "__permanenciaCb";
  if (String(p.callback || "") !== callback) return respostaTexto_("Callback inválido.");
  try {
    const token = String(p.sessao || "");
    const sessao = obterSessaoObrigatoria_({ sessao: token });
    const ativo = String(p.ativo || "0") === "1";
    sessao.manterConectado = ativo;
    if (!ativo) sessao.ultimaAtividade = Date.now();
    salvarSessao_(token, sessao);
    return respostaJsonp_(callback, {
      sucesso: true,
      manterConectado: ativo,
      atividadeEm: sessao.ultimaAtividade || sessao.criadaEm,
      ate: sessao.criadaEm + SESSAO_SEGUNDOS_ * 1000
    });
  } catch (erro) {
    return respostaJsonp_(callback, { sucesso: false, precisaLogin: true, mensagem: mensagemErro_(erro) });
  }
}

function registrarAtividadeSessao_(p) {
  const callback = "__atividadeCb";
  if (String(p.callback || "") !== callback) {
    return respostaTexto_("Callback inválido.");
  }

  try {
    const token = String(p.sessao || "");
    const sessao = obterSessaoObrigatoria_({ sessao: token });
    const agora = Date.now();
    const expiraOriginal = Number(sessao.criadaEm || agora) + SESSAO_SEGUNDOS_ * 1000;
    if (expiraOriginal <= agora) throw new Error("Sessão expirada. Entre novamente.");

    // No celular próprio autorizado, a janela de 8 horas é deslizante:
    // cada atividade renova a sessão enquanto a autorização permanecer ativa.
    if (sessao.dispositivoCelularProprio === true) sessao.criadaEm = agora;
    sessao.ultimaAtividade = agora;
    salvarSessao_(token, sessao);
    const expiraEm = Number(sessao.criadaEm || agora) + SESSAO_SEGUNDOS_ * 1000;

    return respostaJsonp_(callback, {
      sucesso: true,
      criadaEm: sessao.criadaEm,
      atividadeEm: agora,
      ate: expiraEm
    });
  } catch (erro) {
    return respostaJsonp_(callback, {
      sucesso: false,
      precisaLogin: true,
      mensagem: mensagemErro_(erro)
    });
  }
}

/* ============================================================
   LOGOUT
   ============================================================ */

function logout_(p) {
  const callback = "__logoutCb";

  if (String(p.callback || "") !== callback) {
    return respostaTexto_("Callback inválido.");
  }

  removerSessao_(p.sessao);

  return respostaJsonp_(callback, {
    sucesso: true
  });
}

/* ============================================================
   DEFINIR PIN PELO PAINEL
   ============================================================ */

function definirPinFuncionario_(p) {
  const callback = "__definirPinCb";

  if (String(p.callback || "") !== callback) {
    return respostaTexto_("Callback inválido.");
  }

  const lock = LockService.getScriptLock();

  try {
    const admin = exigirAdministrador_(p);

    const nome = String(p.nome || "").trim();
    const pin = String(p.pin || "").trim();

    if (!nome) {
      throw new Error("Funcionário não informado.");
    }

    if (!pinValido_(pin)) {
      throw new Error("O PIN deve ter de 4 a 6 números.");
    }

    if (!lock.tryLock(15000)) {
      throw new Error("Sistema ocupado. Tente novamente.");
    }

    const funcionario = buscarFuncionarioPorNome_(nome);

    if (
      !funcionario ||
      funcionario.loja !== admin.loja
    ) {
      throw new Error(
        "Funcionário não encontrado na sua loja."
      );
    }
    if (funcionario.especial) {
      throw new Error("Abas especiais não podem ter PIN de acesso.");
    }

    const aba = SpreadsheetApp.openById(SPREADSHEET_ID)
      .getSheetByName("Funcionarios");

    const salt = Utilities.getUuid();
    const hash = hashPin_(pin, salt);

    aba.getRange(funcionario.linha, 7)
      .setNumberFormat("@")
      .setValue(salt + ":" + hash);

    if (!aba.getRange(1, 7).getValue()) {
      aba.getRange(1, 7).setValue("PIN (criptografado)");
    }

    limparFalhas_(
      chaveTentativas_(normalizarTexto_(nome))
    );

    SpreadsheetApp.flush();

    return respostaJsonp_(callback, {
      sucesso: true,
      mensagem: "PIN definido para " + nome + "."
    });

  } catch (erro) {
    return respostaJsonp_(callback, {
      sucesso: false,
      mensagem: mensagemErro_(erro)
    });

  } finally {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
  }
}


/**
 * BOOTSTRAP: execute manualmente no editor do Apps Script apenas se ainda
 * não existir nenhum administrador com PIN. Não é exposta por doGet.
 * Depois do primeiro login, os demais PINs devem ser definidos pelo Painel.
 */
function definirPinInicialAdmin(nome, pin) {
  const funcionario = buscarFuncionarioPorNome_(nome);
  if (!funcionario || !funcionario.administrador || funcionario.administradorGeral) {
    throw new Error("O nome informado não está marcado como Administrador de Loja na coluna H.");
  }
  if (!funcionario.loja) throw new Error("Preencha a loja na coluna I antes de definir o PIN.");
  if (!pinValido_(pin)) throw new Error("O PIN deve conter de 4 a 6 números.");
  const salt = Utilities.getUuid();
  const hash = hashPin_(String(pin), salt);
  SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Funcionarios")
    .getRange(funcionario.linha, COLUNA_PIN_).setNumberFormat("@")
    .setValue(salt + ":" + hash);
  return "PIN inicial definido. Acesse o sistema e entre como administrador.";
}


/**
 * CONFIGURAÇÃO INICIAL — execute manualmente no Apps Script uma única vez.
 * A linha precisa existir na aba Funcionarios, com o nome na coluna A.
 * A função grava H=GERAL, remove a validação de checkbox dessa célula,
 * deixa I vazia e grava o PIN com hash/salt na coluna G.
 */
function configurarAdministradorGeralInicial() {
  // Edite somente estes dois valores antes de executar a função no Apps Script.
  const nome = "SUBSTITUA_PELO_NOME_DO_ADMIN_GERAL";
  const pin = "SUBSTITUA_POR_UM_PIN_DE_4_A_6_DIGITOS";
  if (nome.indexOf("SUBSTITUA_") === 0 || pin.indexOf("SUBSTITUA_") === 0) {
    throw new Error("Edite o nome e o PIN no início da função antes de executar.");
  }
  return gravarAdministradorGeralInicial_(nome, pin);
}

function gravarAdministradorGeralInicial_(nome, pin) {
  const nomeLimpo = String(nome || "").trim();
  if (!nomeLimpo) throw new Error("Informe o nome do Administrador Geral.");
  if (!pinValido_(pin)) throw new Error("O PIN deve conter de 4 a 6 números.");
  const planilha = SpreadsheetApp.openById(SPREADSHEET_ID);
  const aba = planilha.getSheetByName("Funcionarios");
  if (!aba) throw new Error('A aba "Funcionarios" não foi encontrada.');
  let linha = 0;
  if (aba.getLastRow() >= 2) {
    const nomes = aba.getRange(2, 1, aba.getLastRow() - 1, 1).getDisplayValues();
    for (let i = 0; i < nomes.length; i++) {
      if (normalizarTexto_(nomes[i][0]) === normalizarTexto_(nomeLimpo)) { linha = i + 2; break; }
    }
  }
  if (!linha) linha = Math.max(2, aba.getLastRow() + 1);
  if (aba.getLastRow() >= 2) {
    const perfis = aba.getRange(2, 8, aba.getLastRow() - 1, 1).getDisplayValues();
    for (let i = 0; i < perfis.length; i++) {
      if (normalizarTexto_(perfis[i][0]) === "geral" && i + 2 !== linha) {
        throw new Error("Já existe um Administrador Geral cadastrado. Use o mesmo nome para atualizar o PIN.");
      }
    }
  }
  const salt = Utilities.getUuid();
  const hash = hashPin_(String(pin), salt);
  aba.getRange(linha, 1).setValue(nomeLimpo);
  aba.getRange(linha, 2).clearContent();
  aba.getRange(linha, 6).clearContent();
  aba.getRange(linha, 7).setNumberFormat("@").setValue(salt + ":" + hash);
  aba.getRange(linha, 8).clearDataValidations().setValue("GERAL");
  aba.getRange(linha, 9).clearContent();
  CacheService.getScriptCache().remove("cadastro_funcionarios_v2");
  return "Administrador Geral configurado. Faça login com o nome e PIN definidos.";
}
