
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

const SESSAO_SEGUNDOS_ = 21600;
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

function lerSessao_(token) {
  if (!tokenFormatoValido_(token)) return null;

  const valor = CacheService.getScriptCache()
    .get("sess_" + token);

  if (!valor) return null;

  try {
    return JSON.parse(valor);
  } catch (e) {
    return null;
  }
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
  const planilha = SpreadsheetApp.openById(SPREADSHEET_ID);
  const aba = planilha.getSheetByName("Funcionarios");

  if (!aba || aba.getLastRow() < 2) return null;

  const dados = aba.getRange(
    2, 1, aba.getLastRow() - 1, 9
  ).getValues();

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
      loja: normalizarLoja_(linha[8]),
      linha: i + 2
    };
  }

  return null;
}

/* ============================================================
   LOGIN
   ============================================================ */

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

    if (!funcionario.loja) {
      throw new Error(
        "Sua loja não está definida no cadastro. Solicite ao administrador."
      );
    }

    limparFalhas_(chave);

    const token = novoToken_();

    const sessao = {
      nome: funcionario.nome,
      loja: funcionario.loja,
      administrador: funcionario.administrador,
      especial: funcionario.especial,
      loginId: Utilities.getUuid(),
      criadaEm: Date.now()
    };

    CacheService.getScriptCache().put(
      "sess_" + token,
      JSON.stringify(sessao),
      SESSAO_SEGUNDOS_
    );

    return respostaJsonp_(callback, {
      sucesso: true,
      token: token,
      nome: funcionario.nome,
      loja: funcionario.loja,
      administrador: funcionario.administrador,
      especial: funcionario.especial,
      loginId: sessao.loginId,
      ate: Date.now() + SESSAO_SEGUNDOS_ * 1000
    });

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

  const sessao = lerSessao_(p.sessao);

  return respostaJsonp_(callback, sessao
    ? {
        sucesso: true,
        nome: sessao.nome,
        loja: sessao.loja,
        administrador: sessao.administrador,
        especial: sessao.especial,
        loginId: sessao.loginId
      }
    : {
        sucesso: false,
        mensagem: "Sessão expirada."
      }
  );
}

/* ============================================================
   LOGOUT
   ============================================================ */

function logout_(p) {
  const callback = "__logoutCb";

  if (String(p.callback || "") !== callback) {
    return respostaTexto_("Callback inválido.");
  }

  if (tokenFormatoValido_(p.sessao)) {
    CacheService.getScriptCache().remove(
      "sess_" + p.sessao
    );
  }

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
