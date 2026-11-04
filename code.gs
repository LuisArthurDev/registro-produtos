
const SPREADSHEET_ID = "1X3JOGGeO_aBFoSpP5mFvjBYQiFzfrU0jLDAioH4gtfg";

const TEMPO_CACHE_SEGUNDOS = 21600;

const CABECALHOS_TRANSFERENCIAS = [
  "Código de Barras",
  "Lote",
  "Validade",
  "Quantidade",
  "Mês de Lançamento",
  "Loja de Origem",
  "Romaneio",
  "Chave Única"
];

/* =========================================
   COLETA DE FUNCIONARIOS
   ======================================== */

let CADASTRO_MEMO_ = null;

function obterCadastroFuncionarios_() {
  if (CADASTRO_MEMO_) return CADASTRO_MEMO_;           // dentro da mesma execução

  const cache = CacheService.getScriptCache();
  const salvo = cache.get("cadastro_funcionarios");    // entre execuções
  if (salvo) {
    CADASTRO_MEMO_ = JSON.parse(salvo);
    return CADASTRO_MEMO_;
  }

  const resultado = lerCadastroFuncionarios_();
  cache.put("cadastro_funcionarios", JSON.stringify(resultado), 300);
  CADASTRO_MEMO_ = resultado;
  return resultado;
}


function lerCadastroFuncionarios_() {
  const planilha = SpreadsheetApp.openById(SPREADSHEET_ID);
  const aba = planilha.getSheetByName("Funcionarios");

  if (!aba) {
    throw new Error('A aba "Funcionarios" não foi encontrada.');
  }

  const ultimaLinha = aba.getLastRow();
  const funcionarios = [];
  const especiais = [];

  if (ultimaLinha >= 2) {
    // A = Nome | B = Especial | H = Administrador
    const dados = aba.getRange(2, 1, ultimaLinha - 1, 9).getValues();

    dados.forEach(linha => {
      const nome = String(linha[0] || "").trim();
      const especial = linha[1] === true;
      const administrador = ehAdministradorValor_(linha[7]);
      const inativo = String(linha[9] || "").toLowerCase() === "inativo" || linha[9] === false;

      if (
        !nome ||
        normalizarTexto_(nome) === "transferencias" ||
        administrador ||
        inativo
      ) {
        return;
      }

      if (especial) {
        especiais.push(nome);
      } else {
        funcionarios.push(nome);
      }
    });
  }

  const nomesAbas = [...new Set([
    ...funcionarios,
    ...especiais,
    "Transferencias"
  ])];

  return {
    funcionarios: [...new Set(funcionarios)],
    especiais: [...new Set(especiais)],
    todos: nomesAbas
  };
}

function obterNomesAbasCadastro_() {
  return obterCadastroFuncionarios_().todos;
}

function obterAbasEspeciais_() {
  return obterCadastroFuncionarios_().especiais;
}


/* =========================================
   CONFIGURAÇÃO EXCLUSIVA DA ABA TRANSFERENCIAS
   ========================================= */

/**
 * Execute manualmente uma vez para configurar a aba Transferencias.
 *
 * Não altera cabeçalhos nem migra dados das demais abas.
 * Se Transferencias já existir no formato antigo de 6 colunas,
 * migra os dados existentes para o novo formato.
 */
function configurarPlanilha() {
  const planilha = SpreadsheetApp.openById(SPREADSHEET_ID);
  let aba = planilha.getSheetByName("Transferencias");

  if (!aba) {
    aba = planilha.insertSheet("Transferencias");
  }

  const ultimaLinha = aba.getLastRow();
  const ultimaColuna = aba.getLastColumn();

  let formatoNovo = false;

  if (ultimaLinha >= 1 && ultimaColuna >= 8) {
    const cabecalhos = aba.getRange(1, 1, 1, 8)
      .getDisplayValues()[0];

    formatoNovo =
      normalizarTexto_(cabecalhos[5]) === "loja de origem" ||
      normalizarTexto_(cabecalhos[7]) === "chave unica";
  }

  if (!formatoNovo && ultimaLinha >= 2) {
    /*
     * Migração da aba Transferencias antiga:
     * A = Código
     * B = Lote
     * C = Validade
     * D = Quantidade
     * E = Data do lançamento
     * F = Chave Única
     *
     * Novo formato:
     * A = Código de Barras
     * B = Lote
     * C = Validade
     * D = Quantidade
     * E = Mês de Lançamento
     * F = Loja de Origem
     * G = Romaneio
     * H = Chave Única
     */
    const dadosAntigos = aba
      .getRange(2, 1, ultimaLinha - 1, Math.min(Math.max(ultimaColuna, 6), 8))
      .getValues();

    const dadosMigrados = dadosAntigos.map(linha => {
      const codigo = linha[0] ?? "";
      const lote = linha[1] ?? "";
      const validade = linha[2] ?? "";
      const quantidade = linha[3] ?? "";
      const dataAntiga = linha[4] ?? "";
      const chaveUnica = linha[5] ?? "";

      let mesLancamento = "";

      if (dataAntiga instanceof Date && !isNaN(dataAntiga.getTime())) {
        mesLancamento = new Date(
          dataAntiga.getFullYear(),
          dataAntiga.getMonth(),
          1
        );
      } else if (dataAntiga !== "") {
        const tentativa = new Date(dataAntiga);

        if (!isNaN(tentativa.getTime())) {
          mesLancamento = new Date(
            tentativa.getFullYear(),
            tentativa.getMonth(),
            1
          );
        } else {
          mesLancamento = dataAntiga;
        }
      }

      return [
        codigo,
        lote,
        validade,
        quantidade,
        mesLancamento,
        "",
        "",
        chaveUnica
      ];
    });

    // A migração ocorre exclusivamente nesta aba.
    aba.getRange(2, 1, dadosMigrados.length, 8)
      .clearContent();

    aba.getRange(2, 1, dadosMigrados.length, 8)
      .setValues(dadosMigrados);
  }

  // Cabeçalhos somente na aba Transferencias.
  aba.getRange(1, 1, 1, 8)
    .setValues([CABECALHOS_TRANSFERENCIAS]);

  aba.getRange("C:C").setNumberFormat("dd/MM/yyyy");
  aba.getRange("E:E").setNumberFormat("mmmm yyyy");
  aba.setFrozenRows(1);

  SpreadsheetApp.flush();

  return "Aba Transferencias configurada com sucesso.";
}

/* =========================
   RECEBIMENTO DO LANÇAMENTO
   ========================= */

function doPost(e) {
  let requestId = "";
  let token = "";

  try {
    if (!e || !e.parameter) {
      throw new Error("Nenhum dado foi recebido.");
    }

    
    // Upload do estoque ODS: ação independente dos lançamentos.
    let dadosUpload = null;

    try {
      const corpo = e.postData && e.postData.contents
        ? JSON.parse(e.postData.contents)
        : null;

      if (corpo && corpo.acao === "salvarOdsNoGitHub") {
        const sessaoUpload = exigirAdministrador_({ sessao: corpo.sessao });
        // A loja vem da sessão validada no servidor, nunca do navegador.
        dadosUpload = Object.assign({}, corpo, {
          loja: normalizarLoja_(sessaoUpload.loja)
        });
      }
    } catch (_) {
      // Continua o fluxo antigo para os lançamentos existentes.
    }

    if (dadosUpload) {
      const resultadoUpload = salvarEstoqueOdsNoGitHub_(dadosUpload);

      return ContentService
        .createTextOutput(JSON.stringify(resultadoUpload))
        .setMimeType(ContentService.MimeType.JSON);
    }


    token = String(e.parameter.token || "");

    let payload;

    try {
      payload = JSON.parse(String(e.parameter.payload || ""));
    } catch (_) {
      throw new Error("Os dados enviados não são válidos.");
    }

    requestId = String(payload.requestId || "");

    if (!idValido_(requestId)) {
      throw new Error("Identificador do lançamento inválido.");
    }

    if (!tokenValido_(token)) {
      throw new Error("Token de solicitação inválido.");
    }

    // O token da sessão pertence ao payload; o campo token separado é
    // exclusivamente o identificador temporário usado no polling.
    exigirSessaoLancamento_(payload);

    gravarStatus_(requestId, token, {
      status: "pending",
      message: "Processando lançamento."
    });

    const resultado = salvarProduto_(payload);
    try {
      const sessaoLancamento = obterSessaoObrigatoria_(payload);
      if (sessaoLancamento && sessaoLancamento.administrador === true && resultado && resultado.sucesso !== false) {
        gravarEventoAdministrativo_(sessaoLancamento, "Lançamento administrativo", "Lançamento realizado na aba " + String(payload.funcionario || payload.nomeAba || "—"), String(payload.codigo || payload.ean || ""));
      }
    } catch (erroAuditoria) { console.error("Falha ao registrar lançamento administrativo: " + erroAuditoria); }
    invalidarCacheDados_();

    gravarStatus_(requestId, token, resultado);

    return respostaHtml_("Solicitação processada.");

  } catch (erro) {
    console.error("ERRO NO LANÇAMENTO: " + (erro.stack || erro));

    const mensagem = mensagemErro_(erro);

    if (idValido_(requestId) && tokenValido_(token)) {
      gravarStatus_(requestId, token, {
        status: "error",
        message: mensagem
      });
    }

    return respostaHtml_("Solicitação recebida.");
  }
}

/* =========================
   CONSULTAS GET
   ========================= */

function doGetOriginal_(e) {
  const parametros = e && e.parameter ? e.parameter : {};
  const acao = String(parametros.action || "");

  if (acao === "login") return login_(parametros);
  if (acao === "sessao") return consultarSessao_(parametros);
  if (acao === "atividade") return registrarAtividadeSessao_(parametros);
  if (acao === "logout") return logout_(parametros);
  if (acao === "loginAdmin") return loginAdmin_(parametros);
  if (acao === "definirPinFuncionario") return definirPinFuncionario_(parametros);
  if (acao === "listarAdminsLojas") return listarAdminsLojas_(parametros);
  if (acao === "criarAdminLoja") return criarAdminLoja_(parametros);
  if (acao === "definirPermissaoFuncionario") {
    return definirPermissaoFuncionario_(parametros);
  }

  if (acao === "status") {
    return consultarStatus_(parametros);
  }

  if (acao === "adicionarProdutoJson") {
    return adicionarProdutoJson_(parametros);
  }

  if (acao === "historicoMes") {
    return consultarHistoricoMes_(parametros);
  }

  if (acao === "validades") {
    return consultarValidades_(parametros);
  }
  if (acao === "verificarItemMapa") return verificarItemMapa_(parametros);
  if (acao === "verificarChaveLancamento") return verificarChaveLancamento_(parametros);

  if (acao === "adicionarValidadeManual") {
    return adicionarValidadeManual_(parametros);
  }

  if (acao === "sinalizarLancamento") return registrarSinalizacao_(parametros);
  if (acao === "consultarSinalizados") return consultarSinalizados_(parametros);
  if (acao === "atualizarSinalizado") return atualizarSinalizado_(parametros);

  if (acao === "editarLancamento") {
    return editarLancamento_(parametros);
  }

  if (acao === "excluirLancamento") {
    return excluirLancamento_(parametros);
  }

  if (acao === "cadastrarQueimaManual") {
    return cadastrarQueimaManual_(parametros);
  }

  if (acao === "dashboardPainel") return consultarDashboardPainel_(parametros);
  if (acao === "listarEstoqueVencidos") return listarEstoqueVencidos_(parametros);
  if (acao === "encaminharEstoqueMapa") return encaminharEstoqueMapa_(parametros);
  if (acao === "vencidosPainel") return consultarVencidosPainel_(parametros);
  if (acao === "retirarDeLoja") return retirarDeLoja_(parametros);
  if (acao === "adicionarDanificado") return adicionarDanificado_(parametros);
  if (acao === "adicionarAoQueima") return adicionarAoQueima_(parametros);
  if (acao === "consultarQueima") return consultarQueima_(parametros);
  if (acao === "aprovarQueima") return aprovarQueima_(parametros);
  if (acao === "relancarQueima") return relancarQueima_(parametros);

  if (acao === "subirVencidos" || acao === "subirParaVencidos") {
    return subirParaVencidos_(parametros);
  }

  if (acao === "adicionarFuncionario") return adicionarFuncionario_(parametros);
      if (acao === "renomearFuncionario") return renomearFuncionario_(parametros);
      if (acao === "definirEspecialFuncionario") return definirEspecialFuncionario_(parametros);
      if (acao === "marcarCheckFuncionario") return marcarCheckFuncionario_(parametros);
  if (acao === "inativarFuncionario") return inativarFuncionario_(parametros);

  if (acao === "funcionarios") {
    const callback = String(parametros.callback || "");
    if (callback !== "__funcionariosCb") return respostaTexto_("Callback inválido.");
    try {
      const sessao = obterSessaoObrigatoria_(parametros);
      // Transferencias é uma opção especial exclusiva do Administrador de Loja.
      // Ela é removida da lista-base e adicionada explicitamente abaixo para
      // nunca aparecer para funcionários nem para o Administrador Geral.
      const nomesPermitidos = obterAbasPermitidas_(parametros).filter(n => n !== "Transferencias");
      const cadastro = obterCadastroFuncionarios_();
      const porNome = {};
      cadastro.funcionarios.concat(cadastro.especiais).forEach(nome => {
        porNome[normalizarTexto_(nome)] = nome;
      });
      let funcionarios = nomesPermitidos.filter(nome => porNome[normalizarTexto_(nome)] && !cadastro.especiais.includes(nome));
      let especiais = nomesPermitidos.filter(nome => cadastro.especiais.includes(nome));

      // A página de lançamentos recebe somente as abas especiais para o
      // Administrador de Loja. O Painel Conferente solicita modo=gestao e
      // precisa enxergar também as abas normais para administrar a loja.
      const modoGestao = String(parametros.modo || "") === "gestao";
      if (sessao.administrador === true && !modoGestao) funcionarios = [];
      const podeLancarTransferencias = sessao.administrador === true && sessao.administradorGeral !== true;
      const todos = sessao.administrador
        ? (modoGestao
            ? nomesPermitidos
            : [...especiais, ...(podeLancarTransferencias ? ["Transferencias"] : [])])
        : nomesPermitidos;
      const detalhes = obterDetalhesFuncionarios_(parametros);
      return respostaJsonp_(callback, {
        sucesso: true, funcionarios, especiais, todos: [...new Set(todos)], detalhes,
        usuario: sessao.nome, loja: sessao.loja, administrador: sessao.administrador, loginId: sessao.loginId
      });
    } catch (erro) {
      return respostaJsonp_(callback, { sucesso: false, precisaLogin: true, mensagem: mensagemErro_(erro), funcionarios: [], especiais: [], todos: [] });
    }
  }

  return ContentService
    .createTextOutput("Sistema de lançamento de produtos.")
    .setMimeType(ContentService.MimeType.TEXT);
}

function consultarStatus_(parametros) {
  if (String(parametros.callback || "") !== "__statusCb") {
    return respostaTexto_("Callback inválido.");
  }

  const requestId = String(parametros.requestId || "");
  const token = String(parametros.token || "");

  let resultado = {
    requestId: requestId,
    status: "pending",
    message: "Aguardando processamento."
  };

  if (idValido_(requestId) && tokenValido_(token)) {
    const registro = lerStatus_(requestId);

    if (registro && registro.token === token) {
      resultado = {
        requestId: requestId,
        status: registro.status,
        message: registro.message
      };
    }
  }

  return respostaJsonp_("__statusCb", resultado);
}

/* =========================
   AUTORIZAÇÃO DO LANÇAMENTO POST
   ========================= */
function exigirSessaoLancamento_(dados) {
  const sessao = obterSessaoObrigatoria_({ sessao: dados && dados.sessao });
  if (sessao.administradorGeral === true) {
    throw new Error("O Administrador Geral não realiza lançamentos.");
  }

  const nomeInformado = String(dados.funcionario || "").trim();

  // A aba Transferencias pode ser lançada diretamente pelo Administrador de
  // Loja. A autorização é validada no servidor; o Administrador Geral e os
  // funcionários continuam sem acesso a esse destino.
  if (nomeInformado === "Transferencias") {
    if (sessao.administrador !== true || sessao.administradorGeral === true) {
      throw new Error("Somente o Administrador de Loja pode lançar Transferências.");
    }
    if (!normalizarLoja_(sessao.loja)) throw new Error("Administrador sem loja cadastrada.");
    dados.funcionario = "Transferencias";
    return sessao;
  }

  // Cadastro de vencidos no Estoque é exclusivo do Administrador de Loja.
  // Administrador Geral permanece bloqueado acima.
  if (nomeInformado === "Estoque") {
    if (sessao.administrador !== true || sessao.administradorGeral === true) {
      throw new Error("Somente o Administrador de Loja pode cadastrar vencidos no Estoque.");
    }
    if (!normalizarLoja_(sessao.loja)) throw new Error("Administrador sem loja cadastrada.");
    dados.funcionario = "Estoque";
    dados.lojaOrigem = normalizarLoja_(sessao.loja);
    return sessao;
  }

  if (sessao.administrador === true) {
    if (!nomeInformado) {
      throw new Error("Selecione uma aba especial para realizar o lançamento.");
    }

    const destino = buscarFuncionarioPorNome_(nomeInformado);
    if (!destino || destino.administrador || destino.administradorGeral) {
      throw new Error("Aba de destino inválida.");
    }
    if (destino.loja !== normalizarLoja_(sessao.loja)) {
      throw new Error("Você só pode lançar em abas da sua própria loja.");
    }
    if (destino.especial !== true) {
      throw new Error("Administrador de Loja só pode lançar em abas especiais. Use o Painel Conferente para as demais operações.");
    }

    dados.funcionario = destino.nome;
    return sessao;
  }

  if (normalizarTexto_(nomeInformado) !== normalizarTexto_(sessao.nome)) {
    throw new Error("Você só pode lançar produtos no seu próprio mapa.");
  }
  dados.funcionario = sessao.nome;
  return sessao;
}

/* =========================
   SALVAMENTO DO LANÇAMENTO
   ========================= */

function salvarProduto_(dados) {
  if (!dados || typeof dados !== "object") {
    throw new Error("Dados do produto inválidos.");
  }

  const requestId = String(dados.requestId || "");
  const funcionario = String(dados.funcionario || "").trim();
  const codigo = String(dados.codigo || "").trim();
  const lote = String(dados.lote || "")
  .trim()
  .toLocaleUpperCase("pt-BR");
  const validadeTexto = String(dados.validade || "").trim();
  const quantidadeTexto = String(dados.quantidade ?? "").trim();

  const ehTransferencia = funcionario === "Transferencias";
  const ehEstoque = funcionario === "Estoque";

  if (!idValido_(requestId)) {
    throw new Error("Identificador do lançamento inválido.");
  }

  if (!ehEstoque && !obterCadastroFuncionarios_().todos.includes(funcionario)) {
    throw new Error("Funcionário não reconhecido.");
  }

  if (!/^\d{8,14}$/.test(codigo)) {
    throw new Error(
      "O código de barras deve conter de 8 a 14 dígitos."
    );
  }

  if (!lote || lote.length > 100) {
    throw new Error(
      "O lote é obrigatório e deve ter no máximo 100 caracteres."
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(validadeTexto)) {
    throw new Error("A validade informada não é válida.");
  }

  const partesData = validadeTexto.split("-").map(Number);

  const dataValidade = new Date(
    partesData[0],
    partesData[1] - 1,
    partesData[2]
  );

  if (
    dataValidade.getFullYear() !== partesData[0] ||
    dataValidade.getMonth() !== partesData[1] - 1 ||
    dataValidade.getDate() !== partesData[2]
  ) {
    throw new Error("A data de validade não existe.");
  }
  if (ehEstoque) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    if (dataValidade >= hoje) {
      throw new Error("A aba Estoque aceita somente produtos já vencidos.");
    }
  }

  if (!/^\d+$/.test(quantidadeTexto)) {
    throw new Error("A quantidade deve ser um número inteiro.");
  }

  const quantidade = Number(quantidadeTexto);

  if (!Number.isSafeInteger(quantidade) || quantidade < 1) {
    throw new Error("A quantidade deve ser maior que zero.");
  }

  let lojaOrigem = "";
  let romaneio = "";

  if (ehTransferencia) {
    romaneio = String(dados.romaneio || "").trim();
    const numeroLojaOrigem = String(dados.lojaOrigem || "").trim();

    if (!romaneio || romaneio.length > 100) {
      throw new Error(
        "O romaneio é obrigatório e deve ter no máximo 100 caracteres."
      );
    }

    // Aceita o número sem prefixo ou com prefixo V.
    const numeroNormalizado = numeroLojaOrigem.replace(/^V/i, "");

    if (!/^\d{1,10}$/.test(numeroNormalizado)) {
      throw new Error(
        "Informe somente o número da loja de origem."
      );
    }

    lojaOrigem = "V" + numeroNormalizado;
  }

  const planilha = SpreadsheetApp.openById(SPREADSHEET_ID);
  const nomeAba = funcionario;
  let aba = planilha.getSheetByName(nomeAba);

  if (!aba && ehTransferencia) {
    aba = planilha.insertSheet("Transferencias");
  }

  if (!aba && !ehEstoque) {
    throw new Error("A aba '" + nomeAba + "' não foi encontrada.");
  }

  const bloqueio = LockService.getScriptLock();

  if (!bloqueio.tryLock(20000)) {
    throw new Error(
      "O sistema está ocupado. Aguarde e tente novamente."
    );
  }

  try {
    // Idempotência: verifica somente a aba de destino desta tentativa.
    // Evita varrer todas as abas a cada lançamento e impede somar/gravar duas vezes.
    const abaDestino = ehEstoque ? planilha.getSheetByName("Estoque") : aba;
    const colunaChaveDestino = ehEstoque ? 9 : (ehTransferencia ? 8 : 6);
    if (abaDestino && localizarChaveNaAba_(abaDestino, colunaChaveDestino, requestId) > 0) {
      return {
        status: "saved",
        message: "Este lançamento já consta na planilha. Nenhuma quantidade foi adicionada novamente."
      };
    }

    const dataLancamento = new Date();

    // ESTOQUE: registro de produtos vencidos cadastrados pelo Administrador de Loja.
    if (ehEstoque) {
      const sessaoEstoque = exigirAdministrador_({ sessao: dados.sessao });
      let estoque = planilha.getSheetByName("Estoque");
      if (!estoque) estoque = planilha.insertSheet("Estoque");
      const cabecalhosEstoque = ["Código de Barras", "Código Interno", "Descrição", "Lote", "Validade", "Quantidade", "Data de Registro", "Loja Origem", "Chave Única", "Situação", "Funcionário / Mapa de Destino"];
      if (estoque.getLastRow() === 0) estoque.getRange(1, 1, 1, cabecalhosEstoque.length).setValues([cabecalhosEstoque]);
      else {
        const existentes = estoque.getRange(1, 1, 1, Math.max(estoque.getLastColumn(), cabecalhosEstoque.length)).getDisplayValues()[0];
        cabecalhosEstoque.forEach((h, i) => { if (!String(existentes[i] || "").trim()) estoque.getRange(1, i + 1).setValue(h); });
      }
      const ultima = estoque.getLastRow();
      if (ultima >= 2) {
        const chaves = estoque.getRange(2, 9, ultima - 1, 1).getDisplayValues().flat();
        if (chaves.includes(requestId)) return { status: "saved", message: "Este vencido já foi registrado no Estoque." };
      }
      const linhaEstoque = Math.max(estoque.getLastRow() + 1, 2);
      // EAN deve permanecer texto para preservar zeros à esquerda.
      estoque.getRange(linhaEstoque, 1).setNumberFormat("@");
      estoque.getRange(linhaEstoque, 1, 1, 11).setValues([[
        codigo, String(dados.codigoInterno || ""), String(dados.descricao || ""), lote,
        dataValidade, quantidade, new Date(), normalizarLoja_(sessaoEstoque.loja), requestId,
        "Disponível", ""
      ]]);
      estoque.getRange(linhaEstoque, 5).setNumberFormat("dd/MM/yyyy");
      estoque.getRange(linhaEstoque, 7).setNumberFormat("dd/MM/yyyy HH:mm");
      SpreadsheetApp.flush();
      return { status: "saved", message: "Produto vencido registrado no Estoque da Loja " + normalizarLoja_(sessaoEstoque.loja) + "." };
    }

    /*
     * TRANSFERENCIAS
     * A Código de Barras
     * B Lote
     * C Validade
     * D Quantidade
     * E Mês de Lançamento
     * F Loja de Origem
     * G Romaneio
     * H Chave Única
     */
    if (ehTransferencia) {
      configurarCabecalhosTransferenciasSeNecessario_(aba);

      const mesLancamento = new Date(
        dataLancamento.getFullYear(),
        dataLancamento.getMonth(),
        1
      );

      const novaLinha = Math.max(aba.getLastRow() + 1, 2);

      // Código de barras é texto, nunca número.
      aba.getRange(novaLinha, 1).setNumberFormat("@");
      aba.getRange(novaLinha, 1, 1, 8).setValues([[
        codigo,
        lote,
        dataValidade,
        quantidade,
        mesLancamento,
        lojaOrigem,
        romaneio,
        requestId
      ]]);

      aba.getRange(novaLinha, 3).setNumberFormat("dd/MM/yyyy");
      aba.getRange(novaLinha, 5).setNumberFormat("mmmm yyyy");

      SpreadsheetApp.flush();

      return {
        status: "saved",
        message: "Transferência registrada com sucesso."
      };
    }

    /*
     * ABAS ESPECIAIS
     * Mantém a soma por código, lote e validade.
     * Estrutura original de seis colunas.
     */
    if (obterAbasEspeciais_().includes(nomeAba)) {
      const ultimaLinha = aba.getLastRow();

      if (ultimaLinha >= 2) {
        const dadosExistentes = aba
          .getRange(2, 1, ultimaLinha - 1, 6)
          .getValues();

        const dadosExibidos = aba
          .getRange(2, 1, ultimaLinha - 1, 2)
          .getDisplayValues();

        const chaveData = data => {
          if (
            !(data instanceof Date) ||
            isNaN(data.getTime())
          ) {
            return "";
          }

          return [
            data.getFullYear(),
            String(data.getMonth() + 1).padStart(2, "0"),
            String(data.getDate()).padStart(2, "0")
          ].join("-");
        };

        const validadeNova = chaveData(dataValidade);

        for (let i = 0; i < dadosExistentes.length; i++) {
          const linha = dadosExistentes[i];

          const codigoExistente = String(
            dadosExibidos[i][0] || ""
          ).trim();

          const loteExistente = String(
            dadosExibidos[i][1] || ""
          ).trim();

          const validadeExistente = chaveData(linha[2]);

          const mesmoProduto =
            codigoExistente === codigo &&
            loteExistente.toLowerCase() === lote.toLowerCase() &&
            validadeExistente === validadeNova;

          if (!mesmoProduto) continue;

          const linhaPlanilha = i + 2;
          const quantidadeExistente = Number(linha[3]);

          if (
            !Number.isFinite(quantidadeExistente) ||
            quantidadeExistente < 0
          ) {
            throw new Error(
              "A quantidade existente na linha " +
              linhaPlanilha + " é inválida."
            );
          }

          const novaQuantidade = quantidadeExistente + quantidade;

          if (!Number.isSafeInteger(novaQuantidade)) {
            throw new Error(
              "A soma das quantidades ultrapassa o limite permitido."
            );
          }

          aba.getRange(linhaPlanilha, 4).setValue(novaQuantidade);

          const idsExistentes = String(linha[5] || "")
            .split("|")
            .filter(Boolean);

          if (!idsExistentes.includes(requestId)) {
            idsExistentes.push(requestId);
          }

          aba.getRange(linhaPlanilha, 6)
            .setValue(idsExistentes.join("|"));

          SpreadsheetApp.flush();

          return {
            status: "saved",
            message:
              "Quantidade somada ao registro existente na aba " +
              nomeAba +
              ". Nova quantidade: " +
              novaQuantidade + "."
          };
        }
      }
    }

    /*
     * ABAS NORMAIS E ESPECIAIS SEM CORRESPONDÊNCIA
     * Mantém as seis colunas originais.
     */
    const novaLinha = Math.max(aba.getLastRow() + 1, 2);

    // Preserva EANs iniciados em zero na planilha.
    aba.getRange(novaLinha, 1).setNumberFormat("@");
    aba.getRange(novaLinha, 1, 1, 6).setValues([[
      codigo,
      lote,
      dataValidade,
      quantidade,
      dataLancamento,
      requestId
    ]]);

    aba.getRange(novaLinha, 3).setNumberFormat("dd/MM/yyyy");
    aba.getRange(novaLinha, 5).setNumberFormat("dd/MM/yyyy HH:mm:ss");

    SpreadsheetApp.flush();

    return {
      status: "saved",
      message: "Lançamento salvo com sucesso na aba " + nomeAba + "."
    };

  } finally {
    bloqueio.releaseLock();
  }
}

/**
 * Garante cabeçalhos apenas em Transferencias.
 * Não migra nem modifica outras abas.
 */
function configurarCabecalhosTransferenciasSeNecessario_(aba) {
  const cabecalhos = aba.getRange(1, 1, 1, 8).getDisplayValues()[0];

  const configurada =
    normalizarTexto_(cabecalhos[5]) === "loja de origem" &&
    normalizarTexto_(cabecalhos[7]) === "chave unica";

  if (!configurada) {
    // Não realizar migração automática aqui, durante um lançamento.
    // A migração deve ser executada pela função configurarPlanilha().
    throw new Error(
      "A aba Transferencias ainda não está configurada. " +
      "Execute configurarPlanilha() no editor do Apps Script."
    );
  }
}

/* =========================
   STATUS DAS SOLICITAÇÕES
   ========================= */

function gravarStatus_(requestId, token, resultado) {
  const registro = {
    token: token,
    status: String(resultado.status || "pending"),
    message: String(resultado.message || "")
  };

  CacheService.getScriptCache().put(
    chaveStatus_(requestId),
    JSON.stringify(registro),
    TEMPO_CACHE_SEGUNDOS
  );
}

function lerStatus_(requestId) {
  const valor = CacheService
    .getScriptCache()
    .get(chaveStatus_(requestId));

  if (!valor) return null;

  try {
    return JSON.parse(valor);
  } catch (_) {
    return null;
  }
}

function chaveStatus_(requestId) {
  return "status_" + requestId;
}

/* =========================
   VALIDAÇÃO E RESPOSTAS
   ========================= */

function idValido_(valor) {
  return /^[A-Za-z0-9_-]{8,80}$/.test(String(valor || ""));
}

function tokenValido_(valor) {
  return /^[a-f0-9]{64}$/.test(String(valor || ""));
}

function normalizarTexto_(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function mensagemErro_(erro) {
  if (erro && erro.message) {
    return String(erro.message).slice(0, 300);
  }

  return "Não foi possível salvar o lançamento.";
}

function respostaJsonp_(callback, objeto) {
  const json = JSON.stringify(objeto).replace(/</g, "\\u003c");

  return ContentService
    .createTextOutput(callback + "(" + json + ");")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function respostaTexto_(mensagem) {
  return ContentService
    .createTextOutput(mensagem)
    .setMimeType(ContentService.MimeType.TEXT);
}

function respostaHtml_(mensagem) {
  return HtmlService.createHtmlOutput(
    "<!DOCTYPE html><html><head><meta charset=\"UTF-8\">" +
    "</head><body>" + mensagem + "</body></html>"
  );
}

/* =========================================
   HISTÓRICO POR MÊS
   ========================================= */

function consultarHistoricoMes_(parametros) {
  if (String(parametros.callback || "") !== "__historicoCb") {
    return respostaTexto_("Callback inválido.");
  }

  const mes = String(parametros.mes || "");
  const todosMeses = mes === "TODOS";
  const numeroMes = Number(mes.slice(5, 7));

  if (
    !todosMeses &&
    (!/^\d{4}-\d{2}$/.test(mes) || numeroMes < 1 || numeroMes > 12)
  ) {
    return respostaJsonp_("__historicoCb", {
      sucesso: false,
      mensagem: "Mês inválido.",
      registros: []
    });
  }

  try {
    const planilha = SpreadsheetApp.openById(SPREADSHEET_ID);
    const fuso = planilha.getSpreadsheetTimeZone();
    const sessao = obterSessaoObrigatoria_(parametros);
    const nomesAbas = obterAbasPermitidas_(parametros);
    const registros = [];

    nomesAbas.forEach(nome => {
      const aba = planilha.getSheetByName(nome);
      if (!aba || aba.getLastRow() < 2) return;

      const especial = obterAbasEspeciais_().includes(nome);
      const transferencia = nome === "Transferencias";
      const ultimaLinha = aba.getLastRow();

      if (transferencia) {
        const valores = aba
          .getRange(2, 1, ultimaLinha - 1, 8)
          .getValues();

        const exibidos = aba
          .getRange(2, 1, ultimaLinha - 1, 8)
          .getDisplayValues();

        valores.forEach((linha, i) => {
          const codigo = String(exibidos[i][0] || "").trim();
          if (!codigo) return;

          // Transferência só aparece para a loja que consta na coluna F.
          const lojaOrigem = normalizarLoja_(exibidos[i][5]);

          if (lojaOrigem !== sessao.loja) return;

          const mesData = linha[4];
          let mesRegistro = "";

          if (mesData instanceof Date && !isNaN(mesData.getTime())) {
            mesRegistro = Utilities.formatDate(mesData, fuso, "yyyy-MM");
          } else {
            const tentativa = new Date(mesData);
            if (!isNaN(tentativa.getTime())) {
              mesRegistro = Utilities.formatDate(tentativa, fuso, "yyyy-MM");
            }
          }

          if (!todosMeses && mesRegistro !== mes) return;

          const validade = linha[2];

          registros.push({
            funcionario: nome,
            codigo: codigo,
            lote: String(exibidos[i][1] || "").trim(),
            validade: validade instanceof Date
              ? Utilities.formatDate(validade, fuso, "dd/MM/yyyy")
              : String(validade || ""),
            quantidade: Number(linha[3]) || 0,
            dataLancamento: mesData instanceof Date
              ? Utilities.formatDate(mesData, fuso, "MM/yyyy")
              : String(mesData || ""),
            ts: mesData instanceof Date ? mesData.getTime() : 0,
            especial: false,
            lojaOrigem: String(exibidos[i][5] || "").trim(),
            romaneio: String(exibidos[i][6] || "").trim(),
            chaveUnica: String(exibidos[i][7] || "").trim(),
            mesLancamento: mesRegistro
          });
        });

        return;
      }

      // Abas normais e especiais mantêm a estrutura A:F.
      const valores = aba
        .getRange(2, 1, ultimaLinha - 1, 6)
        .getValues();

      const exibidos = aba
        .getRange(2, 1, ultimaLinha - 1, 2)
        .getDisplayValues();

      valores.forEach((linha, i) => {
        const codigo = String(exibidos[i][0] || "").trim();
        if (!codigo) return;

        const data = linha[4];
        const dataValida = data instanceof Date && !isNaN(data.getTime());

        if (!especial && !todosMeses) {
          if (!dataValida) return;
          if (Utilities.formatDate(data, fuso, "yyyy-MM") !== mes) return;
        }

        registros.push({
          funcionario: nome,
          codigo: codigo,
          lote: String(exibidos[i][1] || "").trim(),
          validade: linha[2] instanceof Date
            ? Utilities.formatDate(linha[2], fuso, "dd/MM/yyyy")
            : String(linha[2] || ""),
          quantidade: Number(linha[3]) || 0,
          dataLancamento: dataValida
            ? Utilities.formatDate(data, fuso, "dd/MM/yyyy HH:mm:ss")
            : "",
          ts: dataValida ? data.getTime() : 0,
          especial: especial,
          chaveUnica: String(linha[5] || "").trim()
        });
      });
    });

    const eventosAdministrativos = consultarEventosAdministrativos_(sessao, mes, todosMeses);
    return respostaJsonp_("__historicoCb", {
      sucesso: true,
      mes: mes,
      registros: registros,
      eventosAdministrativos: eventosAdministrativos
    });

  } catch (erro) {
    console.error("Erro ao consultar histórico: " + (erro.stack || erro));

    return respostaJsonp_("__historicoCb", {
      sucesso: false,
      mensagem: "Não foi possível consultar o histórico.",
      registros: []
    });
  }
}

/* =========================================
   SINALIZAÇÃO DE LANÇAMENTOS
   ========================================= */
function registrarSinalizacao_(parametros) {
  const callback = String(parametros.callback || "");

  if (callback !== "__sinalizacaoCb") {
    return respostaTexto_("Callback inválido.");
  }

  try {
    const sessao = obterSessaoObrigatoria_(parametros);

    const chaveUnica = String(parametros.chaveUnica || "").trim();
    const motivo = String(parametros.motivo || "").trim();

    if (!chaveUnica || chaveUnica.length > 1000) {
      throw new Error("A chave única do lançamento está ausente ou inválida.");
    }

    if (!motivo || motivo.length > 550) {
      throw new Error("Informe um motivo válido.");
    }

    const permitido =
      motivo === "Não Entrou no Queima" ||
      motivo === "Muita Quantidade" ||
      /^Outras:\s*.+$/s.test(motivo);

    if (!permitido) {
      throw new Error("O motivo selecionado não é válido.");
    }

    const registro = localizarLancamento_(chaveUnica);

    if (!registro) {
      throw new Error("Lançamento não encontrado.");
    }

    // Confirma que o usuário pode acessar o lançamento.
    exigirAcessoRegistro_(parametros, registro);

    const transferencia = registro.nomeAba === "Transferencias";

    let lojaOrigem = sessao.loja;

    if (transferencia) {
      const origem = registro.aba
        .getRange(registro.linha, 6)
        .getDisplayValue();

      lojaOrigem = normalizarLoja_(origem);

      if (!lojaOrigem || lojaOrigem !== sessao.loja) {
        throw new Error("Você não tem acesso a essa transferência.");
      }
    }

    const planilha = SpreadsheetApp.openById(SPREADSHEET_ID);

    let aba = planilha.getSheetByName("Sinalizacao");

    if (!aba) {
      aba = planilha.insertSheet("Sinalizacao");
    }

    const cabecalhos = [
      "Chave Unica",
      "Funcionario",
      "Motivo",
      "Ação Tomada",
      "Data de Registro",
      "LojaOrigem"
    ];

    if (aba.getLastRow() === 0) {
      aba.getRange(1, 1, 1, 6).setValues([cabecalhos]);
      aba.getRange(1, 1, 1, 6).setFontWeight("bold");
      aba.setFrozenRows(1);
    } else {
      // Mantém a estrutura existente e garante a coluna F.
      aba.getRange(1, 6).setValue("LojaOrigem");

      const headers = aba
        .getRange(1, 1, 1, aba.getLastColumn())
        .getDisplayValues()[0]
        .map(normalizarTexto_);

      if (!headers.includes("acao tomada")) {
        const dataAntiga = headers.indexOf("data de registro");

        if (dataAntiga === 3 && aba.getLastRow() >= 2) {
          const datas = aba.getRange(
            2, 4, aba.getLastRow() - 1, 1
          ).getValues();

          aba.getRange(2, 5, datas.length, 1).setValues(datas);
        }

        aba.getRange(1, 4).setValue("Ação Tomada");

        if (aba.getLastRow() >= 2) {
          aba.getRange(
            2, 4, aba.getLastRow() - 1, 1
          ).setValue("Em Aberto");
        }
      }

      if (!headers.includes("data de registro")) {
        aba.getRange(1, 5).setValue("Data de Registro");
      }
    }

    const lock = LockService.getScriptLock();

    if (!lock.tryLock(15000)) {
      throw new Error("Sistema ocupado. Tente novamente.");
    }

    try {
      const linha = Math.max(aba.getLastRow() + 1, 2);

      aba.getRange(linha, 1, 1, 6).setValues([[
        chaveUnica,
        registro.nomeAba,
        motivo,
        "Em Aberto",
        new Date(),
        lojaOrigem
      ]]);

      aba.getRange(linha, 5)
        .setNumberFormat("dd/MM/yyyy HH:mm:ss");

      SpreadsheetApp.flush();

    } finally {
      lock.releaseLock();
    }

    return respostaJsonp_("__sinalizacaoCb", {
      sucesso: true,
      mensagem: "Sinalização registrada como Em Aberto."
    });

  } catch (erro) {
    console.error(
      "Erro ao registrar sinalização: " + (erro.stack || erro)
    );

    return respostaJsonp_("__sinalizacaoCb", {
      sucesso: false,
      mensagem: mensagemErro_(erro)
    });
  }
}

function indexarProdutosPorChave_(ss) {
  const indice = {};

  ss.getSheets().forEach(function (sh) {
    if (sh.getName() === "Sinalizacao") return;

    const lr = sh.getLastRow(), lc = sh.getLastColumn();
    if (lr < 2 || lc < 2) return;

    const heads = sh.getRange(1, 1, 1, lc).getDisplayValues()[0].map(normalizarTexto_);
    let ki = heads.indexOf("chave unica");
    if (ki < 0) ki = heads.indexOf("chave unica do lancamento");
    if (ki < 0) return;

    const col = function (nomes, fallback) {
      for (const n of nomes) { const j = heads.indexOf(n); if (j >= 0) return j; }
      return fallback;
    };
    const iCod = col(["codigo", "ean", "codigo de barras"], 0);
    const iDes = col(["descricao", "produto"], -1);
    const iLot = col(["lote"], 1);
    const iVal = col(["validade", "data de validade"], 2);
    const iQtd = col(["quantidade", "qtd"], 3);

    sh.getRange(2, 1, lr - 1, lc).getDisplayValues().forEach(function (r) {
      const produto = {
        codigo: r[iCod] || "",
        descricao: iDes >= 0 ? r[iDes] || "" : "",
        lote: r[iLot] || "",
        validade: r[iVal] || "",
        quantidade: r[iQtd] || ""
      };
      String(r[ki] || "").split("|").forEach(function (k) {
        k = k.trim();
        if (k && !indice[k]) indice[k] = produto;   // mantém o primeiro encontrado
      });
    });
  });

  return indice;
}

function consultarSinalizados_(parametros) {
  if (String(parametros.callback || "") !== "__sinalizadosCb") {
    return respostaTexto_("Callback inválido.");
  }

  try {
    const sessao = obterSessaoObrigatoria_(parametros);

    if (!sessao.administrador) {
      throw new Error("Acesso permitido somente para administradores.");
    }

    garantirLojaOrigemSinalizacao_();

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = ss.getSheetByName("Sinalizacao");

    if (!sh || sh.getLastRow() < 2) {
      return respostaJsonp_("__sinalizadosCb", {
        sucesso: true,
        registros: []
      });
    }

    const vals = sh.getDataRange().getValues();
    const disp = sh.getDataRange().getDisplayValues();

    const headers = disp[0].map(normalizarTexto_);

    const idx = {
      chave: headers.indexOf("chave unica"),
      func: headers.indexOf("funcionario"),
      motivo: headers.indexOf("motivo"),
      acao: headers.indexOf("acao tomada"),
      data: headers.indexOf("data de registro"),
      loja: headers.indexOf("lojaorigem")
    };

    if (idx.loja < 0) {
      throw new Error("Coluna LojaOrigem não encontrada na Sinalizacao.");
    }

    const registros = [];
    const indice = indexarProdutosPorChave_(ss);

    for (let i = 1; i < vals.length; i++) {
      const lojaRegistro = normalizarLoja_(disp[i][idx.loja]);

      // Nunca mistura sinalizações de lojas diferentes.
      if (!lojaRegistro || lojaRegistro !== sessao.loja) {
        continue;
      }

      const chave = String(disp[i][idx.chave] || "").trim();

      if (!chave) continue;

      const produto = indice[chave] || {};

      registros.push({
        chaveUnica: chave,
        funcionario: disp[i][idx.func] || "",
        motivo: disp[i][idx.motivo] || "",
        acaoTomada: disp[i][idx.acao] || "Em Aberto",
        dataRegistro: disp[i][idx.data] || "",
        codigo: produto.codigo || "",
        descricao: produto.descricao || produto.codigo || "",
        lote: produto.lote || "",
        validade: produto.validade || "",
        quantidade: produto.quantidade || ""
      });
    }

    return respostaJsonp_("__sinalizadosCb", {
      sucesso: true,
      registros: registros.reverse()
    });

  } catch (e) {
    return respostaJsonp_("__sinalizadosCb", {
      sucesso: false,
      mensagem: mensagemErro_(e),
      registros: []
    });
  }
}

function buscarProdutoPorChave_(ss,chave) {
  for(const sh of ss.getSheets()) {
    if(sh.getName()==="Sinalizacao")continue;
    const lr=sh.getLastRow(),lc=sh.getLastColumn(); if(lr<2||lc<2)continue;
    const heads=sh.getRange(1,1,1,lc).getDisplayValues()[0].map(normalizarTexto_);
    let ki=heads.indexOf("chave unica"); if(ki<0)ki=heads.indexOf("chave unica do lancamento"); if(ki<0)continue;
    const rows=sh.getRange(2,1,lr-1,lc).getDisplayValues();
    for(let i=0;i<rows.length;i++) if(String(rows[i][ki]||"").trim()===chave) {
      const get=(names,fallback)=>{for(const n of names){const j=heads.indexOf(n);if(j>=0)return rows[i][j]||"";}return fallback>=0&&fallback<rows[i].length?rows[i][fallback]:"";};
      return {codigo:get(["codigo","ean","codigo de barras"],0),descricao:get(["descricao","produto"],-1),lote:get(["lote"],1),validade:get(["validade","data de validade"],2),quantidade:get(["quantidade","qtd"],3)};
    }
  }
  return {};
}

function atualizarSinalizado_(parametros) {
  if(String(parametros.callback||"")!=="__atualizarSinalizadoCb")return respostaTexto_("Callback inválido.");
  try {
    const sessao = exigirAdministrador_(parametros);
    garantirLojaOrigemSinalizacao_();
    const chave=String(parametros.chaveUnica||"").trim(), status=String(parametros.status||"").trim(), motivoResolucao=String(parametros.motivoResolucao||"").trim();
    if(!chave)throw new Error("Chave Única não informada.");
    if(!["Resolvido","Negado"].includes(status))throw new Error("Selecione Resolvido ou Negado.");
    if(status==="Resolvido"&&!motivoResolucao)throw new Error("Informe o motivo da resolução.");
    const sh=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Sinalizacao"); if(!sh||sh.getLastRow()<2)throw new Error("Aba Sinalizacao não encontrada ou vazia.");
    const headers=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0].map(normalizarTexto_), ki=headers.indexOf("chave unica"), mi=headers.indexOf("motivo"), ai=headers.indexOf("acao tomada");
    if(ki<0||mi<0||ai<0)throw new Error("Confira os cabeçalhos da aba Sinalizacao.");
    const keys=sh.getRange(2,ki+1,sh.getLastRow()-1,1).getDisplayValues(); let row=-1;
    for(let i=0;i<keys.length;i++)if(String(keys[i][0]).trim()===chave){row=i+2;break;}
    if(row<0)throw new Error("Sinalização não encontrada.");
    const idxLoja = headers.indexOf("lojaorigem");
    const lojaRegistro = idxLoja >= 0 ? normalizarLoja_(sh.getRange(row, idxLoja + 1).getDisplayValue()) : "";
    if (!lojaRegistro || lojaRegistro !== sessao.loja) throw new Error("Você só pode atualizar sinalizações da sua loja.");
    if(status==="Resolvido") { const antigo=String(sh.getRange(row,mi+1).getDisplayValue()||"").trim(); sh.getRange(row,mi+1).setValue(antigo+" | Resolução: "+motivoResolucao); }
    sh.getRange(row,ai+1).setValue(status); SpreadsheetApp.flush();
    return respostaJsonp_("__atualizarSinalizadoCb",{sucesso:true,mensagem:"Sinalização atualizada para "+status+"."});
  }catch(e){return respostaJsonp_("__atualizarSinalizadoCb",{sucesso:false,mensagem:mensagemErro_(e)});}
}

/* =========================================
   CONSULTA DE VALIDADES
   ========================================= */


function listarAbasMapa_() {
  const planilha = SpreadsheetApp.openById(SPREADSHEET_ID);

  // Usa o cadastro da aba "Funcionarios" (inclui especiais e Transferencias).
  const nomes = obterNomesAbasCadastro_();

  return [...new Set(
    nomes.filter(function (nome) {
      return nome && planilha.getSheetByName(nome);
    })
  )];
}

function converterValidadeParaData_(valor, textoExibido) {
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return valor;
  }

  if (typeof valor === "number" && isFinite(valor)) {
    const data = new Date((valor - 25569) * 86400000);
    if (!isNaN(data.getTime())) return data;
  }

  const texto = String(textoExibido || valor || "").trim();
  if (!texto) return null;

  let match = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const dia = Number(match[1]);
    const mes = Number(match[2]);
    const ano = Number(match[3]);
    const data = new Date(ano, mes - 1, dia);
    if (
      data.getFullYear() === ano &&
      data.getMonth() === mes - 1 &&
      data.getDate() === dia
    ) {
      return data;
    }
  }

  match = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const ano = Number(match[1]);
    const mes = Number(match[2]);
    const dia = Number(match[3]);
    const data = new Date(ano, mes - 1, dia);
    if (
      data.getFullYear() === ano &&
      data.getMonth() === mes - 1 &&
      data.getDate() === dia
    ) {
      return data;
    }
  }

  match = texto.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (match) {
    const ano = Number(match[1]);
    const mes = Number(match[2]);
    const dia = Number(match[3]);
    const data = new Date(ano, mes - 1, dia);
    if (
      data.getFullYear() === ano &&
      data.getMonth() === mes - 1 &&
      data.getDate() === dia
    ) {
      return data;
    }
  }

  return null;
}

function verificarChaveLancamento_(p) {
  const cb = String(p.callback || "");
  if (cb !== "__verificarChaveLancamentoCb") return respostaTexto_("Callback inválido.");
  try {
    const chave = String(p.requestId || "").trim();
    const funcionario = String(p.funcionario || "").trim();
    if (!idValido_(chave) || !funcionario) throw new Error("Identificador ou destino inválido.");

    let aba, coluna;
    if (funcionario === "Estoque") {
      const sessao = exigirAdministrador_({ sessao: p.sessao });
      aba = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Estoque");
      coluna = 9;
      if (!aba || aba.getLastRow() < 2) return respostaJsonp_(cb, { sucesso: true, encontrado: false });
      const ultima = aba.getLastRow();
      const valores = aba.getRange(2, coluna, ultima - 1, 1).createTextFinder(chave).matchEntireCell(true).findNext();
      if (!valores) return respostaJsonp_(cb, { sucesso: true, encontrado: false });
      const lojaLinha = normalizarLoja_(aba.getRange(valores.getRow(), 8).getDisplayValue());
      if (lojaLinha !== normalizarLoja_(sessao.loja)) throw new Error("Lançamento não pertence à sua loja.");
      return respostaJsonp_(cb, { sucesso: true, encontrado: true, mensagem: "Produto localizado no Estoque." });
    }

    const dadosSessao = funcionario === "Transferencias" ? obterSessaoObrigatoria_({ sessao: p.sessao }) : exigirSessaoLancamento_({ sessao: p.sessao, funcionario });
    if (funcionario === "Transferencias" && (!dadosSessao.administrador || dadosSessao.administradorGeral)) throw new Error("Somente o Administrador de Loja pode consultar Transferências.");
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    aba = ss.getSheetByName(funcionario);
    coluna = funcionario === "Transferencias" ? 8 : 6;
    if (!aba || aba.getLastRow() < 2) return respostaJsonp_(cb, { sucesso: true, encontrado: false });
    const achado = aba.getRange(2, coluna, aba.getLastRow() - 1, 1).createTextFinder(chave).matchCase(true).matchEntireCell(false).findAll()
      .some(c => String(c.getDisplayValue() || "").trim() === chave || String(c.getDisplayValue() || "").split("|").map(v => v.trim()).includes(chave));
    return respostaJsonp_(cb, { sucesso: true, encontrado: achado, mensagem: achado ? "Lançamento localizado na planilha." : "Chave ainda não localizada." });
  } catch (e) {
    return respostaJsonp_(cb, { sucesso: false, mensagem: mensagemErro_(e) });
  }
}

function verificarItemMapa_(p) {
  const cb = String(p.callback || "");
  if (cb !== "__verificarItemMapaCb") return respostaTexto_("Callback inválido.");
  try {
    const funcionario = String(p.funcionario || "").trim();
    let sessao;
    if (funcionario === "Transferencias") {
      sessao = obterSessaoObrigatoria_({ sessao: p.sessao });
      if (!sessao.administrador || sessao.administradorGeral) throw new Error("Somente o Administrador de Loja pode consultar Transferências.");
    } else {
      const dados = { sessao: p.sessao, funcionario };
      sessao = exigirSessaoLancamento_(dados);
    }
    const codigo = String(p.codigo || "").trim();
    const lote = String(p.lote || "").trim();
    const validadeISO = String(p.validade || "").trim();
    if (!codigo || !lote || !/^\d{4}-\d{2}-\d{2}$/.test(validadeISO)) throw new Error("Dados incompletos para verificar o mapa.");
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const aba = ss.getSheetByName(funcionario);
    if (!aba || aba.getLastRow() < 2) return respostaJsonp_(cb, { sucesso: true, existe: false, quantidade: 0, ocorrencias: 0 });
    const transferencia = funcionario === "Transferencias";
    const largura = transferencia ? 8 : 6;
    // Localiza primeiro apenas as linhas com o EAN informado; não carrega o mapa inteiro.
    const ultimaLinha = aba.getLastRow();
    const candidatos = aba.getRange(2, 1, ultimaLinha - 1, 1)
      .createTextFinder(codigo).matchCase(true).matchEntireCell(true).findAll();
    let quantidade = 0, ocorrencias = 0;
    for (const celula of candidatos) {
      const linha = celula.getRow();
      const row = aba.getRange(linha, 1, 1, largura).getValues()[0];
      const shown = aba.getRange(linha, 1, 1, largura).getDisplayValues()[0];
      if (transferencia && normalizarLoja_(shown[5]) !== sessao.loja) continue;
      const cod = String(shown[0] || "").trim();
      const lot = String(shown[1] || "").trim();
      const validade = converterValidadeParaData_(row[2], shown[2]);
      if (!validade) continue;
      const iso = Utilities.formatDate(validade, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd");
      if (cod === codigo && normalizarTexto_(lot) === normalizarTexto_(lote) && iso === validadeISO) {
        quantidade += Number(row[3]) || 0;
        ocorrencias++;
      }
    }
    return respostaJsonp_(cb, { sucesso: true, existe: ocorrencias > 0, quantidade, ocorrencias, funcionario });
  } catch (e) {
    return respostaJsonp_(cb, { sucesso: false, mensagem: mensagemErro_(e) });
  }
}

function consultarValidades_(parametros) {
  if (String(parametros.callback || "") !== "__validadeCb") {
    return respostaTexto_("Callback inválido.");
  }

  try {
    const planilha = SpreadsheetApp.openById(SPREADSHEET_ID);
    const fuso = planilha.getSpreadsheetTimeZone();
    const sessao = obterSessaoObrigatoria_(parametros);
    const abas = obterAbasPermitidas_(parametros);
    const especiais = obterAbasEspeciais_();
    const registros = [];
    const registrosQueima = [];

    // A aba Queima é a fonte oficial para ocultar produtos já enviados.
    // A comparação é por chave única e loja, não pelo localStorage do navegador.
    const chavesQueimaDaLoja = new Set();
    const abaQueima = planilha.getSheetByName("Queima");
    if (abaQueima && abaQueima.getLastRow() >= 2) {
      const qVals = abaQueima.getDataRange().getValues();
      const qDisp = abaQueima.getDataRange().getDisplayValues();
      const qHead = qDisp[0].map(h => normalizarTexto_(h).replace(/\s+/g, " "));
      const qOrigem = qHead.findIndex(h => ["aba de origem", "aba origem", "funcionario", "mapa de origem"].includes(h));
      const qLoja = qHead.indexOf("lojaorigem");
      const qChave = qHead.findIndex(h => ["chave unica", "chave unica origem"].includes(h));
      for (let qi = 1; qi < qVals.length; qi++) {
        if (qChave < 0) break;
        const origemNome = qOrigem >= 0 ? String(qDisp[qi][qOrigem] || "").trim() : "";
        let lojaRegistro = qLoja >= 0 ? normalizarLoja_(qDisp[qi][qLoja]) : "";
        if (!lojaRegistro && origemNome && normalizarTexto_(origemNome) !== "cadastro manual") {
          const cad = buscarFuncionarioPorNome_(origemNome);
          if (cad && !cad.administrador) lojaRegistro = normalizarLoja_(cad.loja);
        }
        const chaveRegistro = String(qDisp[qi][qChave] || qVals[qi][qChave] || "").trim();
        if (chaveRegistro && lojaRegistro === sessao.loja) chavesQueimaDaLoja.add(chaveRegistro);
      }
    }

    abas.forEach(function (nomeAba) {
      const aba = planilha.getSheetByName(nomeAba);
      if (!aba) return;

      const ultimaLinha = aba.getLastRow();
      if (ultimaLinha < 2) return;

      const ehTransferencia = nomeAba === "Transferencias";
      const largura = ehTransferencia ? 8 : 6;
      const range = aba.getRange(2, 1, ultimaLinha - 1, largura);
      const valores = range.getValues();
      const exibidos = range.getDisplayValues();

      valores.forEach(function (linha, idx) {
        const exibe = exibidos[idx] || [];
        const codigo = String(exibe[0] || "").trim();

        if (!codigo) return;

        // Restringe as transferências à loja do usuário e separa registros enviados à Queima.
        let destinoRegistros = registros;
        if (ehTransferencia) {
          const lojaOrigem = normalizarLoja_(exibe[5]);

          if (lojaOrigem !== sessao.loja) return;
          const chaveTransferencia = String(exibe[7] || "").trim();
          if (chaveTransferencia && chavesQueimaDaLoja.has(chaveTransferencia)) destinoRegistros = registrosQueima;
        } else {
          const chaveMapa = String(linha[5] || "").trim();
          if (chaveMapa && chavesQueimaDaLoja.has(chaveMapa)) destinoRegistros = registrosQueima;
        }

        const validade = converterValidadeParaData_(linha[2], exibe[2]);
        if (!validade) return;

        const validadeFormatada = Utilities.formatDate(validade, fuso, "dd/MM/yyyy");
        const validadeISO = Utilities.formatDate(validade, fuso, "yyyy-MM-dd");

        if (ehTransferencia) {
          const mesData = linha[4];
          const mesLancamento =
            mesData instanceof Date && !isNaN(mesData.getTime())
              ? Utilities.formatDate(mesData, fuso, "yyyy-MM")
              : "";

          destinoRegistros.push({
            funcionario: nomeAba,
            codigo: codigo,
            lote: String(exibe[1] || "").trim(),
            validade: validadeFormatada,
            validadeISO: validadeISO,
            quantidade: Number(linha[3]) || 0,
            dataLancamento:
              mesData instanceof Date && !isNaN(mesData.getTime())
                ? Utilities.formatDate(mesData, fuso, "MM/yyyy")
                : String(exibe[4] || ""),
            ts:
              mesData instanceof Date && !isNaN(mesData.getTime())
                ? mesData.getTime()
                : 0,
            especial: false,
            lojaOrigem: String(exibe[5] || "").trim(),
            romaneio: String(exibe[6] || "").trim(),
            chaveUnica: String(exibe[7] || "").trim(),
            mesLancamento: mesLancamento
          });

          return;
        }

        const dataLancamento = linha[4];
        const dataValida =
          dataLancamento instanceof Date && !isNaN(dataLancamento.getTime());

        destinoRegistros.push({
          funcionario: nomeAba,
          codigo: codigo,
          lote: String(exibe[1] || "").trim(),
          validade: validadeFormatada,
          validadeISO: validadeISO,
          quantidade: Number(linha[3]) || 0,
          dataLancamento: dataValida
            ? Utilities.formatDate(dataLancamento, fuso, "dd/MM/yyyy HH:mm:ss")
            : String(exibe[4] || ""),
          ts: dataValida ? dataLancamento.getTime() : 0,
          especial: especiais.includes(nomeAba),
          chaveUnica: String(linha[5] || "").trim()
        });
      });
    });

    // ========= AGRUPAMENTO CORRETO POR: codigo + lote + validade =========
    const mapaAgrupado = new Map();

    registros.forEach(function (item) {
      const codigo = String(item.codigo || "").trim();
      const lote = String(item.lote || "").trim() || "SEM_LOTE";
      const validadeISO = String(item.validadeISO || "").trim();

      const chave = codigo + "|" + lote + "|" + validadeISO;

      if (!mapaAgrupado.has(chave)) {
        mapaAgrupado.set(chave, {
          funcionario: item.funcionario,
          codigo: codigo,
          lote: lote,
          validade: item.validade,
          validadeISO: validadeISO,
          quantidade: 0,
          dataLancamento: item.dataLancamento,
          especial: item.especial || false,
          chaveUnica: item.chaveUnica || "",
          lojaOrigem: item.lojaOrigem || "",
          romaneio: item.romaneio || ""
        });
      }

      const registroAgrupado = mapaAgrupado.get(chave);
      registroAgrupado.quantidade += Number(item.quantidade) || 0;
    });

    const registrosAgrupados = Array.from(mapaAgrupado.values());

    return respostaJsonp_("__validadeCb", {
      sucesso: true,
      registros: registrosAgrupados,
      registrosQueima: registrosQueima
    });

  } catch (erro) {
    console.error("Erro ao consultar validades: " + (erro && erro.stack ? erro.stack : erro));
    return respostaJsonp_("__validadeCb", {
      sucesso: false,
      mensagem: "Não foi possível consultar as validades.",
      registros: []
    });
  }
}



/* =========================================
   EDITAR E EXCLUIR LANÇAMENTOS
   ========================================= */
function localizarLancamento_(chaveUnica) {
  const planilha = SpreadsheetApp.openById(SPREADSHEET_ID);
  const nomesAbas = obterNomesAbasCadastro_();

  for (const nome of nomesAbas) {
    const aba = planilha.getSheetByName(nome);
    if (!aba || aba.getLastRow() < 2) continue;

    const colunaChave = nome === "Transferencias" ? 8 : 6;
    const linha = localizarChaveNaAba_(aba, colunaChave, chaveUnica);

    if (linha > 0) {
      return {
        aba: aba,
        nomeAba: nome,
        linha: linha,
        colunaChave: colunaChave,
        chaveOriginal: String(
          aba.getRange(linha, colunaChave).getDisplayValue() || ""
        ).trim(),
        chaveUnica: chaveUnica
      };
    }
  }

  return null;
}


function editarLancamento_(parametros) {
  const callback = String(parametros.callback || "");

  if (callback !== "__editarCb") {
    return respostaTexto_("Callback inválido.");
  }

  const bloqueio = LockService.getScriptLock();
  let bloqueioAdquirido = false;

  try {
    const chave = String(parametros.chaveUnica || "").trim();
    const codigo = String(parametros.codigo || "").trim();
    const lote = String(parametros.lote || "").trim();
    const validadeTexto = String(parametros.validade || "").trim();
    const quantidadeTexto = String(parametros.quantidade ?? "").trim();

    if (!chave) {
      throw new Error("Chave única não informada.");
    }

    if (!/^\d{8,14}$/.test(codigo)) {
      throw new Error("O código deve conter de 8 a 14 dígitos.");
    }

    if (!lote || lote.length > 100) {
      throw new Error("Informe um lote com até 100 caracteres.");
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(validadeTexto)) {
      throw new Error("Informe uma validade válida.");
    }

    const partesData = validadeTexto.split("-").map(Number);
    const validade = new Date(
      partesData[0],
      partesData[1] - 1,
      partesData[2]
    );

    if (
      validade.getFullYear() !== partesData[0] ||
      validade.getMonth() !== partesData[1] - 1 ||
      validade.getDate() !== partesData[2]
    ) {
      throw new Error("A data de validade não existe.");
    }

    if (!/^\d+$/.test(quantidadeTexto)) {
      throw new Error("A quantidade deve ser um número inteiro.");
    }

    const quantidade = Number(quantidadeTexto);

    if (!Number.isSafeInteger(quantidade) || quantidade < 1) {
      throw new Error("A quantidade deve ser maior que zero.");
    }

    if (!bloqueio.tryLock(15000)) {
      throw new Error("Sistema ocupado. Tente novamente.");
    }
    bloqueioAdquirido = true;

    const registro = localizarLancamento_(chave);

    if (!registro) {
      throw new Error("Lançamento não encontrado. Atualize o painel.");
    }

    exigirAcessoRegistro_(parametros, registro);


    const aba = registro.aba;
    const linha = registro.linha;
    const transferencia = registro.nomeAba === "Transferencias";

    // A estrutura inicial dos campos é igual:
    // A = Código, B = Lote, C = Validade, D = Quantidade.
    // A chave fica em F nas abas normais e em H em Transferencias.
    // Ao editar, mantém a coluna de código como texto.
    aba.getRange(linha, 1).setNumberFormat("@");
    aba.getRange(linha, 1, 1, 4).setValues([[
      codigo,
      lote,
      validade,
      quantidade
    ]]);

    aba.getRange(linha, 3).setNumberFormat("dd/MM/yyyy");

    // Reforça a preservação da chave original.
    // Não altera as demais colunas do lançamento.
    const colunaChave = transferencia ? 8 : 6;
    const chaveAtual = String(
      aba.getRange(linha, colunaChave).getDisplayValue() || ""
    ).trim();

    if (!chaveAtual.split("|").map(v => v.trim()).includes(chave)) {
      throw new Error(
        "A chave única mudou durante a edição. Confira o lançamento."
      );
    }

    SpreadsheetApp.flush();

    return respostaJsonp_(callback, {
      sucesso: true,
      mensagem: "Lançamento atualizado com sucesso."
    });

  } catch (erro) {
    return respostaJsonp_(callback, {
      sucesso: false,
      mensagem: mensagemErro_(erro)
    });

  } finally {
    if (bloqueioAdquirido) {
      bloqueio.releaseLock();
    }
  }
}


function excluirLancamento_(parametros) {
  const callback = String(parametros.callback || "");

  if (callback !== "__excluirCb") {
    return respostaTexto_("Callback inválido.");
  }

  const bloqueio = LockService.getScriptLock();

  try {
    const chave = String(parametros.chaveUnica || "").trim();

    if (!chave) {
      throw new Error("Chave única não informada.");
    }

    if (!bloqueio.tryLock(15000)) {
      throw new Error("Sistema ocupado. Tente novamente.");
    }

    const registro = localizarLancamento_(chave);

    if (!registro) {
      throw new Error("Lançamento não encontrado. Atualize a página.");
    }

    exigirAcessoRegistro_(parametros, registro);

    // Exclui a linha encontrada, inclusive nas abas agrupadas.
    registro.aba.deleteRow(registro.linha);

    SpreadsheetApp.flush();

    return respostaJsonp_(callback, {
      sucesso: true,
      mensagem: "Item excluído com sucesso."
    });

  } catch (erro) {
    return respostaJsonp_(callback, {
      sucesso: false,
      mensagem: mensagemErro_(erro)
    });

  } finally {
    if (bloqueio.hasLock()) {
      bloqueio.releaseLock();
    }
  }
}

/* ===== Funções do Dashboard e Produtos Vencidos ===== */
function consultarDashboardPainel_(parametros) {
  const callback = String(parametros.callback || "");
  if (callback !== "__dashboardPainelCb") return respostaTexto_("Callback inválido.");
  try {
    const planilha = SpreadsheetApp.openById(SPREADSHEET_ID);
    const fuso = planilha.getSpreadsheetTimeZone();
    const agora = new Date();
    const mesAtual = Utilities.formatDate(agora, fuso, "yyyy-MM");
    const sessao = obterSessaoObrigatoria_(parametros);
    const nomesAbas = obterAbasPermitidas_(parametros);
    const abasPermitidas = new Set(nomesAbas);
    let lancamentosMes = 0;
    let lancamentosTotal = 0;
    let aVencer = 0;
    let vencidosSalao = 0;

    nomesAbas.forEach(nome => {
      const aba = planilha.getSheetByName(nome);
      if (!aba || aba.getLastRow() < 2) return;
      const transferencia = nome === "Transferencias";
      const especial = obterAbasEspeciais_().includes(nome);
      const n = aba.getLastRow() - 1;
      const valores = aba.getRange(2, 1, n, transferencia ? 8 : 6).getValues();
      valores.forEach(linha => {
        if (!String(linha[0] || "").trim()) return;
        lancamentosTotal++;
        const validade = linha[2];
        const dataLanc = transferencia ? linha[4] : linha[4];
        if (dataLanc instanceof Date && !isNaN(dataLanc.getTime())) {
          if (Utilities.formatDate(dataLanc, fuso, "yyyy-MM") === mesAtual) lancamentosMes++;
        }
        if (!(validade instanceof Date) || isNaN(validade.getTime())) return;
        const dias = Math.floor((new Date(validade.getFullYear(), validade.getMonth(), validade.getDate()) - new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())) / 86400000);
        if (dias < 0) vencidosSalao++;
        else if (dias <= 160) aVencer++;
      });
    });

    const abaQueima = planilha.getSheetByName("Queima");
    let queimaTotal = 0, queimaMes = 0, queimaAprovadosTotal = 0, queimaAprovadosMes = 0;
    if (abaQueima && abaQueima.getLastRow() >= 2) {
      const rows = abaQueima.getDataRange().getValues();
      const headers = rows[0].map(h => normalizarTexto_(h).replace(/\s+/g, " "));
      const idx = {
        codigo: headers.findIndex(h => ["codigo de barras", "codigo", "ean"].includes(h)),
        mes: headers.findIndex(h => ["mes do lancamento", "mes de lancamento", "data de registro / mes de lancamento", "mes lancamento"].includes(h)),
        mesAprovado: headers.findIndex(h => ["mes aprovado", "mes da aprovacao"].includes(h)),
        aprovado: headers.findIndex(h => h === "aprovado"),
        origem: headers.findIndex(h => ["aba de origem", "origem"].includes(h)),
        loja: headers.indexOf("lojaorigem"),
      };
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        // A Queima é compartilhada, então só conta registros
        // originados nos mapas permitidos desta loja.
        // Transferências ficam de fora até armazenarmos a loja
        // de origem também na aba Queima.
        const abaOrigem = idx.origem >= 0
          ? String(row[idx.origem] || "").trim()
          : "";

        if (normalizarTexto_(abaOrigem) === "cadastro manual") {
          const lojaManual = idx.loja >= 0 ? normalizarLoja_(row[idx.loja]) : "";
          if (lojaManual !== sessao.loja) continue;
        } else if (
          !abaOrigem || abaOrigem === "Transferencias" || !abasPermitidas.has(abaOrigem)
        ) {
          continue;
        }
        // Contabiliza somente linhas de produtos efetivamente cadastrados.
        // Linhas formatadas, fórmulas vazias ou aprovações sem código são ignoradas.
        const codigo = idx.codigo >= 0 ? String(row[idx.codigo] == null ? "" : row[idx.codigo]).trim() : "";
        if (!codigo || /^total$/i.test(codigo)) continue;
        const mesReg = idx.mes >= 0 ? mesChavePainel_(row[idx.mes], fuso) : "";
        // Aprovado só conta quando o valor da coluna for exatamente "Sim".
        // S, TRUE, 1, vazio e outros valores não são considerados aprovados.
        const aprovadoTexto = idx.aprovado >= 0 ? normalizarTexto_(row[idx.aprovado]) : "";
        const aprovado = aprovadoTexto === "sim";
        queimaTotal++;
        if (mesReg === mesAtual) queimaMes++;
        if (aprovado) {
          queimaAprovadosTotal++;
          const mesAprovado = idx.mesAprovado >= 0 ? mesChavePainel_(row[idx.mesAprovado], fuso) : "";
          if (mesAprovado === mesAtual) queimaAprovadosMes++;
        }
      }
    }

    const abaVencidos = planilha.getSheetByName("Vencidos");
    let vencidosRetirados = 0;
    if (abaVencidos && abaVencidos.getLastRow() > 1) {
      const linhasVencidos = abaVencidos.getRange(2, 1, abaVencidos.getLastRow() - 1, Math.min(abaVencidos.getLastColumn(), 11)).getDisplayValues();
      linhasVencidos.forEach((linha, i) => {
        if (lojaDaLinhaVencidos_(abaVencidos, i + 2, linha) === sessao.loja) vencidosRetirados++;
      });
    }
    const resultado = {
      sucesso: true,
      indicadores: {
        lancamentos: lancamentosMes,
        lancamentosTotal: lancamentosTotal,
        queimaTotal: queimaTotal,
        queimaMes: queimaMes,
        queimaAprovadosMes: queimaAprovadosMes,
        queimaAprovadosTotal: queimaAprovadosTotal,
        aVencer: aVencer,
        vencidosRetirados: vencidosRetirados,
        vencidosSalao: vencidosSalao
      }
    };
    return respostaJsonp_(callback, resultado);
  } catch (erro) {
    console.error("Erro no Dashboard: " + (erro.stack || erro));
    return respostaJsonp_("__dashboardPainelCb", { sucesso: false, mensagem: mensagemErro_(erro) });
  }
}



function consultarVencidosPainel_(parametros) {
  const callback = String(parametros.callback || "");

  if (callback !== "__vencidosPainelCb") {
    return respostaTexto_("Callback inválido.");
  }

  try {
    const planilha = SpreadsheetApp.openById(SPREADSHEET_ID);
    const fuso = planilha.getSpreadsheetTimeZone();
    const sessao = exigirAdministrador_(parametros);

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const retirados = [];
    const salao = [];

    // =====================================================
    // PRODUTOS JÁ RETIRADOS E ARMAZENADOS NA ABA VENCIDOS
    //
    // A = Aba de origem
    // B = Linha original
    // C = Código
    // D = Descrição
    // E = Lote
    // F = Validade
    // G = Quantidade
    // H = Data de Registro / Mês de Lançamento
    // I = EAN interno
    // J = Chave Única
    // =====================================================

    const abaVencidos = planilha.getSheetByName("Vencidos");

    if (abaVencidos && abaVencidos.getLastRow() >= 2) {
      const ultimaLinha = abaVencidos.getLastRow();
      const totalLinhas = ultimaLinha - 1;

      const valores = abaVencidos
        .getRange(2, 1, totalLinhas, 10)
        .getValues();

      const exibidos = abaVencidos
        .getRange(2, 1, totalLinhas, 10)
        .getDisplayValues();

      valores.forEach((linha, i) => {
        const numeroLinha = i + 2;
        if (lojaDaLinhaVencidos_(abaVencidos, numeroLinha, exibidos[i]) !== sessao.loja) return;
        const abaOrigem = String(exibidos[i][0] || "").trim();
        const linhaOriginal = String(exibidos[i][1] || "").trim();

        // O código correto está na coluna C.
        let codigo = String(exibidos[i][2] || "").trim();

        const descricao = String(exibidos[i][3] || "").trim();
        const lote = String(exibidos[i][4] || "").trim();
        const validade = linha[5];
        const quantidade = Number(linha[6]) || 0;
        const registro = linha[7];
        const eanInterno = String(exibidos[i][8] || "").trim();

        const chaveUnica =
          String(exibidos[i][9] || "").trim() ||
          "ROW:" + (i + 2);

        // Ignora somente linhas sem qualquer identificação.
        if (!codigo && !eanInterno && !descricao) {
          return;
        }

        // Recupera o código usando o EAN interno quando
        // a coluna Código estiver vazia.
        if (!codigo && eanInterno) {
          codigo = localizarCodigoPorEanVencidos_(
            planilha,
            eanInterno
          );
        }

        const validadeFormatada =
          validade instanceof Date && !isNaN(validade.getTime())
            ? Utilities.formatDate(
                validade,
                fuso,
                "dd/MM/yyyy"
              )
            : String(exibidos[i][5] || "");

        const registroFormatado =
          registro instanceof Date && !isNaN(registro.getTime())
            ? Utilities.formatDate(
                registro,
                fuso,
                "dd/MM/yyyy HH:mm:ss"
              )
            : String(exibidos[i][7] || "");

        retirados.push({
          abaOrigemInicial: abaOrigem,
          linhaOriginal: linhaOriginal,
          codigo: codigo,
          descricao: descricao,
          lote: lote,
          validade: validadeFormatada,
          quantidade: quantidade,
          abaOrigem: abaOrigem,
          dataColeta: "",
          dataRegistro: registroFormatado,
          mesRegistro: registro instanceof Date &&
            !isNaN(registro.getTime())
              ? Utilities.formatDate(
                  registro,
                  fuso,
                  "MM/yyyy"
                )
              : registroFormatado,
          eanInterno: eanInterno,
          chaveUnica: chaveUnica,
          linhaPlanilha: i + 2
        });
      });
    }

    // =====================================================
    // PRODUTOS VENCIDOS QUE AINDA ESTÃO NAS ABAS DOS MAPAS
    // =====================================================

    const nomesAbas = obterAbasPermitidas_(parametros);

    nomesAbas.forEach(nome => {
      const aba = planilha.getSheetByName(nome);

      if (!aba || aba.getLastRow() < 2) {
        return;
      }

      const transferencia = nome === "Transferencias";
      const especial = obterAbasEspeciais_().includes(nome);

      const numeroColunas = transferencia ? 8 : 6;
      const totalLinhas = aba.getLastRow() - 1;

      const valores = aba
        .getRange(2, 1, totalLinhas, numeroColunas)
        .getValues();

      const exibidos = aba
        .getRange(2, 1, totalLinhas, numeroColunas)
        .getDisplayValues();

      valores.forEach((linha, i) => {
        const codigo = String(exibidos[i][0] || "").trim();

        if (!codigo) {
          return;
        }

        if (transferencia) {
          const lojaOrigem = normalizarLoja_(exibidos[i][5]);

          if (lojaOrigem !== sessao.loja) return;
        }

        
        const validade = converterValidadeParaData_(
          linha[2],
          exibidos[i][2]
        );

        if (!validade) {
          return;
        }

        const dataValidade = new Date(
          validade.getFullYear(),
          validade.getMonth(),
          validade.getDate()
        );

        if (dataValidade >= hoje) {
          return;
        }


        const dataLancamento = linha[4];

        const chaveUnica = transferencia
          ? String(exibidos[i][7] || "").trim()
          : String(linha[5] || "").trim();

        salao.push({
          funcionario: nome,
          codigo: codigo,
          descricao: "",
          lote: String(exibidos[i][1] || ""),

          validade: Utilities.formatDate(
            validade,
            fuso,
            "dd/MM/yyyy"
          ),

          validadeISO: Utilities.formatDate(
            validade,
            fuso,
            "yyyy-MM-dd"
          ),

          quantidade: Number(linha[3]) || 0,

          dataLancamento:
            dataLancamento instanceof Date &&
            !isNaN(dataLancamento.getTime())
              ? Utilities.formatDate(
                  dataLancamento,
                  fuso,
                  transferencia ? "MM/yyyy" : "dd/MM/yyyy HH:mm:ss"
                )
              : String(exibidos[i][4] || ""),

          chaveUnica: chaveUnica,
          especial: especial
        });
      });
    });

    return respostaJsonp_(callback, {
      sucesso: true,
      retirados: retirados,
      salao: salao
    });

  } catch (erro) {
    console.error(
      "Erro na consulta de vencidos: " +
      (erro.stack || erro)
    );

    return respostaJsonp_("__vencidosPainelCb", {
      sucesso: false,
      mensagem: mensagemErro_(erro),
      retirados: [],
      salao: []
    });
  }
}


// =====================================================
// LOCALIZA O CÓDIGO DO PRODUTO PELO EAN INTERNO NA ABA
// VENCIDOS, CONSULTANDO A PLANILHA DE PRODUTOS.
// =====================================================

function localizarCodigoPorEanVencidos_(planilha, eanProcurado) {
  const ean = String(eanProcurado || "").trim();

  if (!ean) {
    return "";
  }

  const abaProdutos = planilha.getSheetByName("Produtos");

  if (!abaProdutos || abaProdutos.getLastRow() < 2) {
    return "";
  }

  const totalLinhas = abaProdutos.getLastRow() - 1;

  const valores = abaProdutos
    .getRange(2, 1, totalLinhas, 3)
    .getDisplayValues();

  // Estrutura esperada da aba Produtos:
  // A = Código
  // B = EAN
  // C = Descrição
  const eanNormalizado = ean.replace(/\D/g, "");

  for (let i = 0; i < valores.length; i++) {
    const codigoProduto = String(valores[i][0] || "").trim();
    const eanProduto = String(valores[i][1] || "")
      .trim()
      .replace(/\D/g, "");

    if (
      codigoProduto &&
      eanProduto &&
      eanProduto === eanNormalizado
    ) {
      return codigoProduto;
    }
  }

  return "";
}



function mesChavePainel_(valor, fuso) {
  if (valor instanceof Date && !isNaN(valor.getTime())) return Utilities.formatDate(valor, fuso, "yyyy-MM");
  const texto = String(valor || "").trim();
  let m = texto.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return m[1] + "-" + String(Number(m[2])).padStart(2, "0");
  m = texto.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return m[2] + "-" + String(Number(m[1])).padStart(2, "0");
  const meses = { janeiro:1, fevereiro:2, marco:3, abril:4, maio:5, junho:6, julho:7, agosto:8, setembro:9, outubro:10, novembro:11, dezembro:12 };
  m = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/^([a-z]+)\s+(\d{4})$/);
  if (m && meses[m[1]]) return m[2] + "-" + String(meses[m[1]]).padStart(2, "0");
  return "";
}


/** Registra um produto danificado na aba Vencidos, sem misturá-lo às perdas por vencimento. */
function adicionarDanificado_(p) {
  const cb=String(p.callback||''); if(cb!=='__adicionarDanificadoCb') return respostaTexto_('Callback inválido.');
  const lock=LockService.getScriptLock();
  try {
    const admin = exigirAdministrador_(p);
    const codigo=String(p.codigo||'').trim(), descricao=String(p.descricao||'').trim(), lote=String(p.lote||'').trim();
    const validadeTexto=String(p.validade||'').trim(), quantidadeTexto=String(p.quantidade||'').trim();
    if(!codigo||!descricao||!validadeTexto||!quantidadeTexto) throw new Error('Código, descrição, validade e quantidade são obrigatórios.');
    if(codigo.length>80||descricao.length>250||lote.length>120) throw new Error('Um dos campos ultrapassa o tamanho permitido.');
    const quantidade=Number(quantidadeTexto.replace(',','.'));
    if(!Number.isFinite(quantidade)||quantidade<=0) throw new Error('Informe uma quantidade numérica maior que zero.');
    let validade;
    let m=validadeTexto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(m) validade=new Date(Number(m[3]),Number(m[2])-1,Number(m[1]));
    else if(/^\d{4}-\d{2}-\d{2}$/.test(validadeTexto)){const a=validadeTexto.split('-').map(Number);validade=new Date(a[0],a[1]-1,a[2]);}
    else throw new Error('Validade inválida. Use DD/MM/AAAA.');
    if(isNaN(validade.getTime())||validade.getDate()!==Number((m||[])[1]||validade.getDate())) throw new Error('A data de validade não é válida.');
    if(!lock.tryLock(10000)) throw new Error('Sistema ocupado. Tente novamente.');
    const ss=SpreadsheetApp.openById(SPREADSHEET_ID);let sh=ss.getSheetByName('Vencidos');
    if(!sh){sh=ss.insertSheet('Vencidos');sh.appendRow(['Aba de origem','Linha original','Código','Descrição','Lote','Validade','Quantidade','Data de Registro / Mês de Lançamento','EAN interno','Chave Única','LojaOrigem']);}
    if (sh.getLastColumn() < 11) sh.getRange(1,11).setValue('LojaOrigem');
    const chave='DAN-' + Utilities.getUuid();
    // A:J preservam o formato histórico; K identifica a loja responsável.
    sh.appendRow(['Danificado','',codigo,descricao,lote,validade,quantidade,new Date(),' ',chave,admin.loja]);
    SpreadsheetApp.flush();
    return respostaJsonp_(cb,{sucesso:true,mensagem:'Produto danificado registrado na aba Vencidos.',chaveUnica:chave});
  } catch(e){return respostaJsonp_(cb,{sucesso:false,mensagem:mensagemErro_(e)});} finally {if(lock.hasLock())lock.releaseLock();}
}

function retirarDeLoja_(p) {
  const cb=String(p.callback||''); if(cb!=='__retirarDeLojaCb') return respostaTexto_('Callback inválido.');
  const lock=LockService.getScriptLock();
  try {
    const admin = exigirAdministrador_(p);
    const chave=String(p.chaveUnica||'').trim(); if(!chave) throw new Error('Chave Única ou linha não informada.');
    if(!lock.tryLock(10000)) throw new Error('Sistema ocupado. Tente novamente.');
    const ss=SpreadsheetApp.openById(SPREADSHEET_ID); const sh=ss.getSheetByName('Vencidos');
    if(!sh||sh.getLastRow()<2) throw new Error('A aba Vencidos está vazia.');
    let row=-1;
    if (sh.getLastColumn() < 10) {
      throw new Error('A aba Vencidos precisa ter a coluna J (Chave Única). Nenhuma linha foi excluída.');
    }
    const keys=sh.getRange(2,10,sh.getLastRow()-1,1).getDisplayValues();
    for(let i=0;i<keys.length;i++){
      if(String(keys[i][0]||'').trim()===chave){row=i+2;break;}
    }
    if(row<0) throw new Error('Não encontrei a Chave Única na aba Vencidos. Atualize a página. Nenhuma linha foi excluída.');
    const dadosLinha = sh.getRange(row,1,1,Math.min(sh.getLastColumn(),11)).getDisplayValues()[0];
    if (lojaDaLinhaVencidos_(sh, row, dadosLinha) !== admin.loja) throw new Error('Você só pode retirar registros da sua própria loja.');
    sh.deleteRow(row); SpreadsheetApp.flush();
    return respostaJsonp_(cb,{sucesso:true,mensagem:'Registro removido da aba Vencidos após retirada da loja.'});
  } catch(e){return respostaJsonp_(cb,{sucesso:false,mensagem:mensagemErro_(e)});} finally {if(lock.hasLock())lock.releaseLock();}
}


/** Adiciona o registro selecionado à aba Queima sem remover/alterar a aba de origem. */

function adicionarAoQueima_(p) {
  const cb = String(p.callback || "");

  if (cb !== "__adicionarAoQueimaCb") {
    return respostaTexto_("Callback inválido.");
  }

  const lock = LockService.getScriptLock();

  try {
    const sessao = obterSessaoObrigatoria_(p);

    if (!sessao.administrador) {
      throw new Error(
        "Acesso permitido somente para administradores."
      );
    }

    const chave = String(p.chaveUnica || "").trim();
    const funcionario = String(p.funcionario || "").trim();

    if (!chave || !funcionario) {
      throw new Error(
        "Não foi possível identificar o registro de origem."
      );
    }

    if (!lock.tryLock(10000)) {
      throw new Error("Sistema ocupado. Tente novamente.");
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const origem = ss.getSheetByName(funcionario);
    const queima = ss.getSheetByName("Queima");

    if (!origem) {
      throw new Error(
        "A aba de origem não foi encontrada: " + funcionario
      );
    }

    if (!queima) {
      throw new Error(
        "A aba Queima não existe na planilha."
      );
    }

    const transferencia = funcionario === "Transferencias";

    // =====================================================
    // VALIDAÇÃO DA ORIGEM E DA LOJA
    // =====================================================

    const abasPermitidas = obterAbasPermitidas_(p);

    if (!transferencia && !abasPermitidas.includes(funcionario)) {
      throw new Error(
        "Você não tem permissão para utilizar registros desta aba."
      );
    }

    const ultima = origem.getLastRow();

    if (ultima < 2) {
      throw new Error("A aba de origem está vazia.");
    }

    const ncol = transferencia ? 8 : 6;

    const vals = origem
      .getRange(2, 1, ultima - 1, ncol)
      .getValues();

    const disp = origem
      .getRange(2, 1, ultima - 1, ncol)
      .getDisplayValues();

    let item = null;

    for (let i = 0; i < vals.length; i++) {
      const k = String(
        disp[i][transferencia ? 7 : 5] || ""
      ).trim();

      if (k === chave) {
        item = {
          v: vals[i],
          d: disp[i]
        };
        break;
      }
    }

    if (!item) {
      throw new Error(
        "O registro não foi encontrado na aba de origem. Atualize o Mapa de Validade."
      );
    }

    // Para transferência, a loja é obtida da coluna F.
    let lojaOrigem = String(sessao.loja || "");

    if (transferencia) {
      lojaOrigem = normalizarLoja_(item.d[5]);

      if (!lojaOrigem || lojaOrigem !== sessao.loja) {
        throw new Error(
          "Esta transferência não pertence à sua loja."
        );
      }
    }

    // =====================================================
    // DADOS DO REGISTRO ORIGINAL
    // =====================================================

    const codigo = String(item.d[0] || "").trim();
    const lote = String(item.d[1] || "").trim();
    const validade = item.v[2];
    const quantidade = Number(item.v[3]) || 0;
    const dataLanc = item.v[4];

    const ultimaColuna = queima.getLastColumn();

    const headers = queima
      .getRange(1, 1, 1, ultimaColuna)
      .getDisplayValues()[0]
      .map(h =>
        normalizarTexto_(h).replace(/\s+/g, " ")
      );

    if (headers.every(h => !h)) {
      throw new Error(
        "A aba Queima precisa ter cabeçalhos na primeira linha."
      );
    }

    const nova = Array(headers.length).fill("");

    const set = (aliases, value) => {
      const ix = headers.findIndex(h => aliases.includes(h));

      if (ix >= 0) {
        nova[ix] = value;
      }
    };

    const indiceLoja = headers.indexOf("lojaorigem");

    if (indiceLoja < 0) {
      throw new Error(
        "Adicione o cabeçalho LojaOrigem na aba Queima."
      );
    }

    set(["codigo de barras", "codigo", "ean"], codigo);
    set(["descricao", "produto"], String(p.descricao || ""));
    set(["lote"], lote);
    set(["validade"], validade);
    set(["quantidade", "qtd"], quantidade);

    set(
      ["mes do lancamento", "mes de lancamento"],
      dataLanc instanceof Date
        ? Utilities.formatDate(
            dataLanc,
            ss.getSpreadsheetTimeZone(),
            "MM/yyyy"
          )
        : String(dataLanc || "")
    );

    set(
      ["aba de origem", "aba origem", "funcionario", "mapa de origem"],
      funcionario
    );

    set(["mes aprovado"], "");
    set(["aprovado"], "N");
    set(["chave unica", "chave unica origem"], chave);

    // Identificação obrigatória da loja.
    nova[indiceLoja] = lojaOrigem;

    // =====================================================
    // EVITA DUPLICIDADE
    // =====================================================

    const indiceChave = headers.findIndex(h =>
      ["chave unica", "chave unica origem"].includes(h)
    );

    if (indiceChave >= 0 && queima.getLastRow() >= 2) {
      const chavesExistentes = queima
        .getRange(
          2,
          indiceChave + 1,
          queima.getLastRow() - 1,
          1
        )
        .getDisplayValues();

      const jaExiste = chavesExistentes.some(row =>
        String(row[0] || "").trim() === chave
      );

      if (jaExiste) {
        throw new Error(
          "Este registro já foi adicionado à Queima."
        );
      }
    }

    queima.appendRow(nova);
    SpreadsheetApp.flush();

    return respostaJsonp_(cb, {
      sucesso: true,
      mensagem: "Item adicionado à aba Queima. O registro original foi mantido.",
      codigo: codigo
    });

  } catch (e) {
    console.error(
      "Erro ao adicionar produto à Queima: " +
      (e.stack || e)
    );

    return respostaJsonp_(cb, {
      sucesso: false,
      mensagem: mensagemErro_(e)
    });

  } finally {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
  }
}



function consultarQueima_(p) {
  const callback = String(p.callback || "");

  if (callback !== "__consultarQueimaCb") {
    return respostaTexto_("Callback inválido.");
  }

  try {
    const sessao = exigirAdministrador_(p);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const aba = ss.getSheetByName("Queima");

    if (!aba || aba.getLastRow() < 2) {
      return respostaJsonp_(callback, {
        sucesso: true,
        pendentes: [],
        aprovados: [],
        relancar: []
      });
    }

    const fuso = ss.getSpreadsheetTimeZone();
    const dados = aba.getDataRange().getValues();
    const exibidos = aba.getDataRange().getDisplayValues();
    const cabecalhos = dados[0].map(h =>
      normalizarTexto_(h).replace(/\s+/g, " ")
    );

    const indice = {
      codigo: cabecalhos.indexOf("codigo de barras"),
      lote: cabecalhos.indexOf("lote"),
      validade: cabecalhos.indexOf("validade"),
      quantidade: cabecalhos.indexOf("quantidade"),
      mes: cabecalhos.indexOf("mes do lancamento"),
      origem: cabecalhos.indexOf("aba de origem"),
      loja: cabecalhos.indexOf("lojaorigem"),
      mesAprovado: cabecalhos.indexOf("mes aprovado"),
      aprovado: cabecalhos.indexOf("aprovado"),
      chave: cabecalhos.indexOf("chave unica")
    };

    const mesAtual = Utilities.formatDate(
      new Date(), fuso, "yyyy-MM"
    );

    const pendentes = [];
    const aprovados = [];
    const relancar = [];

    for (let i = 1; i < dados.length; i++) {
      const linha = dados[i];
      const codigo = String(
        indice.codigo >= 0 ? linha[indice.codigo] : ""
      ).trim();

      if (!codigo) continue;
      const origemRegistro = indice.origem >= 0 ? String(linha[indice.origem] || "").trim() : "";
      const lojaGravada = indice.loja >= 0 ? normalizarLoja_(linha[indice.loja]) : "";
      let lojaEfetiva = lojaGravada;
      // Compatibilidade com registros antigos sem LojaOrigem: recupera pelo funcionário.
      if (!lojaEfetiva && normalizarTexto_(origemRegistro) !== "cadastro manual") {
        const funcionarioOrigem = buscarFuncionarioPorNome_(origemRegistro);
        if (funcionarioOrigem && !funcionarioOrigem.administrador) lojaEfetiva = normalizarLoja_(funcionarioOrigem.loja);
      }
      if (!lojaEfetiva || lojaEfetiva !== sessao.loja) continue;

      const aprovadoTexto = indice.aprovado >= 0
        ? normalizarTexto_(linha[indice.aprovado])
        : "";

      const aprovado = aprovadoTexto === "sim";

      const mesLancamento = indice.mes >= 0
        ? mesChavePainel_(linha[indice.mes], fuso)
        : "";

      const registro = {
        linha: i + 1,
        codigo: codigo,
        lote: indice.lote >= 0 ? exibidos[i][indice.lote] : "",
        validade: indice.validade >= 0 ? exibidos[i][indice.validade] : "",
        quantidade: indice.quantidade >= 0 ? linha[indice.quantidade] : "",
        mesLancamento: indice.mes >= 0 ? exibidos[i][indice.mes] : "",
        abaOrigem: indice.origem >= 0 ? linha[indice.origem] : "",
        mesAprovado: indice.mesAprovado >= 0 ? exibidos[i][indice.mesAprovado] : "",
        aprovado: aprovado,
        chaveUnica: indice.chave >= 0 ? linha[indice.chave] : "",
        podeRelancar: !aprovado && mesLancamento && mesLancamento < mesAtual
      };

      if (aprovado) {
        aprovados.push(registro);
      } else if (registro.podeRelancar) {
        relancar.push(registro);
      } else {
        pendentes.push(registro);
      }
    }

    return respostaJsonp_(callback, {
      sucesso: true,
      pendentes: pendentes,
      aprovados: aprovados,
      relancar: relancar
    });

  } catch (e) {
    return respostaJsonp_(callback, {
      sucesso: false,
      mensagem: mensagemErro_(e)
    });
  }
}


function aprovarQueima_(p) {
  const callback = String(p.callback || "");

  if (callback !== "__aprovarQueimaCb") {
    return respostaTexto_("Callback inválido.");
  }

  try {
    const linha = Number(p.linha);

    if (!Number.isInteger(linha) || linha < 2) {
      throw new Error("Registro inválido.");
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const aba = ss.getSheetByName("Queima");

    if (!aba || linha > aba.getLastRow()) {
      throw new Error("Registro não encontrado.");
    }
    const sessao = exigirAdministrador_(p);
    exigirOrigemQueimaDaLoja_(sessao, aba, linha);

    const cabecalhos = aba.getRange(
      1, 1, 1, aba.getLastColumn()
    ).getDisplayValues()[0].map(h =>
      normalizarTexto_(h).replace(/\s+/g, " ")
    );

    const colAprovado = cabecalhos.indexOf("aprovado") + 1;
    const colMesAprovado = cabecalhos.indexOf("mes aprovado") + 1;

    if (!colAprovado || !colMesAprovado) {
      throw new Error(
        "Não encontrei as colunas Aprovado e Mês Aprovado."
      );
    }

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      throw new Error("Sistema ocupado. Tente novamente.");
    }

    try {
      const atual = normalizarTexto_(
        aba.getRange(linha, colAprovado).getDisplayValue()
      );

      if (atual === "sim") {
        throw new Error("Este registro já está aprovado.");
      }

     const dataAprovacao = new Date();

    aba.getRange(linha, colAprovado).setValue("Sim");
    aba.getRange(linha, colMesAprovado)
    .setValue(dataAprovacao)
    .setNumberFormat("dd/MM/yyyy");
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }

    return respostaJsonp_(callback, {
      sucesso: true,
      mensagem: "Registro aprovado com sucesso."
    });

  } catch (e) {
    return respostaJsonp_(callback, {
      sucesso: false,
      mensagem: mensagemErro_(e)
    });
  }
}


function relancarQueima_(p) {
  const callback = String(p.callback || "");

  if (callback !== "__relancarQueimaCb") {
    return respostaTexto_("Callback inválido.");
  }

  try {
    const linha = Number(p.linha);

    if (!Number.isInteger(linha) || linha < 2) {
      throw new Error("Registro inválido.");
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const aba = ss.getSheetByName("Queima");

    if (!aba || linha > aba.getLastRow()) {
      throw new Error("Registro não encontrado.");
    }
    const sessao = exigirAdministrador_(p);
    exigirOrigemQueimaDaLoja_(sessao, aba, linha);

    const lock = LockService.getScriptLock();

    if (!lock.tryLock(10000)) {
      throw new Error("Sistema ocupado. Tente novamente.");
    }

    try {
      const ultimaColuna = aba.getLastColumn();
      const cabecalhos = aba.getRange(
        1, 1, 1, ultimaColuna
      ).getDisplayValues()[0].map(h =>
        normalizarTexto_(h).replace(/\s+/g, " ")
      );

      const dados = aba.getRange(
        linha, 1, 1, ultimaColuna
      ).getValues()[0];

      const colCodigo = cabecalhos.indexOf("codigo de barras");
      const colMes = cabecalhos.indexOf("mes do lancamento");
      const colAprovado = cabecalhos.indexOf("aprovado");
      const colMesAprovado = cabecalhos.indexOf("mes aprovado");
      const colChave = cabecalhos.indexOf("chave unica");

      if (colCodigo < 0 || colMes < 0 ||
          colAprovado < 0 || colMesAprovado < 0) {
        throw new Error("Os cabeçalhos da aba Queima estão incompletos.");
      }

      if (normalizarTexto_(dados[colAprovado]) === "sim") {
        throw new Error("Um registro aprovado não pode ser relançado.");
      }

      const mesAtual = Utilities.formatDate(
        new Date(), ss.getSpreadsheetTimeZone(), "MM/yyyy"
      );

      // Evita criar duas linhas de relançamento para o mesmo produto,
      // lote e mês de lançamento.
      const codigoAtual = String(dados[colCodigo] || "").trim();
      const colLote = cabecalhos.indexOf("lote");
      const loteAtual = colLote >= 0 ? String(dados[colLote] || "").trim() : "";

      const existentes = aba.getDataRange().getValues();

      for (let i = 1; i < existentes.length; i++) {
        if (i + 1 === linha) continue;

        const r = existentes[i];
        const codigo = String(r[colCodigo] || "").trim();
        const lote = colLote >= 0 ? String(r[colLote] || "").trim() : "";
        const mes = mesChavePainel_(r[colMes], ss.getSpreadsheetTimeZone());

        if (codigo === codigoAtual &&
            lote === loteAtual &&
            mes === mesAtual &&
            normalizarTexto_(r[colAprovado]) !== "sim") {
          throw new Error(
            "Já existe um relançamento pendente deste produto, lote e mês."
          );
        }
      }

      dados[colMes] = mesAtual;
      dados[colAprovado] = "N";
      dados[colMesAprovado] = "";

      if (colChave >= 0) {
        dados[colChave] = Utilities.getUuid();
      }

      aba.appendRow(dados);
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }

    return respostaJsonp_(callback, {
      sucesso: true,
      mensagem: "Produto relançado para o mês atual. O histórico foi preservado."
    });

  } catch (e) {
    return respostaJsonp_(callback, {
      sucesso: false,
      mensagem: mensagemErro_(e)
    });
  }
}





function subirParaVencidos_(p) {
  const callback = String(p.callback || "");

  if (callback !== "__subirVencidosCb") {
    return respostaTexto_("Callback inválido.");
  }

  const bloqueio = LockService.getScriptLock();
  let bloqueioAdquirido = false;

  try {
    const chave = String(p.chaveUnica || "").trim();
    const descricao = String(p.descricao || "").trim().slice(0, 250);

    if (!chave) {
      throw new Error("Chave única não informada.");
    }

    if (!bloqueio.tryLock(15000)) {
      throw new Error("Sistema ocupado. Tente novamente.");
    }
    bloqueioAdquirido = true;

    const registro = localizarLancamento_(chave);

    if (!registro) {
      throw new Error("Lançamento não encontrado. Atualize a página.");
    }
    exigirAcessoRegistro_(p, registro);
    const sessao = obterSessaoObrigatoria_(p);

    const planilha = SpreadsheetApp.openById(SPREADSHEET_ID);
    const transferencia = registro.nomeAba === "Transferencias";

    const intervalo = registro.aba.getRange(
      registro.linha,
      1,
      1,
      transferencia ? 8 : 6
    );

    const linha = intervalo.getValues()[0];
    const exibidos = intervalo.getDisplayValues()[0];

    // Estrutura da origem:
    // Abas normais: A Código, B Lote, C Validade,
    // D Quantidade, E Data/Mês de Registro, F Chave Única.
    //
    // Transferencias possui estrutura própria.
    const codigo = String(exibidos[0] || "").trim();
    const lote = String(exibidos[1] || "").trim();
    const validade = linha[2];
    const quantidade = Number(linha[3]) || 0;
    const dataRegistro = linha[4];

    if (!codigo) {
      throw new Error("O código do produto está vazio.");
    }

    let vencidos = planilha.getSheetByName("Vencidos");

    if (!vencidos) {
      vencidos = planilha.insertSheet("Vencidos");
    }

    // Cabeçalhos esperados na aba Vencidos.
    const cabecalhos = [
      "Aba de origem",
      "Linha original",
      "Código",
      "Descrição",
      "Lote",
      "Validade",
      "Quantidade",
      "Data de Registro / Mês de Lançamento",
      "EAN interno",
      "Chave Única"
    ];

    if (vencidos.getLastRow() === 0) {
      vencidos.getRange(1, 1, 1, 10).setValues([cabecalhos]);
    }
    if (vencidos.getLastColumn() < 11) vencidos.getRange(1, 11).setValue("LojaOrigem");

    // Evita duplicar o mesmo lançamento.
    const ultimaLinha = vencidos.getLastRow();

    if (ultimaLinha >= 2) {
      const chavesExistentes = vencidos
        .getRange(2, 10, ultimaLinha - 1, 1)
        .getDisplayValues()
        .flat()
        .map(valor => String(valor || "").trim());

      if (chavesExistentes.includes(chave)) {
        throw new Error(
          "Este lançamento já está registrado na aba Vencidos."
        );
      }
    }

    // EAN interno: utiliza o valor enviado pela página, se disponível.
    const eanInterno = String(
      p.eanInterno || p.ean || ""
    ).trim();

    // Registra nas posições corretas da estrutura existente.
    const linhaDestino = vencidos.getLastRow() + 1;

    // A coluna Código pode conter EAN com zero inicial.
    vencidos.getRange(linhaDestino, 3).setNumberFormat("@");
    vencidos.getRange(linhaDestino, 9).setNumberFormat("@");
    vencidos.getRange(linhaDestino, 1, 1, 10).setValues([[
      registro.nomeAba,   // A: Aba de origem
      registro.linha,     // B: Linha original
      codigo,             // C: Código
      descricao,          // D: Descrição
      lote,               // E: Lote
      validade,           // F: Validade
      quantidade,         // G: Quantidade
      dataRegistro,       // H: Data de registro / mês
      eanInterno,         // I: EAN interno
      chave               // J: Chave única
    ]]);
    vencidos.getRange(linhaDestino, 11).setValue(sessao.loja);

    vencidos.getRange(linhaDestino, 6)
      .setNumberFormat("dd/MM/yyyy");

    vencidos.getRange(linhaDestino, 7)
      .setNumberFormat("0");

    vencidos.getRange(linhaDestino, 8)
      .setNumberFormat("dd/MM/yyyy HH:mm:ss");

    SpreadsheetApp.flush();

    // Apaga a origem somente após a gravação.
    registro.aba.deleteRow(registro.linha);

    // Remove sinalizações vinculadas à chave, se existirem.
    const sinalizacao = planilha.getSheetByName("Sinalizacao");

    if (sinalizacao && sinalizacao.getLastRow() >= 2) {
      const dadosSinalizacao =
        sinalizacao.getDataRange().getDisplayValues();

      for (let i = dadosSinalizacao.length - 1; i >= 1; i--) {
        if (
          String(dadosSinalizacao[i][0] || "").trim() === chave
        ) {
          sinalizacao.deleteRow(i + 1);
        }
      }
    }

    return respostaJsonp_(callback, {
      sucesso: true,
      mensagem: "Produto movido para Vencidos com os dados organizados."
    });

  } catch (e) {
    return respostaJsonp_(callback, {
      sucesso: false,
      mensagem: mensagemErro_(e)
    });

  } finally {
    if (bloqueioAdquirido) {
      bloqueio.releaseLock();
    }
  }
}





/* =========================================
   DIGITAÇÃO MANUAL DO MAPA DE VALIDADE
   ========================================= */


function adicionarValidadeManual_(parametros) {
  const callback = String(parametros.callback || "");

  if (callback !== "__validadeCb") {
    return respostaTexto_("Callback inválido.");
  }

  try {
    // A coluna A deve receber o EAN.
    // O Código Interno é usado apenas para identificar o produto no formulário.
    const codigo = String(parametros.codigo || "").trim();
    const codigoInterno = String(parametros.codigoInterno || "").trim();

    const descricao = String(parametros.descricao || "").trim();
    const lote = String(parametros.lote || "").trim();
    const validadeTexto = String(parametros.validade || "").trim();
    const quantidadeTexto = String(parametros.quantidade || "").trim();
    const funcionario = String(parametros.funcionario || "").trim();

    if (!codigo || codigo.length > 80) {
      throw new Error("Informe um EAN válido.");
    }

    if (!codigoInterno) {
      throw new Error("Código Interno do produto não informado.");
    }

    if (!obterCadastroFuncionarios_().todos.includes(funcionario)) {
      throw new Error("Funcionário ou aba não reconhecido.");
    }

    exigirDonoDaAba_(parametros, funcionario);

    if (funcionario === "Transferencias") {
      throw new Error(
        "A aba Transferencias exige Loja de Origem e Romaneio. " +
        "Faça esse lançamento pela tela de Transferências."
      );
    }

    if (!lote || lote.length > 100) {
      throw new Error("Informe um lote com até 100 caracteres.");
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(validadeTexto)) {
      throw new Error("A validade deve estar no formato AAAA-MM-DD.");
    }

    const partesData = validadeTexto.split("-").map(Number);

    const dataValidade = new Date(
      partesData[0],
      partesData[1] - 1,
      partesData[2]
    );

    if (
      dataValidade.getFullYear() !== partesData[0] ||
      dataValidade.getMonth() !== partesData[1] - 1 ||
      dataValidade.getDate() !== partesData[2]
    ) {
      throw new Error("A data de validade informada não existe.");
    }

    if (!/^\d+$/.test(quantidadeTexto)) {
      throw new Error("A quantidade deve ser um número inteiro.");
    }

    const quantidade = Number(quantidadeTexto);

    if (!Number.isSafeInteger(quantidade) || quantidade < 1) {
      throw new Error("A quantidade deve ser maior que zero.");
    }

    const planilha = SpreadsheetApp.openById(SPREADSHEET_ID);
    const nomeAba = funcionario;
    const aba = planilha.getSheetByName(nomeAba);

    if (!aba) {
      throw new Error("A aba '" + nomeAba + "' não foi encontrada.");
    }

    const bloqueio = LockService.getScriptLock();

    if (!bloqueio.tryLock(20000)) {
      throw new Error(
        "O sistema está ocupado. Aguarde e tente novamente."
      );
    }

    try {
      const requestId =
        "MANUAL_" + Utilities.getUuid().replace(/-/g, "");

      const dataLancamento = new Date();

      if (obterAbasEspeciais_().includes(nomeAba)) {
        const ultimaLinha = aba.getLastRow();

        if (ultimaLinha >= 2) {
          const dados = aba
            .getRange(2, 1, ultimaLinha - 1, 6)
            .getValues();

          const exibidos = aba
            .getRange(2, 1, ultimaLinha - 1, 2)
            .getDisplayValues();

          for (let i = 0; i < dados.length; i++) {
            const linha = dados[i];

            const codigoExistente = String(
              exibidos[i][0] || ""
            ).trim();

            const loteExistente = String(
              exibidos[i][1] || ""
            ).trim();

            const validadeExistente = linha[2];

            const mesmaValidade =
              validadeExistente instanceof Date &&
              !isNaN(validadeExistente.getTime()) &&
              validadeExistente.getFullYear() === dataValidade.getFullYear() &&
              validadeExistente.getMonth() === dataValidade.getMonth() &&
              validadeExistente.getDate() === dataValidade.getDate();

            const mesmoRegistro =
              codigoExistente === codigo &&
              loteExistente.toLowerCase() === lote.toLowerCase() &&
              mesmaValidade;

            if (!mesmoRegistro) continue;

            const quantidadeExistente = Number(linha[3]);

            if (
              !Number.isSafeInteger(quantidadeExistente) ||
              quantidadeExistente < 0
            ) {
              throw new Error(
                "A quantidade existente na planilha é inválida."
              );
            }

            const novaQuantidade = quantidadeExistente + quantidade;

            if (!Number.isSafeInteger(novaQuantidade)) {
              throw new Error(
                "A soma das quantidades excede o limite permitido."
              );
            }

            aba.getRange(i + 2, 4).setValue(novaQuantidade);

            const chaves = String(linha[5] || "")
              .split("|")
              .filter(Boolean);

            chaves.push(requestId);

            aba.getRange(i + 2, 6).setValue(chaves.join("|"));

            SpreadsheetApp.flush();

            return respostaJsonp_("__validadeCb", {
              sucesso: true,
              mensagem:
                "Quantidade somada ao registro existente na aba " +
                nomeAba + ". Nova quantidade: " + novaQuantidade + ".",
              codigo: codigo,
              codigoInterno: codigoInterno,
              descricao: descricao,
              funcionario: nomeAba
            });
          }
        }
      }

      const novaLinha = Math.max(aba.getLastRow() + 1, 2);

      // A = EAN
      // B = Lote
      // C = Validade
      // D = Quantidade
      // E = Data do lançamento
      // F = Chave única
      // Preserva EANs iniciados em zero na planilha.
    aba.getRange(novaLinha, 1).setNumberFormat("@");
    aba.getRange(novaLinha, 1, 1, 6).setValues([[
        codigo,
        lote,
        dataValidade,
        quantidade,
        dataLancamento,
        requestId
      ]]);

      aba.getRange(novaLinha, 3).setNumberFormat("dd/MM/yyyy");
      aba.getRange(novaLinha, 5).setNumberFormat("dd/MM/yyyy HH:mm:ss");

      SpreadsheetApp.flush();

      return respostaJsonp_("__validadeCb", {
        sucesso: true,
        mensagem:
          "Lançamento manual salvo com sucesso na aba " + nomeAba + ".",
        codigo: codigo,
        codigoInterno: codigoInterno,
        descricao: descricao,
        funcionario: nomeAba
      });

    } finally {
      bloqueio.releaseLock();
    }

  } catch (erro) {
    console.error(
      "Erro no lançamento manual: " + (erro.stack || erro)
    );

    return respostaJsonp_("__validadeCb", {
      sucesso: false,
      mensagem: mensagemErro_(erro)
    });
  }
}


/* =========================================
   CADASTRO DIRETO NO produtos_ean.json
   ========================================= */

/**
 * Cadastra um produto no produtos_ean.json do GitHub.
 *
 * Propriedades do script necessárias:
 * GITHUB_TOKEN
 * GITHUB_OWNER
 * GITHUB_REPO
 * GITHUB_BRANCH
 * GITHUB_JSON_PATH
 */
function adicionarProdutoJson_(p) {
  const callback = String(p.callback || "");

  if (callback !== "__adicionarProdutoJsonCb") {
    return respostaTexto_("Callback inválido.");
  }

  const lock = LockService.getScriptLock();

  try {
    const modo = String(p.modo || "adicionar").trim();
    const codigoInterno = String(p.codigoInterno || "").trim();
    const ean = String(p.ean || "").trim();
    const produto = String(p.produto || "").trim();
    const secao = String(p.secao || "").trim();

    if (!["adicionar", "editar"].includes(modo)) {
      throw new Error("Operação inválida.");
    }

    if (!codigoInterno || !ean || !produto || !secao) {
      throw new Error(
        "Preencha Código Interno, EAN, Descrição e Seção."
      );
    }

    if (!/^\d{8,14}$/.test(ean)) {
      throw new Error("O EAN deve conter de 8 a 14 dígitos.");
    }

    if (
      codigoInterno.length > 80 ||
      produto.length > 250 ||
      secao.length > 120
    ) {
      throw new Error("Um dos campos ultrapassa o tamanho permitido.");
    }

    if (!lock.tryLock(15000)) {
      throw new Error("Sistema ocupado. Tente novamente.");
    }

    const props = PropertiesService.getScriptProperties();
    const token = props.getProperty("GITHUB_TOKEN");
    const owner = props.getProperty("GITHUB_OWNER");
    const repo = props.getProperty("GITHUB_REPO");
    const branch = props.getProperty("GITHUB_BRANCH") || "main";
    const caminho =
      props.getProperty("GITHUB_JSON_PATH") || "produtos_ean.json";

    if (!token || !owner || !repo) {
      throw new Error(
        "Configure GITHUB_TOKEN, GITHUB_OWNER e GITHUB_REPO."
      );
    }

    const url =
      "https://api.github.com/repos/" +
      encodeURIComponent(owner) + "/" +
      encodeURIComponent(repo) +
      "/contents/" +
      caminho.split("/").map(encodeURIComponent).join("/");

    const opcoesGet = {
      method: "get",
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      muteHttpExceptions: true
    };

    const respostaGet = UrlFetchApp.fetch(
      url + "?ref=" + encodeURIComponent(branch),
      opcoesGet
    );

    if (respostaGet.getResponseCode() !== 200) {
      throw new Error(
        "Falha ao consultar o JSON no GitHub (HTTP " +
        respostaGet.getResponseCode() +
        "). Confira o repositório, a branch e o token."
      );
    }

    const arquivo = JSON.parse(respostaGet.getContentText());

    if (!arquivo.sha) {
      throw new Error("O GitHub não retornou o SHA do arquivo.");
    }

    let textoJson = "";

    // Suporta arquivos cujo conteúdo não veio em Base64.
    if (arquivo.content && arquivo.encoding === "base64") {
      textoJson = Utilities.newBlob(
        Utilities.base64Decode(
          String(arquivo.content).replace(/\s/g, "")
        )
      ).getDataAsString("UTF-8");
    } else if (arquivo.download_url) {
      const respostaRaw = UrlFetchApp.fetch(arquivo.download_url, {
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/vnd.github.raw+json"
        },
        muteHttpExceptions: true
      });

      if (respostaRaw.getResponseCode() !== 200) {
        throw new Error("Não foi possível baixar o JSON atual do GitHub.");
      }

      textoJson = respostaRaw.getContentText("UTF-8");
    } else {
      throw new Error("O GitHub não retornou o conteúdo do JSON.");
    }

    let catalogo;

    try {
      catalogo = JSON.parse(textoJson);
    } catch (e) {
      throw new Error("O produtos_ean.json contém JSON inválido.");
    }

    if (
      !catalogo ||
      typeof catalogo !== "object" ||
      Array.isArray(catalogo)
    ) {
      throw new Error("A estrutura do JSON precisa ser um objeto.");
    }

    const existe = Object.prototype.hasOwnProperty.call(catalogo, ean);

    if (modo === "adicionar" && existe) {
      return respostaJsonp_(callback, {
        sucesso: false,
        duplicado: true,
        mensagem: "Este EAN já está cadastrado. Escolha Editar para corrigir os dados.",
        produto: {
          ean: ean,
          codigoInterno: catalogo[ean].codigoInterno || "",
          produto:
            typeof catalogo[ean] === "string"
              ? catalogo[ean]
              : catalogo[ean].produto || "",
          secao:
            typeof catalogo[ean] === "object"
              ? catalogo[ean].secao || ""
              : ""
        }
      });
    }

    if (modo === "editar" && !existe) {
      throw new Error(
        "Este EAN não existe no catálogo. Atualize a lista e tente novamente."
      );
    }

    catalogo[ean] = {
      codigoInterno: codigoInterno,
      produto: produto,
      secao: secao
    };

    const novoJson = JSON.stringify(catalogo, null, 2) + "\n";

    const conteudoBase64 = Utilities.base64Encode(
      Utilities.newBlob(novoJson, "application/json").getBytes()
    );

    const respostaPut = UrlFetchApp.fetch(url, {
      method: "put",
      contentType: "application/json",
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      payload: JSON.stringify({
        message:
          (modo === "editar" ? "Editar produto " : "Adicionar produto ") +
          ean,
        content: conteudoBase64,
        sha: arquivo.sha,
        branch: branch
      }),
      muteHttpExceptions: true
    });

    const statusPut = respostaPut.getResponseCode();

    if (statusPut !== 200 && statusPut !== 201) {
      console.error(respostaPut.getContentText());
      throw new Error(
        "O GitHub não conseguiu salvar as alterações (HTTP " +
        statusPut + "). Confira as permissões do token."
      );
    }

    return respostaJsonp_(callback, {
      sucesso: true,
      modo: modo,
      mensagem:
        modo === "editar"
          ? "Produto atualizado com sucesso no GitHub."
          : "Produto cadastrado com sucesso no GitHub.",
      produto: {
        codigoInterno: codigoInterno,
        ean: ean,
        produto: produto,
        secao: secao
      }
    });

  } catch (erro) {
    console.error(
      "Erro ao salvar produto no JSON: " + (erro.stack || erro)
    );

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
 * Extrai uma mensagem útil da resposta da API do GitHub.
 */
function extrairErroGitHub_(texto) {
  try {
    const dados = JSON.parse(texto);

    return String(
      dados.message || texto || "Erro sem detalhes."
    ).slice(0, 500);

  } catch (_) {
    return String(texto || "Erro sem detalhes.").slice(0, 500);
  }
}


/**
 * Envia um arquivo ODS para o GitHub.
 * Usa as propriedades configuradas em:
 * Configurações do projeto > Propriedades do script.
 */

/**
 * Upload do arquivo ODS para o GitHub.
 * Função separada para não interferir no doPost dos lançamentos.
 */
function salvarEstoqueOdsNoGitHub_(dados) {
  const props = PropertiesService.getScriptProperties();

  const token = props.getProperty("GITHUB_TOKEN");
  const owner = props.getProperty("GITHUB_OWNER");
  const repo = props.getProperty("GITHUB_REPO");
  const branch = props.getProperty("GITHUB_BRANCH") || "main";

  if (!token || !owner || !repo) {
    throw new Error("As propriedades do GitHub não estão completas.");
  }

  if (
    !dados ||
    typeof dados.conteudoBase64 !== "string" ||
    !dados.conteudoBase64
  ) {
    throw new Error("Conteúdo do arquivo não recebido.");
  }

  if (
    typeof dados.nomeArquivo !== "string" ||
    !/\.ods$/i.test(dados.nomeArquivo)
  ) {
    throw new Error("Envie um arquivo com extensão .ods.");
  }

  const numeroLoja = String(dados.loja || "").replace(/\D/g, "");
  if (!numeroLoja) {
    throw new Error("Não foi possível identificar a loja da sessão.");
  }

  // Cada loja mantém seu próprio arquivo de estoque no repositório.
  const caminho = "estoque/estoque_" + numeroLoja + ".ods";

  const url =
    "https://api.github.com/repos/" +
    encodeURIComponent(owner) + "/" +
    encodeURIComponent(repo) +
    "/contents/" +
    caminho.split("/").map(encodeURIComponent).join("/");

  const headers = {
    Authorization: "Bearer " + token,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };

  const consulta = UrlFetchApp.fetch(
    url + "?ref=" + encodeURIComponent(branch),
    {
      method: "get",
      headers: headers,
      muteHttpExceptions: true
    }
  );

  const codigoConsulta = consulta.getResponseCode();
  let sha = "";

  if (codigoConsulta === 200) {
    sha = JSON.parse(consulta.getContentText()).sha;
  } else if (codigoConsulta !== 404) {
    throw new Error(
      "Erro ao consultar o arquivo no GitHub: " +
      consulta.getContentText()
    );
  }

  const payload = {
    message: "Atualiza estoque ODS da loja " + numeroLoja + " pelo Painel do Conferente",
    content: dados.conteudoBase64,
    branch: branch
  };

  if (sha) payload.sha = sha;

  const resposta = UrlFetchApp.fetch(url, {
    method: "put",
    headers: headers,
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const codigo = resposta.getResponseCode();

  if (codigo !== 200 && codigo !== 201) {
    throw new Error(
      "Erro ao enviar o ODS ao GitHub: " +
      resposta.getContentText()
    );
  }

  const resultado = JSON.parse(resposta.getContentText());

  return {
    sucesso: true,
    mensagem: "Arquivo enviado ao GitHub.",
    caminho: caminho,
    url: resultado.content.html_url
  };
}


/* =========================================
   MIGRAÇÃO INICIAL: GOOGLE SHEETS → SUPABASE
   ========================================= */

/**
 * Execute manualmente pelo editor do Apps Script.
 *
 * Propriedades do script necessárias:
 * SUPABASE_URL
 * SUPABASE_SERVICE_ROLE_KEY
 *
 * Importa os funcionários e os registros das abas
 * listadas em FUNCIONARIOS para:
 *   - funcionarios
 *   - importacao_planilha
 *
 * Não modifica nem exclui dados da planilha.
 */
function importarDadosParaSupabase() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    throw new Error(
      "Já existe uma execução em andamento. Tente novamente."
    );
  }

  try {
    const configuracao = obterConfiguracaoSupabase_();

    const planilha = SpreadsheetApp.openById(SPREADSHEET_ID);

        // 1. Cadastra/sincroniza os funcionários.
    const cadastro = obterCadastroFuncionarios_();
    const funcionarios = cadastro.todos.map(function (nome) {
      return {
        nome: nome,
        aba_planilha: nome,
        ativo: true
      };
    });

    enviarLoteSupabase_(
      configuracao,
      "funcionarios",
      funcionarios,
      "nome",
      "merge-duplicates"
    );

    // 2. Prepara os registros de cada aba.
    const nomesAbas = obterNomesAbasCadastro_();

    let totalLinhasPreparadas = 0;
    let totalAbas = 0;
    const erros = [];

    nomesAbas.forEach(function(nomeAba) {
      try {
        const aba = planilha.getSheetByName(nomeAba);

        if (!aba) {
          throw new Error(
            "A aba '" + nomeAba + "' não existe na planilha."
          );
        }

        const ultimaLinha = aba.getLastRow();
        const ultimaColuna = aba.getLastColumn();

        if (ultimaLinha < 2 || ultimaColuna < 1) {
          console.log(
            "Aba sem registros para importar: " + nomeAba
          );
          totalAbas++;
          return;
        }

        // Cabeçalhos da primeira linha.
        const cabecalhosOriginais = aba
          .getRange(1, 1, 1, ultimaColuna)
          .getDisplayValues()[0];

        const cabecalhos = cabecalhosOriginais.map(
          function(valor, indice) {
            return String(valor || "").trim() ||
              ("Coluna " + (indice + 1));
          }
        );

        const intervalo = aba.getRange(
          2,
          1,
          ultimaLinha - 1,
          ultimaColuna
        );

        // Valores formatados: preservam, por exemplo, zeros
        // à esquerda dos códigos exibidos na planilha.
        const valoresExibidos = intervalo.getDisplayValues();

        // Valores originais: preservam números e datas.
        const valoresOriginais = intervalo.getValues();

        const registros = [];

        for (let i = 0; i < valoresOriginais.length; i++) {
          const valores = valoresOriginais[i];
          const exibidos = valoresExibidos[i];

          const linhaVazia = exibidos.every(function(valor) {
            return String(valor || "").trim() === "";
          });

          if (linhaVazia) continue;

          const valoresBrutos = valores.map(
            converterValorSupabase_
          );

          registros.push({
            planilha_origem: SPREADSHEET_ID,
            aba_origem: nomeAba,
            linha_origem: i + 2,
            dados: {
              cabecalhos: cabecalhos,
              valores: exibidos,
              valoresBrutos: valoresBrutos
            },
            importado_em: new Date().toISOString()
          });
        }

        // 3. Envia os registros em lotes.
        for (let inicio = 0; inicio < registros.length; inicio += 100) {
          const lote = registros.slice(inicio, inicio + 100);

          enviarLoteSupabase_(
            configuracao,
            "importacao_planilha",
            lote,
            "planilha_origem,aba_origem,linha_origem",
            "ignore-duplicates"
          );

          totalLinhasPreparadas += lote.length;
        }

        totalAbas++;

        console.log(
          "Aba processada: " + nomeAba +
          " | Registros encontrados: " + registros.length
        );

      } catch (erroAba) {
        erros.push(nomeAba + ": " + erroAba.message);

        console.error(
          "Erro na aba " + nomeAba + ": " +
          (erroAba.stack || erroAba)
        );
      }
    });

    const resultado = {
      sucesso: erros.length === 0,
      abasProcessadas: totalAbas,
      registrosEncontrados: totalLinhasPreparadas,
      erros: erros
    };

    console.log(JSON.stringify(resultado, null, 2));

    if (erros.length > 0) {
      throw new Error(
        "A importação terminou com " + erros.length +
        " erro(s). Consulte o registro de execução. " +
        erros.join(" | ")
      );
    }

    return resultado;

  } finally {
    lock.releaseLock();
  }
}


/**
 * Lê as credenciais do Supabase nas propriedades do projeto.
 */
function obterConfiguracaoSupabase_() {
  const props = PropertiesService.getScriptProperties();

  const url = String(
    props.getProperty("SUPABASE_URL") || ""
  ).trim().replace(/\/+$/, "");

  const chave = String(
    props.getProperty("SUPABASE_SERVICE_ROLE_KEY") || ""
  ).trim();

  if (!url || !chave) {
    throw new Error(
      "Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY " +
      "nas Propriedades do script."
    );
  }

  if (!/^https:\/\/[^/]+$/.test(url)) {
    throw new Error(
      "SUPABASE_URL inválida. Informe a URL HTTPS do projeto."
    );
  }

  return {
    url: url,
    chave: chave
  };
}


/**
 * Envia dados para a API REST do Supabase.
 */
function enviarLoteSupabase_(
  configuracao,
  tabela,
  registros,
  conflito,
  resolucao
) {
  if (!registros || registros.length === 0) return;

  const url =
    configuracao.url +
    "/rest/v1/" + encodeURIComponent(tabela) +
    "?on_conflict=" +
    conflito.split(",").map(encodeURIComponent).join(",");

  const resposta = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: {
      apikey: configuracao.chave,
      Authorization: "Bearer " + configuracao.chave,
      Prefer:
        "resolution=" + resolucao + ",return=minimal"
    },
    payload: JSON.stringify(registros),
    muteHttpExceptions: true
  });

  const status = resposta.getResponseCode();

  if (status < 200 || status >= 300) {
    const detalhe = extrairErroSupabase_(
      resposta.getContentText()
    );

    throw new Error(
      "Erro no Supabase ao gravar na tabela '" +
      tabela + "' (HTTP " + status + "): " + detalhe
    );
  }
}


/**
 * Converte valores do Sheets para valores serializáveis em JSON.
 */
function converterValorSupabase_(valor) {
  if (valor instanceof Date) {
    return isNaN(valor.getTime())
      ? null
      : valor.toISOString();
  }

  if (valor === null || valor === undefined) {
    return null;
  }

  if (
    typeof valor === "string" ||
    typeof valor === "number" ||
    typeof valor === "boolean"
  ) {
    return valor;
  }

  return String(valor);
}


/**
 * Extrai a mensagem de erro da API REST.
 */
function extrairErroSupabase_(texto) {
  try {
    const dados = JSON.parse(texto);

    return String(
      dados.message ||
      dados.details ||
      dados.hint ||
      dados.error ||
      texto ||
      "Erro sem detalhes."
    ).slice(0, 1000);

  } catch (erro) {
    return String(texto || "Erro sem detalhes.").slice(0, 1000);
  }
}

function testarAutenticacaoSupabase() {
  const config = obterConfiguracaoSupabase_();

  const resposta = UrlFetchApp.fetch(
    config.url + "/auth/v1/user",
    {
      method: "get",
      headers: {
        apikey: config.chave,
        Authorization: "Bearer " + config.chave
      },
      muteHttpExceptions: true
    }
  );

  console.log("HTTP: " + resposta.getResponseCode());
  console.log(
    "Resposta: " +
    resposta.getContentText().slice(0, 1000)
  );
}

function testarAcessoRestSupabase() {
  const config = obterConfiguracaoSupabase_();

  const resposta = UrlFetchApp.fetch(
    config.url + "/rest/v1/funcionarios?select=nome&limit=1",
    {
      method: "get",
      headers: {
        apikey: config.chave,
        Authorization: "Bearer " + config.chave
      },
      muteHttpExceptions: true
    }
  );

  console.log("HTTP: " + resposta.getResponseCode());
  console.log(
    "Resposta: " + resposta.getContentText().slice(0, 1000)
  );
}

function diagnosticarChaveSupabase() {
  const config = obterConfiguracaoSupabase_();
  const chave = config.chave;

  let tipo = "Formato desconhecido";

  if (chave.startsWith("sb_secret_")) {
    tipo = "Chave secreta atual (sb_secret_)";
  } else if (chave.startsWith("eyJ")) {
    tipo = "Possível chave JWT legada";
  }

  console.log("URL configurada: " + config.url);
  console.log("Tipo aparente da chave: " + tipo);
  console.log("Comprimento da chave: " + chave.length);

  const resposta = UrlFetchApp.fetch(
    config.url + "/rest/v1/funcionarios?select=nome&limit=1",
    {
      method: "get",
      headers: {
        apikey: chave,
        Authorization: "Bearer " + chave
      },
      muteHttpExceptions: true
    }
  );

  console.log("HTTP REST: " + resposta.getResponseCode());
  console.log("Resposta: " + resposta.getContentText().slice(0, 500));
}


/************************************************************
 * CATÁLOGO DE PRODUTOS — SUPABASE
 * Google Apps Script
 *
 * Migração retomável do produtos-ean.json do GitHub.
 * Consulta individual pelo EAN.
 *
 * Propriedades do script:
 * SUPABASE_URL
 * SUPABASE_SERVICE_ROLE_KEY
 * PRODUTOS_JSON_URL
 ************************************************************/

const PRODUTOS_CONFIG = {
  TAMANHO_LOTE: 500,

  // Interrompe antes do limite normal de execução.
  TEMPO_MAXIMO_MS: 240000,

  PROP_CURSOR: "EAN_MIGRACAO_CURSOR",
  PROP_STATUS: "EAN_MIGRACAO_STATUS",
  PROP_TOTAL: "EAN_MIGRACAO_TOTAL",
  PROP_ENVIADOS: "EAN_MIGRACAO_ENVIADOS",

  FUNCAO_CONTINUACAO: "continuarMigracaoProdutosEAN"
};


/**
 * Inicia uma migração nova do início.
 *
 * Não apaga produtos existentes no Supabase.
 * EANs existentes serão atualizados.
 */
function iniciarMigracaoProdutosEAN() {
  const props = PropertiesService.getScriptProperties();

  validarConfiguracaoProdutos_();
  removerGatilhosMigracaoEAN_();

  props.setProperties({
    EAN_MIGRACAO_CURSOR: "0",
    EAN_MIGRACAO_STATUS: "EM_ANDAMENTO",
    EAN_MIGRACAO_TOTAL: "0",
    EAN_MIGRACAO_ENVIADOS: "0"
  });

  console.log("Migração iniciada do início.");

  continuarMigracaoProdutosEAN();
}


/**
 * Processa lotes e agenda a próxima execução.
 *
 * Se houver falha em um lote, o cursor não avança
 * para esse lote. Execute novamente para tentar de novo.
 */
function continuarMigracaoProdutosEAN() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(1000)) {
    console.log("Já existe uma execução em andamento.");
    return;
  }

  const inicio = Date.now();
  const props = PropertiesService.getScriptProperties();

  try {
    validarConfiguracaoProdutos_();

    const status = props.getProperty(
      PRODUTOS_CONFIG.PROP_STATUS
    );

    if (status !== "EM_ANDAMENTO") {
      console.log(
        "Migração não iniciada ou já finalizada. Status: " +
        (status || "NÃO INICIADA")
      );
      return;
    }

    /*
     * O JSON é baixado novamente em cada execução.
     * O progresso salvo é apenas um índice numérico,
     * evitando guardar milhares de produtos nas propriedades.
     */
    const catalogo = baixarCatalogoProdutos_();
    const chaves = Object.keys(catalogo);

    if (chaves.length === 0) {
      throw new Error("O JSON não contém produtos.");
    }

    let cursor = Number(
      props.getProperty(PRODUTOS_CONFIG.PROP_CURSOR) || 0
    );

    if (
      !Number.isInteger(cursor) ||
      cursor < 0 ||
      cursor > chaves.length
    ) {
      throw new Error(
        "Cursor inválido. Use iniciarMigracaoProdutosEAN() " +
        "para iniciar novamente."
      );
    }

    props.setProperty(
      PRODUTOS_CONFIG.PROP_TOTAL,
      String(chaves.length)
    );

    while (
      cursor < chaves.length &&
      Date.now() - inicio < PRODUTOS_CONFIG.TEMPO_MAXIMO_MS
    ) {
      const fim = Math.min(
        cursor + PRODUTOS_CONFIG.TAMANHO_LOTE,
        chaves.length
      );

      const lote = [];

      for (let i = cursor; i < fim; i++) {
        const ean = String(chaves[i]).trim();
        const original = catalogo[chaves[i]];

        if (!ean || !original) {
          continue;
        }

        // Compatível com o formato atual:
        // { "EAN": { "produto": "...", "secao": "" } }
        // Também aceita valores antigos em formato string.
        const item = typeof original === "string"
          ? { produto: original }
          : original;

        if (
          typeof item !== "object" ||
          Array.isArray(item)
        ) {
          continue;
        }

        const descricao = String(item.produto || "").trim();

        // A coluna produto é NOT NULL.
        if (!descricao) {
          console.log("Registro ignorado sem descrição: " + ean);
          continue;
        }

        const codigoInterno =
          item.codigoInterno ??
          item.codigo_interno ??
          null;

        lote.push({
          ean: ean,
          codigo_interno: codigoInterno == null
            ? null
            : String(codigoInterno),
          produto: descricao,
          secao: String(item.secao || "").trim() || null,
          atualizado_em: new Date().toISOString()
        });
      }

      /*
       * Só avançamos o cursor depois que o lote foi
       * processado com sucesso.
       */
      if (lote.length > 0) {
        enviarLoteProdutosSupabase_(lote);
      }

      cursor = fim;

      props.setProperty(
        PRODUTOS_CONFIG.PROP_CURSOR,
        String(cursor)
      );

      const enviados = Number(
        props.getProperty(PRODUTOS_CONFIG.PROP_ENVIADOS) || 0
      ) + lote.length;

      props.setProperty(
        PRODUTOS_CONFIG.PROP_ENVIADOS,
        String(enviados)
      );

      console.log(
        "Progresso: " + cursor + "/" + chaves.length +
        " chaves percorridas; " + enviados +
        " registros enviados/atualizados."
      );
    }

    if (cursor >= chaves.length) {
      props.setProperty(
        PRODUTOS_CONFIG.PROP_STATUS,
        "CONCLUIDA"
      );

      removerGatilhosMigracaoEAN_();

      console.log("Migração concluída.");
      console.log("Total de chaves no JSON: " + chaves.length);
      console.log(
        "Registros enviados/atualizados: " +
        (props.getProperty(PRODUTOS_CONFIG.PROP_ENVIADOS) || "0")
      );
    } else {
      agendarContinuacaoMigracaoEAN_();
      console.log("Continuação automática agendada.");
    }

  } catch (erro) {
    /*
     * O cursor permanece no último lote confirmado.
     * A execução seguinte poderá tentar novamente.
     */
    console.error("Erro na migração: " + erro.message);
    throw erro;

  } finally {
    lock.releaseLock();
  }
}


/**
 * Consulta um produto individual pelo EAN.
 *
 * Retorna um objeto:
 * { encontrado, ean, produto, codigoInterno, secao }
 *
 * Pode ser chamado do HTML usando google.script.run.
 */
function consultarProdutoPorEAN(eanInformado) {
  const ean = String(eanInformado || "").trim();

  if (!ean) {
    return {
      encontrado: false,
      mensagem: "Informe um EAN."
    };
  }

  const config = obterConfiguracaoProdutos_();

  const url = config.url +
    "/rest/v1/produtos" +
    "?select=ean,codigo_interno,produto,secao" +
    "&ean=eq." + encodeURIComponent(ean) +
    "&limit=1";

  const resposta = UrlFetchApp.fetch(url, {
    method: "get",
    headers: {
      apikey: config.chave,
      Authorization: "Bearer " + config.chave
    },
    muteHttpExceptions: true
  });

  const status = resposta.getResponseCode();

  if (status < 200 || status >= 300) {
    throw new Error(
      "Erro ao consultar produto no Supabase. HTTP " +
      status + ": " +
      resposta.getContentText().slice(0, 1000)
    );
  }

  const dados = JSON.parse(resposta.getContentText());

  if (!Array.isArray(dados) || dados.length === 0) {
    return {
      encontrado: false,
      ean: ean,
      mensagem: "EAN não encontrado."
    };
  }

  const item = dados[0];

  return {
    encontrado: true,
    ean: item.ean,
    produto: item.produto,
    codigoInterno: item.codigo_interno || "",
    secao: item.secao || ""
  };
}


/**
 * Mostra o estado da migração no registro de execução.
 */
function verProgressoMigracaoProdutosEAN() {
  const props = PropertiesService.getScriptProperties();

  const resultado = {
    status: props.getProperty(
      PRODUTOS_CONFIG.PROP_STATUS
    ) || "NÃO INICIADA",

    cursor: Number(
      props.getProperty(PRODUTOS_CONFIG.PROP_CURSOR) || 0
    ),

    totalChaves: Number(
      props.getProperty(PRODUTOS_CONFIG.PROP_TOTAL) || 0
    ),

    enviados: Number(
      props.getProperty(PRODUTOS_CONFIG.PROP_ENVIADOS) || 0
    )
  };

  console.log(JSON.stringify(resultado, null, 2));
  return resultado;
}


/**
 * Limpa o estado para começar do zero.
 *
 * Não apaga a tabela nem os produtos do Supabase.
 */
function reiniciarEstadoMigracaoProdutosEAN() {
  removerGatilhosMigracaoEAN_();

  PropertiesService.getScriptProperties().setProperties({
    EAN_MIGRACAO_CURSOR: "0",
    EAN_MIGRACAO_STATUS: "NAO_INICIADA",
    EAN_MIGRACAO_TOTAL: "0",
    EAN_MIGRACAO_ENVIADOS: "0"
  });

  console.log(
    "Estado reiniciado. A tabela do Supabase não foi apagada."
  );
}


/* ================= FUNÇÕES AUXILIARES ================= */


/**
 * Lê as propriedades privadas do projeto.
 */
function obterConfiguracaoProdutos_() {
  const props = PropertiesService.getScriptProperties();

  const url = (
    props.getProperty("SUPABASE_URL") || ""
  ).replace(/\/+$/, "");

  const chave =
    props.getProperty("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!url || !chave) {
    throw new Error(
      "Configure SUPABASE_URL e " +
      "SUPABASE_SERVICE_ROLE_KEY nas propriedades do script."
    );
  }

  return { url: url, chave: chave };
}


function validarConfiguracaoProdutos_() {
  const config = obterConfiguracaoProdutos_();

  const jsonUrl =
    PropertiesService.getScriptProperties()
      .getProperty("PRODUTOS_JSON_URL");

  if (!jsonUrl) {
    throw new Error(
      "Configure a propriedade PRODUTOS_JSON_URL."
    );
  }

  if (!/^https:\/\//i.test(jsonUrl)) {
    throw new Error("A URL do JSON deve usar HTTPS.");
  }

  return config;
}


/**
 * Baixa e interpreta o JSON público.
 */
function baixarCatalogoProdutos_() {
  const url = PropertiesService.getScriptProperties()
    .getProperty("PRODUTOS_JSON_URL");

  const resposta = UrlFetchApp.fetch(url, {
    method: "get",
    followRedirects: true,
    muteHttpExceptions: true
  });

  if (resposta.getResponseCode() !== 200) {
    throw new Error(
      "Falha ao baixar o JSON do GitHub. HTTP " +
      resposta.getResponseCode() + ": " +
      resposta.getContentText().slice(0, 500)
    );
  }

  const dados = JSON.parse(resposta.getContentText());

  if (
    !dados ||
    typeof dados !== "object" ||
    Array.isArray(dados)
  ) {
    throw new Error(
      "Formato inválido. Esperado um objeto indexado pelo EAN."
    );
  }

  return dados;
}


/**
 * Envia um lote com UPSERT por EAN.
 */
function enviarLoteProdutosSupabase_(lote) {
  const config = obterConfiguracaoProdutos_();

  const url = config.url +
    "/rest/v1/produtos?on_conflict=ean";

  const resposta = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: {
      apikey: config.chave,
      Authorization: "Bearer " + config.chave,
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    payload: JSON.stringify(lote),
    muteHttpExceptions: true
  });

  const status = resposta.getResponseCode();

  if (status < 200 || status >= 300) {
    throw new Error(
      "Falha no UPSERT do Supabase. HTTP " + status +
      ": " + resposta.getContentText().slice(0, 1500)
    );
  }
}


/**
 * Agenda a continuação em aproximadamente um minuto.
 */
function agendarContinuacaoMigracaoEAN_() {
  removerGatilhosMigracaoEAN_();

  ScriptApp.newTrigger(
    PRODUTOS_CONFIG.FUNCAO_CONTINUACAO
  )
    .timeBased()
    .after(60 * 1000)
    .create();
}


/**
 * Evita criar vários gatilhos para a mesma migração.
 */
function removerGatilhosMigracaoEAN_() {
  ScriptApp.getProjectTriggers().forEach(function(gatilho) {
    if (
      gatilho.getHandlerFunction() ===
      PRODUTOS_CONFIG.FUNCAO_CONTINUACAO
    ) {
      ScriptApp.deleteTrigger(gatilho);
    }
  });
}

/* ============================ BLOCO PARA COLAR ============================ */

// Tempo de vida (em segundos) do cache de cada consulta.
const CACHE_SEGUNDOS_ = {
  dashboardPainel: 900,
  validades: 900,
  vencidosPainel: 900,
  consultarQueima: 900,
  consultarSinalizados: 900,
  historicoMes: 900
};

// Ações que alteram dados: depois delas o cache é apagado.
const ACOES_QUE_ALTERAM_ = [
  "editarLancamento", "excluirLancamento", "retirarDeLoja",
  "adicionarDanificado", "adicionarAoQueima", "aprovarQueima",
  "relancarQueima", "sinalizarLancamento", "atualizarSinalizado",
  "subirVencidos", "subirParaVencidos", "definirPermissaoFuncionario",
  "adicionarValidadeManual", "adicionarProdutoJson", "adicionarFuncionario", "renomearFuncionario",
  "definirEspecialFuncionario", "marcarCheckFuncionario", "definirPinFuncionario",
  "criarAdminLoja", "inativarFuncionario", "cadastrarQueimaManual", "encaminharEstoqueMapa"
];

function doGet(e) {
  const p = (e && e.parameter) || {};
  const acao = String(p.action || "");
  const bloqueio = bloquearSeNaoAutorizado_(p);
    if (bloqueio) return bloqueio;
  const segundos = CACHE_SEGUNDOS_[acao];

  if (segundos) {
    const chave = chaveCache_(acao, p);

    // nocache=1 (botão Atualizar) pula a leitura do cache, mas grava o resultado novo.
    if (String(p.nocache || "") !== "1") {
      const salvo = lerCacheTexto_(chave);

      if (salvo !== null) {
        return ContentService
          .createTextOutput(salvo)
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
    }

    const resposta = doGetOriginal_(e);
    registrarAuditoriaAdministrador_(acao, p, resposta);

    try {
      gravarCacheTexto_(chave, resposta.getContent(), segundos);
    } catch (_) { /* se não couber no cache, segue sem guardar */ }

    return resposta;
  }

  const resposta = doGetOriginal_(e);
  registrarAuditoriaAdministrador_(acao, p, resposta);

  if (ACOES_QUE_ALTERAM_.indexOf(acao) >= 0) {
    invalidarCacheDados_();
  }

  return resposta;
}

// Histórico persistente das ações realizadas por administradores.
const ACOES_AUDITORIA_ADMIN_ = {
  editarLancamento: "Edição de lançamento", excluirLancamento: "Exclusão de lançamento",
  retirarDeLoja: "Retirada de produto", adicionarDanificado: "Cadastro de danificado",
  adicionarAoQueima: "Envio para Queima", aprovarQueima: "Aprovação na Queima",
  relancarQueima: "Relançamento na Queima", sinalizarLancamento: "Sinalização de produto",
  atualizarSinalizado: "Atualização de sinalização", subirParaVencidos: "Envio para Vencidos",
  subirVencidos: "Envio para Vencidos", definirPermissaoFuncionario: "Alteração de permissão",
  adicionarValidadeManual: "Cadastro manual de validade", adicionarProdutoJson: "Cadastro de produto no catálogo",
  adicionarFuncionario: "Cadastro de funcionário", renomearFuncionario: "Renomeação de funcionário",
  definirEspecialFuncionario: "Alteração de aba especial", marcarCheckFuncionario: "Alteração de conferência",
  definirPinFuncionario: "Definição de PIN", criarAdminLoja: "Criação de administrador de loja",
  inativarFuncionario: "Alteração de status de funcionário", cadastrarQueimaManual: "Cadastro manual na Queima",
  encaminharEstoqueMapa: "Encaminhamento de vencido do Estoque", registrarEstoqueVencido: "Cadastro de vencido no Estoque"
};

function registrarAuditoriaAdministrador_(acao, parametros, resposta) {
  const tipo = ACOES_AUDITORIA_ADMIN_[acao];
  if (!tipo || !parametros || !parametros.sessao || !resposta) return;
  try {
    const conteudo = resposta.getContent();
    const match = String(conteudo || "").match(/^[^(]+\(([\s\S]*)\);?$/);
    if (!match) return;
    const dados = JSON.parse(match[1]);
    if (!dados || dados.sucesso !== true) return;
    const sessao = obterSessaoObrigatoria_(parametros);
    if (!sessao || sessao.administrador !== true) return;

    const descricao = String(dados.mensagem || tipo).slice(0, 500);
    const referencia = String(parametros.chaveUnica || parametros.nome || parametros.codigo || parametros.funcionario || "").slice(0, 150);
    gravarEventoAdministrativo_(sessao, tipo, descricao, referencia);
  } catch (erro) {
    console.error("Falha ao registrar auditoria administrativa: " + (erro.stack || erro));
  }
}

function gravarEventoAdministrativo_(sessao, tipo, descricao, referencia) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let aba = ss.getSheetByName("HistoricoAdministrativo");
  if (!aba) {
    aba = ss.insertSheet("HistoricoAdministrativo");
    aba.getRange(1, 1, 1, 8).setValues([["Data", "Loja", "Usuário", "Perfil", "Ação", "Descrição", "Referência", "Login ID"]]).setFontWeight("bold");
    aba.setFrozenRows(1);
    aba.getRange("A:A").setNumberFormat("dd/MM/yyyy HH:mm:ss");
  }
  aba.appendRow([new Date(), sessao.loja || "", sessao.nome || "Administrador",
    sessao.administradorGeral ? "Administrador Geral" : "Administrador de Loja",
    String(tipo || "Ação administrativa"), String(descricao || "").slice(0,500), String(referencia || "").slice(0,150), sessao.loginId || ""]);
}

function consultarEventosAdministrativos_(sessao, mes, todosMeses) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const aba = ss.getSheetByName("HistoricoAdministrativo");
  if (!aba || aba.getLastRow() < 2) return [];
  const valores = aba.getRange(2, 1, aba.getLastRow() - 1, 8).getValues();
  const fuso = ss.getSpreadsheetTimeZone();
  return valores.filter(linha => {
    const loja = normalizarLoja_(linha[1]);
    if (!sessao.administradorGeral && loja !== sessao.loja) return false;
    const data = linha[0] instanceof Date ? linha[0] : new Date(linha[0]);
    if (isNaN(data.getTime())) return false;
    return todosMeses || Utilities.formatDate(data, fuso, "yyyy-MM") === mes;
  }).map(linha => {
    const data = linha[0] instanceof Date ? linha[0] : new Date(linha[0]);
    return { ts: data.getTime(), dataRegistro: Utilities.formatDate(data, fuso, "dd/MM/yyyy HH:mm:ss"),
      loja: String(linha[1] || ""), usuario: String(linha[2] || ""), perfil: String(linha[3] || ""),
      tipo: String(linha[4] || "Ação administrativa"), descricao: String(linha[5] || ""), referencia: String(linha[6] || "") };
  }).sort((a,b) => b.ts-a.ts);
}

function versaoDados_() {
  return CacheService.getScriptCache().get("dados_versao") || "0";
}

function invalidarCacheDados_() {
  CacheService.getScriptCache().put("dados_versao", String(Date.now()), 21600);
  CacheService.getScriptCache().remove("cadastro_funcionarios");
}

function chaveCache_(acao, parametros) {
  const partes = Object.keys(parametros)
    .filter(k => k !== "nocache")
    .sort()
    .map(k => k + "=" + parametros[k]);

  const hash = Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.MD5,
      acao + "|" + partes.join("&")
    )
  );

  return "c_" + versaoDados_() + "_" + hash;
}

// O cache aceita ~100 KB por item: respostas grandes são guardadas em pedaços.
function gravarCacheTexto_(chave, texto, segundos) {
  if (!texto) return;

  // Respostas de erro não ficam guardadas.
  if (texto.indexOf('"sucesso":false') >= 0 || texto.indexOf('"sucesso": false') >= 0) return;

  const TAMANHO = 30000;
  const partes = [];

  for (let i = 0; i < texto.length; i += TAMANHO) {
    partes.push(texto.substr(i, TAMANHO));
  }

  if (partes.length > 90) {
    console.warn(
      "Resposta grande demais para o cache (" + partes.length +
      " partes). A consulta não será guardada."
    );
    return;
  }

  const lote = {};
  lote[chave] = String(partes.length);
  partes.forEach((parte, i) => { lote[chave + "_" + i] = parte; });

  CacheService.getScriptCache().putAll(lote, segundos);
}

function lerCacheTexto_(chave) {
  const cache = CacheService.getScriptCache();
  const quantidade = Number(cache.get(chave));

  if (!quantidade) return null;

  const chaves = [];
  for (let i = 0; i < quantidade; i++) chaves.push(chave + "_" + i);

  const encontrados = cache.getAll(chaves);
  let texto = "";

  for (let i = 0; i < quantidade; i++) {
    const parte = encontrados[chave + "_" + i];
    if (parte === undefined || parte === null) return null;
    texto += parte;
  }

  return texto;
}

function agruparPorProdutoLoteValidade_(registros) {
  const mapa = new Map();

  registros.forEach(function (item) {
    const codigo = String(item.codigo || "").trim();
    const lote = String(item.lote || "").trim() || "SEM_LOTE";
    const validade = String(item.validadeISO || item.validade || "").trim();

    const chave = codigo + "|" + lote + "|" + validade;

    if (!mapa.has(chave)) {
      mapa.set(chave, {
        ...item,
        quantidade: 0
      });
    }

    const atual = mapa.get(chave);
    atual.quantidade = Number(atual.quantidade || 0) + Number(item.quantidade || 0);
    atual.totalItens = atual.quantidade;
  });

  return Array.from(mapa.values());
}





const PLANILHA_PRODUTOS_ID = "10WJdLswDorZE3G0uaObNmFuyIMPgIG0ZdEbGt6FgbsI";

function corrigirLancamentosVencidos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const vencidos = ss.getSheetByName("Vencidos");

  if (!vencidos) {
    throw new Error('A aba "Vencidos" não foi encontrada.');
  }

  const produtosSS = SpreadsheetApp.openById(PLANILHA_PRODUTOS_ID);
  const produtos = produtosSS.getSheetByName("Produtos");

  if (!produtos) {
    throw new Error('A aba "Produtos" não foi encontrada na planilha externa.');
  }

  const ultimaLinha = vencidos.getLastRow();

  if (ultimaLinha < 2) {
    Logger.log("Não há registros para corrigir.");
    return;
  }

  const dados = vencidos.getRange(2, 1, ultimaLinha - 1, 10).getValues();

  // Cria um backup antes de alterar qualquer registro.
  const nomeBackup =
    "Backup_Vencidos_" +
    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyyMMdd_HHmmss"
    );

  vencidos.copyTo(ss).setName(nomeBackup);

  // Produtos: A = Código Interno, B = EAN, C = Descrição.
  const ultimaLinhaProdutos = produtos.getLastRow();

  if (ultimaLinhaProdutos < 2) {
    throw new Error('A aba "Produtos" não possui dados suficientes.');
  }

  const dadosProdutos = produtos
    .getRange(2, 1, ultimaLinhaProdutos - 1, 3)
    .getDisplayValues();

  const mapaEAN = new Map();

  dadosProdutos.forEach(linha => {
    const codigo = String(linha[0] || "").trim();
    const ean = normalizarEANCorrecao_(linha[1]);

    if (codigo && ean && !mapaEAN.has(ean)) {
      mapaEAN.set(ean, codigo);
    }
  });

  let codigosCorrigidos = 0;
  let chavesCriadas = 0;
  let datasAtualizadas = 0;
  let semCorrespondencia = 0;

  const agora = new Date();

  dados.forEach((linha, indice) => {
    // Estrutura:
    // A origem | B linha original | C código | D descrição
    // E lote | F validade | G quantidade | H data
    // I EAN interno | J chave única

    const codigoAtual = String(linha[2] || "").trim();

    // Procura EAN na coluna C, depois B e I.
    const candidatos = [
      linha[2],
      linha[1],
      linha[8]
    ];

    let codigoEncontrado = "";

    for (const candidato of candidatos) {
      const ean = normalizarEANCorrecao_(candidato);

      if (ean && mapaEAN.has(ean)) {
        codigoEncontrado = mapaEAN.get(ean);
        break;
      }
    }

    if (codigoEncontrado) {
      if (codigoAtual !== codigoEncontrado) {
        linha[2] = codigoEncontrado;
        codigosCorrigidos++;
      }

      // Preenche a descrição somente se estiver vazia.
      if (!String(linha[3] || "").trim()) {
        const eanOriginal = candidatos
          .map(normalizarEANCorrecao_)
          .find(ean => ean && mapaEAN.has(ean));

        if (eanOriginal) {
          const produto = dadosProdutos.find(
            p => normalizarEANCorrecao_(p[1]) === eanOriginal
          );

          if (produto && produto[2]) {
            linha[3] = produto[2];
          }
        }
      }
    } else {
      const possuiEAN = candidatos.some(
        candidato => !!normalizarEANCorrecao_(candidato)
      );

      if (possuiEAN && !codigoAtual) {
        semCorrespondencia++;
      }
    }

    // Para registros sem chave, aplica os ajustes solicitados.
    if (!String(linha[9] || "").trim()) {
      linha[1] = 0;
      linha[7] = agora;
      linha[9] = "VENC-" + Utilities.getUuid();

      chavesCriadas++;
      datasAtualizadas++;
    } else if (!(linha[7] instanceof Date) ||
               isNaN(linha[7].getTime())) {
      linha[7] = agora;
      datasAtualizadas++;
    }
  });

  // Grava os registros corrigidos.
  vencidos.getRange(2, 3, dados.length, 1).setNumberFormat("@");
  vencidos.getRange(2, 9, dados.length, 1).setNumberFormat("@");
  vencidos.getRange(2, 1, dados.length, 10).setValues(dados);

  vencidos.getRange(2, 8, dados.length, 1)
    .setNumberFormat("dd/MM/yyyy HH:mm:ss");

  vencidos.getRange(2, 10, dados.length, 1)
    .setNumberFormat("@");

  Logger.log("Backup criado: " + nomeBackup);
  Logger.log("Códigos corrigidos: " + codigosCorrigidos);
  Logger.log("Chaves únicas criadas: " + chavesCriadas);
  Logger.log("Datas atualizadas: " + datasAtualizadas);
  Logger.log("EANs sem correspondência: " + semCorrespondencia);

  const resultado =
  "Correção concluída!\n\n" +
  "Backup: " + nomeBackup + "\n" +
  "Códigos corrigidos: " + codigosCorrigidos + "\n" +
  "Chaves criadas: " + chavesCriadas + "\n" +
  "Datas atualizadas: " + datasAtualizadas + "\n" +
  "EANs sem correspondência: " + semCorrespondencia;

  Logger.log(resultado);
  console.log(resultado);
}

function normalizarEANCorrecao_(valor) {
  if (valor === null || valor === undefined) {
    return "";
  }

  let ean = String(valor).trim();

  // Remove espaços e caracteres não numéricos.
  ean = ean.replace(/\D/g, "");

  if (ean.length < 8 || ean.length > 14) {
    return "";
  }

  // Trata UPC-A como equivalente ao EAN-13 com zero inicial.
  if (ean.length === 12) {
    ean = "0" + ean;
  }

  return ean;
}


function cadastrarQueimaManual_(p) {
  const callback = String(p.callback || "");

  if (callback !== "__cadastrarQueimaManualCb") {
    return respostaTexto_("Callback inválido.");
  }

  const lock = LockService.getScriptLock();

  try {
    const admin = exigirAdministrador_(p);
    const codigo = String(p.codigo || "").trim();
    const lote = String(p.lote || "").trim();
    const validadeTexto = String(p.validade || "").trim();
    const quantidadeTexto = String(p.quantidade || "").trim();
    const descricao = String(p.descricao || "").trim();

    if (!codigo || !lote || !validadeTexto || !quantidadeTexto) {
      throw new Error("Código, lote, validade e quantidade são obrigatórios.");
    }

    if (codigo.length > 80 || lote.length > 120 || descricao.length > 250) {
      throw new Error("Um dos campos ultrapassa o tamanho permitido.");
    }

    const quantidade = Number(quantidadeTexto);

    if (!Number.isSafeInteger(quantidade) || quantidade <= 0) {
      throw new Error("A quantidade deve ser um inteiro maior que zero.");
    }

    const partes = validadeTexto.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!partes) {
      throw new Error("Validade inválida.");
    }

    const ano = Number(partes[1]);
    const mes = Number(partes[2]);
    const dia = Number(partes[3]);
    const validade = new Date(ano, mes - 1, dia);

    if (
      validade.getFullYear() !== ano ||
      validade.getMonth() !== mes - 1 ||
      validade.getDate() !== dia
    ) {
      throw new Error("A data de validade não é válida.");
    }

    if (!lock.tryLock(10000)) {
      throw new Error("Sistema ocupado. Tente novamente.");
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const aba = ss.getSheetByName("Queima");

    if (!aba) {
      throw new Error("A aba Queima não foi encontrada.");
    }

    if (aba.getLastColumn() < 1) {
      throw new Error("A aba Queima precisa ter cabeçalhos na primeira linha.");
    }

    const fuso = ss.getSpreadsheetTimeZone();
    let cabecalhos = aba
      .getRange(1, 1, 1, aba.getLastColumn())
      .getDisplayValues()[0]
      .map(h => normalizarTexto_(h).replace(/\s+/g, " "));

    let indiceLoja = cabecalhos.indexOf("lojaorigem");
    if (indiceLoja < 0) {
      indiceLoja = cabecalhos.length;
      aba.getRange(1, indiceLoja + 1).setValue("LojaOrigem");
      cabecalhos.push("lojaorigem");
    }
    const novaLinha = Array(cabecalhos.length).fill("");
    novaLinha[indiceLoja] = admin.loja;

    function definirCampo(aliases, valor, obrigatorio = false) {
      const indice = cabecalhos.findIndex(h => aliases.includes(h));

      if (indice < 0) {
        if (obrigatorio) {
          throw new Error(
            "Não encontrei o cabeçalho: " + aliases[0] + "."
          );
        }
        return;
      }

      novaLinha[indice] = valor;
    }

    const agora = new Date();
    const mesLancamento = new Date(
      agora.getFullYear(),
      agora.getMonth(),
      1
    );

    const chaveUnica = "MANUAL-" + Utilities.getUuid();

    definirCampo(["codigo de barras", "codigo", "ean"],
      codigo, true);
    definirCampo(["descricao", "produto"], descricao);
    definirCampo(["lote"], lote, true);
    definirCampo(["validade"], validade, true);
    definirCampo(["quantidade", "qtd"], quantidade, true);
    definirCampo(
      ["mes do lancamento", "mes de lancamento"],
      mesLancamento, true
    );
    definirCampo(
      ["aba de origem", "aba origem", "funcionario", "mapa de origem"],
      "Cadastro manual"
    );
    definirCampo(["mes aprovado"], "");
    definirCampo(["aprovado"], "N");
    definirCampo(["chave unica", "chave unica origem"],
      chaveUnica, true);

    const linhaDestino = Math.max(aba.getLastRow() + 1, 2);

    const colunaCodigoQueima = cabecalhos.findIndex(h => ["codigo de barras", "codigo", "ean"].includes(h)) + 1;
    if (colunaCodigoQueima > 0) aba.getRange(linhaDestino, colunaCodigoQueima).setNumberFormat("@");
    aba.getRange(linhaDestino, 1, 1, novaLinha.length)
      .setValues([novaLinha]);

    const indiceValidade = cabecalhos.indexOf("validade");
    const indiceMes = cabecalhos.indexOf("mes do lancamento");

    if (indiceValidade >= 0) {
      aba.getRange(linhaDestino, indiceValidade + 1)
        .setNumberFormat("dd/MM/yyyy");
    }

    if (indiceMes >= 0) {
      aba.getRange(linhaDestino, indiceMes + 1)
        .setNumberFormat("mmmm yyyy");
    }

    SpreadsheetApp.flush();

    return respostaJsonp_(callback, {
      sucesso: true,
      mensagem: "Produto cadastrado diretamente na Queima.",
      codigo,
      chaveUnica
    });

  } catch (e) {
    return respostaJsonp_(callback, {
      sucesso: false,
      mensagem: mensagemErro_(e)
    });

  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function aquecerCache() {
  [
    ["validades", "__validadeCb"],
    ["dashboardPainel", "__dashboardPainelCb"],
    ["vencidosPainel", "__vencidosPainelCb"],
    ["consultarQueima", "__consultarQueimaCb"],
    ["consultarSinalizados", "__sinalizadosCb"]
  ].forEach(function (par) {
    try {
      doGet({ parameter: { action: par[0], callback: par[1], nocache: "1" } });
    } catch (e) {
      console.error("Falha ao aquecer " + par[0] + ": " + e);
    }
  });
}

// Execute UMA vez manualmente para criar o gatilho:
function criarGatilhoAquecimento() {
  ScriptApp.newTrigger("aquecerCache").timeBased().everyMinutes(10).create();
}

function localizarChaveNaAba_(aba, colunaChave, chave) {
  const ultima = aba.getLastRow();
  if (ultima < 2 || !chave) return 0;

  const achados = aba
    .getRange(2, colunaChave, ultima - 1, 1)
    .createTextFinder(chave)
    .matchCase(true)
    .matchEntireCell(false)
    .findAll();

  for (const celula of achados) {
    const texto = String(celula.getDisplayValue() || "").trim();
    const lista = texto.split("|").map(v => v.trim()).filter(Boolean);

    if (texto === chave || lista.includes(chave)) return celula.getRow();
  }

  return 0; // não encontrado
}

/* =========================================================
   GESTÃO DE FUNCIONÁRIOS (aba "Funcionarios")
   Colunas: A = Nome | B = Especial (checkbox) | F = Check (checkbox)
   Cole este bloco inteiro no Code.gs e siga os "AJUSTES NO CÓDIGO
   EXISTENTE" no final deste arquivo.
   ========================================================= */

const NOMES_RESERVADOS_ABAS_ = [
  "funcionarios", "transferencias", "queima",
  "vencidos", "sinalizacao", "produtos"
];

/* ---------- Reset do check: todo dia 20 ---------- */

// O "ciclo" começa no dia 20. De 20/jan a 19/fev o ciclo é "2026-01", etc.
function cicloCheckAtual_() {
  const fuso = SpreadsheetApp.openById(SPREADSHEET_ID).getSpreadsheetTimeZone();
  const agora = new Date();
  const dia = Number(Utilities.formatDate(agora, fuso, "d"));
  let ano = Number(Utilities.formatDate(agora, fuso, "yyyy"));
  let mes = Number(Utilities.formatDate(agora, fuso, "M"));

  if (dia < 20) {
    mes--;
    if (mes === 0) { mes = 12; ano--; }
  }

  return ano + "-" + String(mes).padStart(2, "0");
}

/**
 * Zera a coluna F quando começa um novo ciclo (dia 20).
 * Roda sozinha sempre que a lista é lida ou um check é alterado,
 * e também pelo gatilho diário (opcional).
 */
function resetarChecksSeNecessario_(aba, jaTemLock) {
  const props = PropertiesService.getScriptProperties();
  const ciclo = cicloCheckAtual_();
  const salvo = lerConfig_().ciclo

  if (salvo === ciclo) return false;

  // Primeira execução: apenas registra o ciclo, sem apagar nada.
  if (!salvo) {
    salvarCiclo_(ciclo)
    return false;
  }

  const lock = jaTemLock ? null : LockService.getScriptLock();
  if (lock && !lock.tryLock(10000)) return false;

  try {
    // Confere de novo: outra execução pode ter resetado enquanto esperava.
    if (props.getProperty("CHECK_CICLO") === ciclo) return false;

    const ultima = aba.getLastRow();

    if (ultima >= 2) {
      const nomes = aba.getRange(2, 1, ultima - 1, 1).getValues();
      const atuais = aba.getRange(2, 6, ultima - 1, 1).getValues();

      const novos = nomes.map(function (linha, i) {
        return [String(linha[0] || "").trim() ? false : atuais[i][0]];
      });

      aba.getRange(2, 6, novos.length, 1).setValues(novos);
      SpreadsheetApp.flush();
    }

    props.setProperty("CHECK_CICLO", ciclo);
    return true;

  } finally {
    if (lock) lock.releaseLock();
  }
}

// Gatilho diário (opcional, garante o reset mesmo sem ninguém abrir o painel).
function resetarChecksFuncionarios() {
  const aba = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Funcionarios");
  if (aba) resetarChecksSeNecessario_(aba, false);
}

// Execute UMA vez manualmente para criar o gatilho diário (por volta de 1h).
function criarGatilhoResetChecks() {
  ScriptApp.getProjectTriggers().forEach(function (g) {
    if (g.getHandlerFunction() === "resetarChecksFuncionarios") ScriptApp.deleteTrigger(g);
  });

  ScriptApp.newTrigger("resetarChecksFuncionarios")
    .timeBased().everyDays(1).atHour(1).create();
}

/* ---------- Auxiliares ---------- */

function validarNomeFuncionario_(nome) {
  if (!nome) throw new Error("Informe o nome do funcionário.");
  if (nome.length > 60) throw new Error("Use no máximo 60 caracteres.");
  if (/[\[\]*?:\/\\|]/.test(nome)) {
    throw new Error("O nome não pode conter os caracteres [ ] * ? : / \\ |");
  }
  if (NOMES_RESERVADOS_ABAS_.includes(normalizarTexto_(nome))) {
    throw new Error("Este nome é reservado para uma aba do sistema.");
  }
}

function localizarLinhaFuncionario_(aba, nome) {
  const ultima = aba.getLastRow();
  if (ultima < 2) return 0;

  const nomes = aba.getRange(2, 1, ultima - 1, 1).getValues();

  for (let i = 0; i < nomes.length; i++) {
    if (String(nomes[i][0] || "").trim() === nome) return i + 2;
  }

  return 0;
}

function existeAbaComNome_(planilha, nome, ignorar) {
  const alvo = String(nome).toLocaleLowerCase("pt-BR");

  return planilha.getSheets().some(function (aba) {
    const n = aba.getName();
    return n !== ignorar && n.toLocaleLowerCase("pt-BR") === alvo;
  });
}

// Troca um valor em uma coluna inteira (ex.: nome antigo -> novo).
function substituirValorColuna_(aba, coluna, de, para) {
  if (!aba || coluna < 1) return 0;

  const ultima = aba.getLastRow();
  if (ultima < 2) return 0;

  const faixa = aba.getRange(2, coluna, ultima - 1, 1);
  const valores = faixa.getValues();
  let alterados = 0;

  const novos = valores.map(function (linha) {
    if (String(linha[0] || "").trim() === de) {
      alterados++;
      return [para];
    }
    return [linha[0]];
  });

  if (alterados > 0) faixa.setValues(novos);
  return alterados;
}

function indiceColuna_(aba, aliases) {
  if (!aba || aba.getLastColumn() < 1) return 0;

  const cab = aba.getRange(1, 1, 1, aba.getLastColumn())
    .getDisplayValues()[0]
    .map(function (h) { return normalizarTexto_(h).replace(/\s+/g, " "); });

  for (let i = 0; i < cab.length; i++) {
    if (aliases.includes(cab[i])) return i + 1;
  }

  return 0;
}

/* ---------- ADICIONAR FUNCIONÁRIO ---------- */

function adicionarFuncionario_(p) {
  const cb = String(p.callback || "");
  if (cb !== "__adicionarFuncionarioCb") return respostaTexto_("Callback inválido.");

  const lock = LockService.getScriptLock();

  try {
    const admin = exigirAdministrador_(p);
    const nome = String(p.nome || "").trim();
    const especial = String(p.especial || "") === "1";

    validarNomeFuncionario_(nome);

    if (!lock.tryLock(15000)) throw new Error("Sistema ocupado. Tente novamente.");

    const planilha = SpreadsheetApp.openById(SPREADSHEET_ID);
    const cadastro = planilha.getSheetByName("Funcionarios");
    if (!cadastro) throw new Error('A aba "Funcionarios" não foi encontrada.');

    if (localizarLinhaFuncionario_(cadastro, nome) ||
        existeAbaComNome_(planilha, nome, "")) {
      throw new Error("Já existe um funcionário ou aba com este nome.");
    }

    // Cabeçalhos: copia de um funcionário existente, ou usa o padrão.
    let cabecalhos = ["Código de Barras", "Lote", "Validade", "Quantidade",
                      "Data de Lançamento", "Chave Única"];

    const modelo = obterNomesAbasCadastro_()
      .filter(function (n) { return n !== "Transferencias"; })
      .map(function (n) { return planilha.getSheetByName(n); })
      .filter(Boolean)[0];

    if (modelo && modelo.getLastColumn() >= 6) {
      cabecalhos = modelo.getRange(1, 1, 1, 6).getValues()[0];
    }

    const aba = planilha.insertSheet(nome);
    aba.getRange(1, 1, 1, 6).setValues([cabecalhos]).setFontWeight("bold");
    aba.setFrozenRows(1);
    aba.getRange("C:C").setNumberFormat("dd/MM/yyyy");
    aba.getRange("E:E").setNumberFormat("dd/MM/yyyy HH:mm:ss");

    const linha = Math.max(cadastro.getLastRow() + 1, 2);
    cadastro.getRange(linha, 1).setValue(nome);
    cadastro.getRange(linha, 2).insertCheckboxes().setValue(especial);
    cadastro.getRange(linha, 6).insertCheckboxes().setValue(false);
    cadastro.getRange(linha, 7).clearContent();
    cadastro.getRange(linha, 8).insertCheckboxes().setValue(false);
    cadastro.getRange(linha, 9).setValue(admin.loja);

    SpreadsheetApp.flush();

    return respostaJsonp_(cb, {
      sucesso: true,
      mensagem: 'Funcionário "' + nome + '" adicionado e aba criada.'
    });

  } catch (erro) {
    console.error("Erro ao adicionar funcionário: " + (erro.stack || erro));
    return respostaJsonp_(cb, { sucesso: false, mensagem: mensagemErro_(erro) });

  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

/* ---------- RENOMEAR FUNCIONÁRIO ---------- */

function renomearFuncionario_(p) {
  const cb = String(p.callback || "");
  if (cb !== "__renomearFuncionarioCb") return respostaTexto_("Callback inválido.");

  const lock = LockService.getScriptLock();

  try {
    const admin = exigirAdministrador_(p);
    const nomeAtual = String(p.nomeAtual || "").trim();
    const cadastroAlvo = buscarFuncionarioPorNome_(nomeAtual);
    if (!cadastroAlvo || cadastroAlvo.administrador || cadastroAlvo.loja !== admin.loja) throw new Error("Você só pode renomear funcionários da sua própria loja.");
    const novoNome = String(p.novoNome || "").trim();

    if (!nomeAtual) throw new Error("Funcionário não informado.");
    validarNomeFuncionario_(novoNome);

    if (novoNome === nomeAtual) throw new Error("O novo nome é igual ao atual.");

    if (!lock.tryLock(15000)) throw new Error("Sistema ocupado. Tente novamente.");

    const planilha = SpreadsheetApp.openById(SPREADSHEET_ID);
    const cadastro = planilha.getSheetByName("Funcionarios");
    if (!cadastro) throw new Error('A aba "Funcionarios" não foi encontrada.');

    const linha = localizarLinhaFuncionario_(cadastro, nomeAtual);
    if (!linha) throw new Error("Funcionário não encontrado no cadastro.");

    const aba = planilha.getSheetByName(nomeAtual);
    if (!aba) throw new Error('A aba "' + nomeAtual + '" não foi encontrada.');

    if (existeAbaComNome_(planilha, novoNome, nomeAtual) ||
        localizarLinhaFuncionario_(cadastro, novoNome)) {
      throw new Error("Já existe um funcionário ou aba com este nome.");
    }

    // 1) Renomeia a aba e o cadastro.
    aba.setName(novoNome);
    cadastro.getRange(linha, 1).setValue(novoNome);

    // 2) Atualiza referências ao nome antigo nas outras abas.
    let aviso = "";

    try {
      const sinal = planilha.getSheetByName("Sinalizacao");
      substituirValorColuna_(sinal, indiceColuna_(sinal, ["funcionario"]), nomeAtual, novoNome);

      const queima = planilha.getSheetByName("Queima");
      substituirValorColuna_(queima,
        indiceColuna_(queima, ["aba de origem", "aba origem", "funcionario", "mapa de origem"]),
        nomeAtual, novoNome);

      // Vencidos: coluna A = Aba de origem.
      substituirValorColuna_(planilha.getSheetByName("Vencidos"), 1, nomeAtual, novoNome);

    } catch (erroRef) {
      console.error("Falha ao atualizar referências: " + (erroRef.stack || erroRef));
      aviso = " Atenção: a aba foi renomeada, mas algumas referências antigas " +
              "(Sinalizacao, Queima ou Vencidos) não puderam ser atualizadas.";
    }

    SpreadsheetApp.flush();

    return respostaJsonp_(cb, {
      sucesso: true,
      mensagem: 'Funcionário renomeado de "' + nomeAtual + '" para "' + novoNome + '".' + aviso
    });

  } catch (erro) {
    console.error("Erro ao renomear funcionário: " + (erro.stack || erro));
    return respostaJsonp_(cb, { sucesso: false, mensagem: mensagemErro_(erro) });

  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

/* ---------- DEFINIR / TIRAR DEFINIÇÃO DE ESPECIAL ---------- */

function definirEspecialFuncionario_(p) {
  const cb = String(p.callback || "");
  if (cb !== "__especialFuncionarioCb") return respostaTexto_("Callback inválido.");

  const lock = LockService.getScriptLock();

  try {
    const admin = exigirAdministrador_(p);
    const nome = String(p.nome || "").trim();
    const alvo = buscarFuncionarioPorNome_(nome);
    if (!alvo || alvo.administrador || alvo.loja !== admin.loja) throw new Error("Você só pode alterar funcionários da sua própria loja.");
    const especial = String(p.especial || "") === "1";

    if (!nome) throw new Error("Funcionário não informado.");
    if (!lock.tryLock(15000)) throw new Error("Sistema ocupado. Tente novamente.");

    const cadastro = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Funcionarios");
    if (!cadastro) throw new Error('A aba "Funcionarios" não foi encontrada.');

    const linha = localizarLinhaFuncionario_(cadastro, nome);
    if (!linha) throw new Error("Funcionário não encontrado no cadastro.");

    cadastro.getRange(linha, 2).setValue(especial);
    SpreadsheetApp.flush();

    return respostaJsonp_(cb, {
      sucesso: true,
      mensagem: especial
        ? '"' + nome + '" agora é uma aba especial.'
        : 'A definição de especial de "' + nome + '" foi removida.'
    });

  } catch (erro) {
    console.error("Erro ao definir especial: " + (erro.stack || erro));
    return respostaJsonp_(cb, { sucesso: false, mensagem: mensagemErro_(erro) });

  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

/* ---------- ATIVAR / INATIVAR FUNCIONÁRIO (coluna J) ---------- */
function inativarFuncionario_(p) {
  const cb = String(p.callback || "");
  if (cb !== "__inativarFuncionarioCb") return respostaTexto_("Callback inválido.");
  const lock = LockService.getScriptLock();
  try {
    const admin = exigirAdministrador_(p);
    const nome = String(p.nome || "").trim();
    const alvo = buscarFuncionarioPorNome_(nome);
    if (!alvo || alvo.administrador || alvo.loja !== admin.loja) throw new Error("Você só pode alterar funcionários da sua própria loja.");
    const ativo = String(p.ativo || "") === "1";
    if (!lock.tryLock(15000)) throw new Error("Sistema ocupado. Tente novamente.");
    const aba = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Funcionarios");
    if (!aba) throw new Error('A aba "Funcionarios" não foi encontrada.');
    const linha = localizarLinhaFuncionario_(aba, nome);
    if (!linha) throw new Error("Funcionário não encontrado.");
    aba.getRange(1, 10).setValue("Status");
    aba.getRange(linha, 10).setValue(ativo ? "Ativo" : "Inativo");
    CacheService.getScriptCache().remove("cadastro_funcionarios");
    SpreadsheetApp.flush();
    return respostaJsonp_(cb, { sucesso: true, mensagem: ativo ? "Funcionário reativado." : "Funcionário inativado." });
  } catch (e) { return respostaJsonp_(cb, { sucesso: false, mensagem: mensagemErro_(e) }); }
  finally { if (lock.hasLock()) lock.releaseLock(); }
}

/* ---------- CHECK MANUAL (coluna F) ---------- */

function marcarCheckFuncionario_(p) {
  const cb = String(p.callback || "");
  if (cb !== "__checkFuncionarioCb") return respostaTexto_("Callback inválido.");

  const lock = LockService.getScriptLock();

  try {
    const admin = exigirAdministrador_(p);
    const nome = String(p.nome || "").trim();
    const alvo = buscarFuncionarioPorNome_(nome);
    if (!alvo || alvo.administrador || alvo.loja !== admin.loja) throw new Error("Você só pode alterar funcionários da sua própria loja.");
    const marcado = String(p.marcado || "") === "1";

    if (!nome) throw new Error("Funcionário não informado.");
    if (!lock.tryLock(15000)) throw new Error("Sistema ocupado. Tente novamente.");

    const cadastro = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Funcionarios");
    if (!cadastro) throw new Error('A aba "Funcionarios" não foi encontrada.');

    // Se um novo ciclo (dia 20) começou, zera antes de gravar.
    resetarChecksSeNecessario_(cadastro, true);

    const linha = localizarLinhaFuncionario_(cadastro, nome);
    if (!linha) throw new Error("Funcionário não encontrado no cadastro.");

    cadastro.getRange(linha, 6).setValue(marcado);
    SpreadsheetApp.flush();

    return respostaJsonp_(cb, { sucesso: true, mensagem: "Check atualizado." });

  } catch (erro) {
    console.error("Erro ao marcar check: " + (erro.stack || erro));
    return respostaJsonp_(cb, { sucesso: false, mensagem: mensagemErro_(erro) });

  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function salvarCiclo_(ciclo) {
  const cfg = lerConfig_(); cfg.ciclo = ciclo; salvarConfig_(cfg);
}

/* =========================================================
   AJUSTES NO CÓDIGO EXISTENTE
   =========================================================

   1) Em doGetOriginal_, adicione estas linhas junto das outras ações
      (por exemplo, logo antes de  if (acao === "funcionarios") {  ):

      if (acao === "adicionarFuncionario") return adicionarFuncionario_(parametros);
      if (acao === "renomearFuncionario") return renomearFuncionario_(parametros);
      if (acao === "definirEspecialFuncionario") return definirEspecialFuncionario_(parametros);
      if (acao === "marcarCheckFuncionario") return marcarCheckFuncionario_(parametros);

   2) Ainda em doGetOriginal_, no bloco  if (acao === "funcionarios") { ... }
      troque o  try { ... }  de sucesso por:

      try {
        let detalhes = [];

        try {
          detalhes = obterDetalhesFuncionarios_();
        } catch (erroDetalhes) {
          console.error("Detalhes de funcionários: " + (erroDetalhes.stack || erroDetalhes));
        }

        return respostaJsonp_("__funcionariosCb", {
          sucesso: true,
          ...obterCadastroFuncionarios_(),
          detalhes: detalhes
        });
      } catch (erro) {
        ...(o catch continua igual)

   3) Na constante ACOES_QUE_ALTERAM_ (final do arquivo), acrescente:

      "adicionarFuncionario", "renomearFuncionario",
      "definirEspecialFuncionario", "marcarCheckFuncionario"

   4) Se você aplicou a otimização de cache do cadastro
      ("cadastro_funcionarios"), acrescente em invalidarCacheDados_():

      CacheService.getScriptCache().remove("cadastro_funcionarios");

   5) Publique uma NOVA VERSÃO da implantação.

   6) (Opcional) Execute criarGatilhoResetChecks() uma vez para o reset
      do dia 20 acontecer mesmo sem ninguém abrir o painel.
   ========================================================= */

/* ========================== FIM DO BLOCO PARA COLAR ========================== */


function exigirOrigemQueimaDaLoja_(sessao, aba, linha) {
  const ultimaColuna = aba.getLastColumn();
  const cab = aba.getRange(1, 1, 1, ultimaColuna).getDisplayValues()[0].map(h => normalizarTexto_(h).replace(/\s+/g, " "));
  const idxLoja = cab.indexOf("lojaorigem");
  const lojaGravada = idxLoja >= 0 ? normalizarLoja_(aba.getRange(linha, idxLoja + 1).getDisplayValue()) : "";
  if (lojaGravada) {
    if (lojaGravada !== sessao.loja) throw new Error("Este registro não pertence à sua loja.");
    return;
  }
  // Registros antigos sem LojaOrigem: tenta recuperar pelo nome da aba de origem.
  const idx = cab.findIndex(h => ["aba de origem", "aba origem", "funcionario", "mapa de origem"].includes(h));
  if (idx < 0) throw new Error("Não foi possível validar a loja de origem deste registro.");
  const origem = String(aba.getRange(linha, idx + 1).getDisplayValue() || "").trim();
  if (normalizarTexto_(origem) === "cadastro manual") throw new Error("Registro manual sem LojaOrigem: não é possível confirmar a loja.");
  const funcionario = buscarFuncionarioPorNome_(origem);
  if (!funcionario || funcionario.administrador || normalizarLoja_(funcionario.loja) !== sessao.loja) throw new Error("Este registro não pertence à sua loja.");
}

function lojaDaLinhaVencidos_(aba, linha, exibidos) {
  const lojaGravada = normalizarLoja_(aba.getLastColumn() >= 11 ? aba.getRange(linha, 11).getDisplayValue() : "");
  if (lojaGravada) return lojaGravada;
  const origem = String(exibidos[0] || "").trim();
  const funcionario = buscarFuncionarioPorNome_(origem);
  return funcionario && !funcionario.administrador ? funcionario.loja : "";
}

/* ============================================================
   DETALHES DOS FUNCIONÁRIOS (ESCOPO DA LOJA DO ADMIN)
   ============================================================ */
function obterDetalhesFuncionarios_(parametros) {
  const sessao = obterSessaoObrigatoria_(parametros || {});
  const aba = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Funcionarios");
  if (!aba || aba.getLastRow() < 2) return [];
  const dados = aba.getRange(2, 1, aba.getLastRow() - 1, 10).getValues();
  return dados.map(linha => {
    const nome = String(linha[0] || "").trim();
    const loja = normalizarLoja_(linha[8]);
    const administrador = ehAdministradorValor_(linha[7]);
    const ativo = !(String(linha[9] || "").toLowerCase() === "inativo" || linha[9] === false);
    if (!nome || (!sessao.administrador && normalizarTexto_(nome) !== normalizarTexto_(sessao.nome)) || (sessao.administrador && loja !== sessao.loja)) return null;
    return { nome, especial: linha[1] === true, check: linha[5] === true, ativo, temPin: String(linha[6] || "").includes(":"), administrador, loja };
  }).filter(Boolean);
}

/* ============================================================
   SEGURANÇA — LOGIN, PERFIL E LOJA
   ============================================================ */

function ehAdministradorGeralValor_(valor) {
  return normalizarTexto_(valor) === "geral";
}

function ehAdministradorValor_(valor) {
  if (valor === true) return true;
  const texto = normalizarTexto_(valor);
  return ["true", "sim", "administrador", "admin", "1", "geral"].includes(texto);
}

function normalizarLoja_(valor) {
  let loja = String(valor == null ? "" : valor).trim();

  loja = loja.replace(/^v/i, "").replace(/\D/g, "");

  return loja;
}

function obterSessaoObrigatoria_(parametros) {
  const token = String(
    parametros && parametros.sessao || ""
  );

  const sessao = lerSessao_(token);

  if (!sessao) {
    throw new Error("Sessão expirada. Entre novamente.");
  }

  const agora = Date.now();
  const criadaEm = Number(sessao.criadaEm || 0);
  const ultimaAtividade = Number(sessao.ultimaAtividade || criadaEm);
  const expiraEm = criadaEm + SESSAO_SEGUNDOS_ * 1000;
  if (!criadaEm || agora >= expiraEm) {
    removerSessao_(token);
    throw new Error("Sua sessão atingiu o limite de 8 horas. Entre novamente.");
  }
  if (!ultimaAtividade || agora - ultimaAtividade >= INATIVIDADE_SEGUNDOS_ * 1000) {
    removerSessao_(token);
    throw new Error("Sua sessão foi encerrada após 30 minutos de inatividade.");
  }

  // Confere novamente o cadastro para impedir que uma sessão
  // antiga continue válida depois de uma mudança de perfil/loja.
  const cadastro = buscarFuncionarioPorNome_(sessao.nome);

  if (!cadastro) {
    removerSessao_(token);
    throw new Error("Usuário não encontrado no cadastro.");
  }
  if (cadastro.ativo === false) {
    removerSessao_(token);
    throw new Error("Seu cadastro foi inativado. Procure o Administrador da Loja.");
  }

  if (
    cadastro.loja !== normalizarLoja_(sessao.loja) ||
    cadastro.administrador !== (sessao.administrador === true) ||
    cadastro.administradorGeral !== (sessao.administradorGeral === true)
  ) {
    removerSessao_(token);
    throw new Error("Seu perfil ou sua loja foi alterado. Entre novamente.");
  }

  return sessao;
}

function exigirAdministrador_(parametros) {
  const sessao = obterSessaoObrigatoria_(parametros);
  if (sessao.administrador !== true || sessao.administradorGeral === true) {
    throw new Error("Acesso exclusivo para administradores de loja.");
  }
  if (!sessao.loja) throw new Error("Administrador sem loja cadastrada.");
  return sessao;
}

function exigirAdministradorGeral_(parametros) {
  const sessao = obterSessaoObrigatoria_(parametros);
  if (sessao.administradorGeral !== true || sessao.perfil !== "geral") {
    throw new Error("Acesso exclusivo ao Administrador Geral.");
  }
  return sessao;
}

function listarAdminsLojas_(p) {
  const cb = String(p.callback || "");
  if (cb !== "__listarAdminsLojasCb") return respostaTexto_("Callback inválido.");
  try {
    exigirAdministradorGeral_(p);
    const aba = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Funcionarios");
    if (!aba || aba.getLastRow() < 2) return respostaJsonp_(cb, { sucesso: true, administradores: [] });
    const dados = aba.getRange(2, 1, aba.getLastRow() - 1, 9).getValues();
    const administradores = dados.map((r, i) => ({
      nome: String(r[0] || "").trim(), loja: normalizarLoja_(r[8]),
      temPin: String(r[6] || "").includes(":"), linha: i + 2, geral: ehAdministradorGeralValor_(r[7])
    })).filter(x => x.nome && ehAdministradorValor_(dados[x.linha - 2][7]) && !x.geral)
      .map(({ nome, loja, temPin }) => ({ nome, loja, temPin }));
    return respostaJsonp_(cb, { sucesso: true, administradores });
  } catch (e) { return respostaJsonp_(cb, { sucesso: false, mensagem: mensagemErro_(e) }); }
}

function criarAdminLoja_(p) {
  const cb = String(p.callback || "");
  if (cb !== "__criarAdminLojaCb") return respostaTexto_("Callback inválido.");
  const lock = LockService.getScriptLock();
  try {
    exigirAdministradorGeral_(p);
    const nome = String(p.nome || "").trim();
    const loja = normalizarLoja_(p.loja);
    const pin = String(p.pin || "").trim();
    validarNomeFuncionario_(nome);
    if (!/^\d{1,5}$/.test(loja)) throw new Error("Informe uma loja válida, somente números.");
    if (!/^\d{4,6}$/.test(pin)) throw new Error("O PIN deve conter de 4 a 6 números.");
    if (!lock.tryLock(15000)) throw new Error("Sistema ocupado. Tente novamente.");
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const aba = ss.getSheetByName("Funcionarios");
    if (!aba) throw new Error('A aba "Funcionarios" não foi encontrada.');
    if (buscarFuncionarioPorNome_(nome)) throw new Error("Já existe um cadastro com esse nome.");
    const linha = Math.max(aba.getLastRow() + 1, 2);
    const salt = Utilities.getUuid();
    const hash = hashPin_(pin, salt);
    aba.getRange(linha, 1).setValue(nome);
    aba.getRange(linha, 2).clearContent();
    aba.getRange(linha, 6).clearContent();
    aba.getRange(linha, 7).setNumberFormat("@").setValue(salt + ":" + hash);
    aba.getRange(linha, 8).insertCheckboxes().setValue(true);
    aba.getRange(linha, 9).setNumberFormat("@").setValue(loja);
    CacheService.getScriptCache().remove("cadastro_funcionarios");
    SpreadsheetApp.flush();
    return respostaJsonp_(cb, { sucesso: true, mensagem: "Administrador da loja " + loja + " criado com sucesso." });
  } catch (e) {
    return respostaJsonp_(cb, { sucesso: false, mensagem: mensagemErro_(e) });
  } finally { if (lock.hasLock()) lock.releaseLock(); }
}

function obterAbasPermitidas_(parametros) {
  const sessao = obterSessaoObrigatoria_(parametros);

  const planilha = SpreadsheetApp.openById(SPREADSHEET_ID);
  const cadastro = planilha.getSheetByName("Funcionarios");

  if (!cadastro || cadastro.getLastRow() < 2) {
    return [];
  }

  const dados = cadastro.getRange(
    2, 1, cadastro.getLastRow() - 1, 10
  ).getValues();

  const permitidas = [];

  dados.forEach(linha => {
    const nome = String(linha[0] || "").trim();
    const loja = normalizarLoja_(linha[8]);
    const administrador = ehAdministradorValor_(linha[7]);
    const inativo = String(linha[9] || "").toLowerCase() === "inativo" || linha[9] === false;

    if (!nome || administrador || inativo) return;

    if (sessao.administrador) {
      if (loja === sessao.loja) {
        permitidas.push(nome);
      }
    } else {
      if (normalizarTexto_(nome) === normalizarTexto_(sessao.nome)) {
        permitidas.push(nome);
      }
    }
  });

  if (sessao.administrador) {
    permitidas.push("Transferencias");
  }

  return [...new Set(permitidas)];
}

/* ============================================================
   VALIDAÇÃO DE ACESSO A UMA ABA
   ============================================================ */

function exigirDonoDaAba_(parametros, nomeAba) {
  const sessao = obterSessaoObrigatoria_(parametros);

  if (nomeAba === "Transferencias") {
    throw new Error(
      "Para transferências, valide também a loja de origem do registro."
    );
  }

  if (!sessao.administrador) {
    if (
      normalizarTexto_(sessao.nome) !==
      normalizarTexto_(nomeAba)
    ) {
      throw new Error("Você só pode alterar seu próprio mapa.");
    }

    return;
  }

  const funcionario = buscarFuncionarioPorNome_(nomeAba);

  if (
    !funcionario ||
    funcionario.administrador ||
    funcionario.loja !== sessao.loja
  ) {
    throw new Error(
      "Você só pode gerenciar funcionários da sua própria loja."
    );
  }
}

/* ============================================================
   VALIDAÇÃO DE ACESSO A UM REGISTRO
   ============================================================ */

function exigirAcessoRegistro_(parametros, registro) {
  const sessao = obterSessaoObrigatoria_(parametros);

  if (registro.nomeAba === "Transferencias") {
    if (!sessao.administrador) {
      throw new Error("Somente administradores podem acessar transferências.");
    }
    const aba = registro.aba;
    const linha = registro.linha;

    // Coluna F = Loja de Origem
    const lojaOrigem = normalizarLoja_(
      aba.getRange(linha, 6).getDisplayValue()
    );

    if (lojaOrigem !== sessao.loja) {
      throw new Error(
        "Você não tem permissão para acessar esta transferência."
      );
    }

    return;
  }

  const nomeAba = String(registro.nomeAba || "").trim();
  if (!nomeAba) {
    throw new Error("Não foi possível identificar a origem do lançamento.");
  }

  if (!sessao.administrador) {
    if (normalizarTexto_(nomeAba) !== normalizarTexto_(sessao.nome)) {
      throw new Error("Você só pode acessar seu próprio mapa.");
    }
    return;
  }

  const funcionario = buscarFuncionarioPorNome_(nomeAba);
  if (!funcionario || funcionario.administrador || funcionario.loja !== sessao.loja) {
    throw new Error("Você só pode acessar mapas da sua própria loja.");
  }
}

/* ============================================================
   AUTORIZAÇÃO CENTRAL DAS AÇÕES GET
   ============================================================ */

/**
 * Executa um diagnóstico somente de leitura da planilha.
 * Para usar: abra o editor do Apps Script, selecione verificarPlanilha e clique em Executar.
 * O resultado completo fica no Registro de execução.
 */
function verificarPlanilha() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const resultados = [];
  const cadastro = ss.getSheetByName("Funcionarios");
  const aliasesPorCabecalho = {
    "nome": ["funcionario", "funcionario nome", "nome do funcionario"],
    "codigo de barras": ["codigo", "ean"],
    "chave unica": ["chave unica origem"],
    "aba de origem": ["aba origem", "funcionario", "mapa de origem"]
  };
  const verificar = (nome, obrigatorias) => {
    const sh = ss.getSheetByName(nome);
    if (!sh) {
      resultados.push({ aba: nome, status: "ERRO", mensagem: "Aba não encontrada.", faltantes: obrigatorias, linhas: 0 });
      return;
    }
    const lc = Math.max(sh.getLastColumn(), 1);
    const headers = sh.getRange(1, 1, 1, lc).getDisplayValues()[0].map(h => normalizarTexto_(h).replace(/\s+/g, " "));
    const faltantes = obrigatorias.filter(h => {
      const chave = normalizarTexto_(h).replace(/\s+/g, " ");
      return !headers.includes(chave) && !(aliasesPorCabecalho[chave] || []).some(a => headers.includes(a));
    });
    const status = faltantes.length ? "ATENÇÃO" : "OK";
    resultados.push({ aba: nome, status, mensagem: faltantes.length ? "Faltam cabeçalhos obrigatórios." : "Estrutura básica encontrada.", faltantes, linhas: Math.max(0, sh.getLastRow() - 1), colunas: lc });
  };

  verificar("Funcionarios", ["nome"]);
  const nomesMapas = [];
  if (cadastro && cadastro.getLastRow() >= 2) {
    const funcionarios = cadastro.getRange(2, 1, cadastro.getLastRow() - 1, 9).getValues();
    funcionarios.forEach(row => {
      const nome = String(row[0] || "").trim();
      const administrador = ehAdministradorValor_(row[7]);
      if (nome && !administrador && !nomesMapas.includes(nome)) nomesMapas.push(nome);
    });
  }
  nomesMapas.forEach(nome => verificar(nome, ["Código de Barras", "Lote", "Validade", "Quantidade", "Data de Lançamento", "Chave Única"]));
  verificar("Transferencias", CABECALHOS_TRANSFERENCIAS);
  verificar("Queima", ["Código de Barras", "Lote", "Validade", "Quantidade", "Aba de Origem", "Chave Única", "LojaOrigem"]);
  verificar("Vencidos", ["Aba de origem", "Linha original", "Código", "Descrição", "Lote", "Validade", "Quantidade", "Data de Registro / Mês de Lançamento", "EAN interno", "Chave Única", "LojaOrigem"]);
  verificar("Sinalizacao", ["Chave Unica", "Funcionario", "Motivo", "Ação Tomada", "Data de Registro", "LojaOrigem"]);

  // Verifica dados obrigatórios nas abas compartilhadas, sem modificar registros.
  const avisarVazios = (nome, cabecalho, rotulo) => {
    const sh = ss.getSheetByName(nome);
    if (!sh || sh.getLastRow() < 2) return;
    const lc = sh.getLastColumn();
    const heads = sh.getRange(1, 1, 1, lc).getDisplayValues()[0].map(h => normalizarTexto_(h).replace(/\s+/g, " "));
    const aliases = aliasesPorCabecalho[normalizarTexto_(cabecalho).replace(/\s+/g, " ")] || [];
    const idx = heads.indexOf(normalizarTexto_(cabecalho).replace(/\s+/g, " ")) >= 0
      ? heads.indexOf(normalizarTexto_(cabecalho).replace(/\s+/g, " ")) : heads.findIndex(h => aliases.includes(h));
    if (idx < 0) return;
    const rows = sh.getRange(2, 1, sh.getLastRow() - 1, lc).getDisplayValues();
    const vazios = rows.filter(row => !String(row[idx] || "").trim()).length;
    if (vazios) {
      const item = resultados.find(r => r.aba === nome);
      if (item) { item.avisos = item.avisos || []; item.avisos.push(vazios + " registro(s) sem " + rotulo + "."); if (item.status === "OK") item.status = "ATENÇÃO"; }
    }
  };
  avisarVazios("Queima", "LojaOrigem", "LojaOrigem");
  avisarVazios("Queima", "Chave Única", "Chave Única");
  avisarVazios("Vencidos", "LojaOrigem", "LojaOrigem");
  avisarVazios("Sinalizacao", "LojaOrigem", "LojaOrigem");
  avisarVazios("Transferencias", "Loja de Origem", "Loja de Origem");

  if (cadastro && cadastro.getLastRow() >= 2) {
    const funcionarios = cadastro.getRange(2, 1, cadastro.getLastRow() - 1, 9).getDisplayValues();
    const semAba = funcionarios.filter(row => String(row[0] || "").trim() && !ehAdministradorValor_(row[7]) && !ss.getSheetByName(String(row[0]).trim())).length;
    if (semAba) {
      const item = resultados.find(r => r.aba === "Funcionarios");
      if (item) { item.avisos = item.avisos || []; item.avisos.push(semAba + " funcionário(s) sem aba de mapa correspondente."); item.status = "ERRO"; }
    }
  }

  const resumo = {
    total: resultados.length,
    erros: resultados.filter(r => r.status === "ERRO").length,
    atencoes: resultados.filter(r => r.status === "ATENÇÃO").length,
    corretos: resultados.filter(r => r.status === "OK").length
  };
  const relatorio = { executadoEm: new Date().toISOString(), resumo, resultados };
  Logger.log("===== DIAGNÓSTICO DA PLANILHA =====");
  Logger.log(JSON.stringify(relatorio, null, 2));
  console.log(JSON.stringify(relatorio, null, 2));
  return relatorio;
}

function bloquearSeNaoAutorizado_(p) {
  const acao = String(p.action || "");

  // Ações públicas necessárias para a tela de login.
  const publicas = [
    "login",
    "sessao",
    "logout"
  ];

  if (publicas.includes(acao)) {
    return null;
  }

  let sessao;

  try {
    sessao = obterSessaoObrigatoria_(p);
  } catch (erro) {
    const callback = String(p.callback || "");

    if (/^[A-Za-z_][A-Za-z0-9_]{0,60}$/.test(callback)) {
      return respostaJsonp_(callback, {
        sucesso: false,
        precisaLogin: true,
        mensagem: mensagemErro_(erro)
      });
    }

    return respostaTexto_("Acesso negado. Faça login.");
  }

  const acoesAdmin = [
    "dashboardPainel",
    "vencidosPainel",
    "consultarQueima",
    "consultarSinalizados",
    "funcionariosAdmin",
    "adicionarFuncionario",
    "renomearFuncionario",
    "definirEspecialFuncionario",
    "marcarCheckFuncionario",
    "inativarFuncionario",
    "definirPinFuncionario",
    "retirarDeLoja",
    "adicionarDanificado",
    "adicionarAoQueima",
    "aprovarQueima",
    "relancarQueima",
    "atualizarSinalizado",
    "subirVencidos",
    "subirParaVencidos",
    "listarEstoqueVencidos",
    "encaminharEstoqueMapa",
    "adicionarProdutoJson",
    "cadastrarQueimaManual",
    "listarAdminsLojas", "criarAdminLoja"
  ];

  if (
    acoesAdmin.includes(acao) &&
    sessao.administrador !== true
  ) {
    const callback = String(p.callback || "");

    return respostaJsonp_(callback, {
      sucesso: false,
      mensagem: "Ação exclusiva para administradores."
    });
  }

  // Ações de consulta do mapa podem ser feitas por funcionários
  // e administradores. Os resultados serão filtrados pelas abas permitidas.
  const acoesMapa = [
    "status",
    "historicoMes",
    "validades",
    "verificarItemMapa",
    "verificarChaveLancamento",
    "funcionarios", // Lista de abas permitidas; o endpoint filtra por perfil e loja.
    "editarLancamento",
    "excluirLancamento",
    "adicionarValidadeManual",
    "sinalizarLancamento",
    "atividade" // renova somente a janela de inatividade da sessão autenticada
  ];

  if (
    !acoesAdmin.includes(acao) &&
    !acoesMapa.includes(acao)
  ) {
    const callback = String(p.callback || "");

    return respostaJsonp_(callback, {
      sucesso: false,
      mensagem: "Ação não autorizada."
    });
  }

  return null;
}

/**
 * Retorna um mapa: nome do funcionário -> número da loja.
 */
function obterMapaLojasFuncionarios_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const cadastro = ss.getSheetByName("Funcionarios");
  const mapa = {};

  if (!cadastro || cadastro.getLastRow() < 2) return mapa;

  const dados = cadastro.getRange(
    2, 1, cadastro.getLastRow() - 1, 9
  ).getDisplayValues();

  dados.forEach(linha => {
    const nome = String(linha[0] || "").trim();
    const loja = normalizarLoja_(linha[8]);

    if (nome && loja) {
      mapa[normalizarTexto_(nome)] = loja;
    }
  });

  return mapa;
}


/**
 * Garante a coluna K na aba Vencidos e preenche registros antigos
 * quando a loja pode ser identificada pelo nome da aba de origem.
 */

/* =========================
   VENCIDOS DO ESTOQUE
   ========================= */
function listarEstoqueVencidos_(p) {
  const cb = String(p.callback || "");
  if (cb !== "__estoqueVencidosCb") return respostaTexto_("Callback inválido.");
  try {
    const admin = exigirAdministrador_ (p);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = ss.getSheetByName("Estoque");
    const registros = [];
    if (sh && sh.getLastRow() > 1) {
      const vals = sh.getRange(2, 1, sh.getLastRow() - 1, 11).getValues();
      vals.forEach((r, i) => {
        if (normalizarLoja_(r[7]) !== normalizarLoja_(admin.loja)) return;
        if (String(r[9] || "Disponível") !== "Disponível") return;
        registros.push({ linha: i + 2, codigo: String(r[0] || ""), codigoInterno: String(r[1] || ""), descricao: String(r[2] || ""), lote: String(r[3] || ""), validade: r[4] instanceof Date ? Utilities.formatDate(r[4], Session.getScriptTimeZone(), "dd/MM/yyyy") : String(r[4] || ""), quantidade: Number(r[5] || 0), dataRegistro: r[6] instanceof Date ? Utilities.formatDate(r[6], Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm") : String(r[6] || ""), lojaOrigem: String(r[7] || ""), chaveUnica: String(r[8] || "") });
      });
    }
    return respostaJsonp_(cb, { sucesso: true, registros: registros });
  } catch (e) { return respostaJsonp_(cb, { sucesso: false, mensagem: mensagemErro_(e), registros: [] }); }
}

function encaminharEstoqueMapa_(p) {
  const cb = String(p.callback || "");
  if (cb !== "__encaminharEstoqueMapaCb") return respostaTexto_("Callback inválido.");
  try {
    const admin = exigirAdministrador_(p);
    const chave = String(p.chaveUnica || "").trim();
    const funcionario = String(p.funcionario || "").trim();
    if (!chave || !funcionario) throw new Error("Selecione um registro e um funcionário de destino.");
    if (funcionario === "Transferencias" || obterAbasEspeciais_().includes(funcionario)) throw new Error("Estoque só pode ser encaminhado para o mapa individual de um funcionário.");
    const destino = buscarFuncionarioPorNome_(funcionario);
    if (!destino || destino.administrador || destino.administradorGeral || destino.especial || destino.loja !== normalizarLoja_(admin.loja)) throw new Error("Funcionário de destino inválido para esta loja.");
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const estoque = ss.getSheetByName("Estoque");
    if (!estoque || estoque.getLastRow() < 2) throw new Error("Não há vencidos cadastrados no Estoque.");
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) throw new Error("Sistema ocupado. Tente novamente.");
    try {
      const dados = estoque.getRange(2, 1, estoque.getLastRow() - 1, 11).getDisplayValues();
      const idx = dados.findIndex(r => String(r[8] || "") === chave && normalizarLoja_(r[7]) === normalizarLoja_(admin.loja));
      if (idx < 0) throw new Error("Registro não encontrado para esta loja.");
      const row = dados[idx];
      if (String(row[9] || "Disponível") !== "Disponível") throw new Error("Este registro já foi encaminhado ou não está disponível.");
      const mapa = ss.getSheetByName(destino.nome);
      if (!mapa) throw new Error("A aba do funcionário não foi encontrada.");
      const novaChave = Utilities.getUuid();
      const novaLinha = Math.max(mapa.getLastRow() + 1, 2);
      mapa.getRange(novaLinha, 1).setNumberFormat("@");
      const partesValidadeEstoque = String(row[4] || "").split(/[\/.-]/);
      const validadeMapa = partesValidadeEstoque.length === 3
        ? new Date(Number(partesValidadeEstoque[2]), Number(partesValidadeEstoque[1]) - 1, Number(partesValidadeEstoque[0]))
        : new Date(row[4]);
      if (isNaN(validadeMapa.getTime())) throw new Error("A validade do registro no Estoque está inválida.");
      mapa.getRange(novaLinha, 1, 1, 6).setValues([[String(row[0] || ""), String(row[3] || ""), validadeMapa, Number(row[5] || 0), new Date(), novaChave]]);
      mapa.getRange(novaLinha, 3).setNumberFormat("dd/MM/yyyy");
      mapa.getRange(novaLinha, 5).setNumberFormat("dd/MM/yyyy HH:mm");
      estoque.getRange(idx + 2, 10).setValue("Encaminhado");
      estoque.getRange(idx + 2, 11).setValue(destino.nome);
      SpreadsheetApp.flush();
      invalidarCacheDados_();
      return respostaJsonp_(cb, { sucesso: true, mensagem: "Vencido encaminhado para " + destino.nome + "." });
    } finally { lock.releaseLock(); }
  } catch (e) { return respostaJsonp_(cb, { sucesso: false, mensagem: mensagemErro_(e) }); }
}

function garantirLojaOrigemVencidos_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName("Vencidos");

  if (!sh) return;

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 11).setValue("LojaOrigem");
    return;
  }

  sh.getRange(1, 11).setValue("LojaOrigem");

  if (sh.getLastRow() < 2) return;

  const mapaLojas = obterMapaLojasFuncionarios_();
  const dados = sh.getRange(
    2, 1, sh.getLastRow() - 1, 11
  ).getDisplayValues();

  const atualizacoes = [];

  dados.forEach((linha, i) => {
    const lojaAtual = String(linha[10] || "").trim();

    if (lojaAtual) return;

    const abaOrigem = String(linha[0] || "").trim();

    // Registros antigos de Transferencias não têm origem recuperável
    // com segurança apenas pelo nome da aba.
    if (!abaOrigem || abaOrigem === "Transferencias") return;

    const loja = mapaLojas[normalizarTexto_(abaOrigem)] || "";

    if (loja) {
      atualizacoes.push({
        linha: i + 2,
        loja: loja
      });
    }
  });

  atualizacoes.forEach(item => {
    sh.getRange(item.linha, 11).setValue(item.loja);
  });

  SpreadsheetApp.flush();
}


/**
 * Garante a coluna F na aba Sinalizacao e recupera a loja
 * dos registros antigos pelo funcionário.
 */
function garantirLojaOrigemSinalizacao_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName("Sinalizacao");

  if (!sh) return;

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 6).setValue("LojaOrigem");
    return;
  }

  sh.getRange(1, 6).setValue("LojaOrigem");

  if (sh.getLastRow() < 2) return;

  const mapaLojas = obterMapaLojasFuncionarios_();
  const dados = sh.getRange(
    2, 1, sh.getLastRow() - 1, 6
  ).getDisplayValues();

  dados.forEach((linha, i) => {
    const lojaAtual = String(linha[5] || "").trim();

    if (lojaAtual) return;

    const funcionario = normalizarTexto_(linha[1] || "");
    const loja = mapaLojas[funcionario] || "";

    if (loja) {
      sh.getRange(i + 2, 6).setValue(loja);
    }
  });

  SpreadsheetApp.flush();
}

