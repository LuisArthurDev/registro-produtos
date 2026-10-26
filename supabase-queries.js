window.supabaseQueries = (function () {
  const supabase = window.supabase;

  const normalizeText = (value) => String(value ?? "").trim();
  const toDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const formatIsoDate = (value) => {
    const date = toDate(value);
    if (!date) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const formatPtDate = (value) => {
    const date = toDate(value);
    if (!date) return "";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(date);
  };
  const formatPtDateTime = (value) => {
    const date = toDate(value);
    if (!date) return "";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(date);
  };

  const normalizeFuncionario = (value) => normalizeText(value).replace(/\s+/g, " ");

  const getFuncionarioByName = async (name) => {
    const normalized = normalizeFuncionario(name);
    if (!normalized) return null;

    const { data, error } = await supabase
      .from("funcionarios")
      .select("id, nome, aba_planilha")
      .ilike("nome", normalized)
      .maybeSingle();

    if (error) throw error;
    return data;
  };

  const ensureFuncionario = async (name) => {
    const normalized = normalizeFuncionario(name);
    if (!normalized) return null;

    let funcionario = await getFuncionarioByName(normalized);

    if (!funcionario) {
      const { data, error } = await supabase
        .from("funcionarios")
        .insert([
          {
            nome: normalized,
            aba_planilha: normalized,
            ativo: true
          }
        ])
        .select("id, nome, aba_planilha")
        .single();

      if (error) throw error;
      funcionario = data;
    }

    return funcionario;
  };

  const mapLancamento = (row) => {
    const validadeDate = toDate(row.validade);
    const registradoEm = toDate(row.data_registro);

    const funcionarioNome = normalizeText(row.funcionario) ||
      (row.funcionarios && normalizeText(row.funcionarios.nome)) ||
      "";

    const codigo = normalizeText(row.ean || row.codigo_interno || "");

    return {
      funcionario: funcionarioNome,
      codigo: codigo,
      lote: normalizeText(row.lote),
      validade: validadeDate ? formatPtDate(validadeDate) : "",
      validadeISO: validadeDate ? formatIsoDate(validadeDate) : "",
      quantidade: Number(row.quantidade) || 0,
      dataLancamento: registradoEm ? formatPtDateTime(registradoEm) : "",
      ts: registradoEm ? registradoEm.getTime() : 0,
      especial: Boolean(row.tipo_operacao === "especial"),
      chaveUnica: row.id || row.chave_unica || "",
      mesLancamento: registradoEm ? `${registradoEm.getFullYear()}-${String(registradoEm.getMonth() + 1).padStart(2, "0")}` : "",
      lojaOrigem: normalizeText(row.origem),
      romaneio: normalizeText(row.romaneio),
      origem: normalizeText(row.origem),
      noQueima: Boolean(row.no_queima),
      queimaAprovada: row.queima_aprovada === true,
      tipoOperacao: normalizeText(row.tipo_operacao)
    };
  };

  const mapSinalizacao = (row) => ({
    id: row.id,
    chaveUnica: row.chave_unica,
    funcionario: row.funcionario,
    motivo: row.motivo,
    acaoTomada: row.acao_tomada,
    dataRegistro: row.data_registro,
    createdAt: row.created_at
  });

  const salvarLancamento = async (payload = {}) => {
    const funcionarioNome = normalizeFuncionario(payload.funcionario);
    if (!funcionarioNome) {
      throw new Error("Selecione um funcionário válido.");
    }

    if (!normalizeText(payload.codigo || payload.ean)) {
      throw new Error("Informe o código de barras.");
    }

    if (!normalizeText(payload.lote)) {
      throw new Error("Informe o lote.");
    }

    if (!payload.validade) {
      throw new Error("Informe a validade.");
    }

    const quantidadeNumero = Number(payload.quantidade ?? 0);
    if (!Number.isFinite(quantidadeNumero) || quantidadeNumero < 1) {
      throw new Error("A quantidade deve ser maior que zero.");
    }

    const validadeStr = formatIsoDate(payload.validade);
    if (!validadeStr) {
      throw new Error("A validade informada não é válida.");
    }

    const funcionario = await ensureFuncionario(funcionarioNome);
    if (!funcionario) {
      throw new Error("Funcionário não encontrado.");
    }

    const tipoOperacao = funcionarioNome === "Transferencias" ? "transferencia" : "mapa";
    const codigo = normalizeText(payload.codigo || payload.ean);
    const lote = normalizeText(payload.lote).toUpperCase();
    const dataRegistro = new Date().toISOString();

    let origem = normalizeText(payload.origem || payload.lojaOrigem || "");
    if (funcionarioNome === "Transferencias") {
      const numeroLoja = normalizeText(payload.lojaOrigem || payload.origem || "").replace(/^V/i, "");
      if (!/^\d{1,10}$/.test(numeroLoja)) {
        throw new Error("Informe somente o número da loja de origem.");
      }
      origem = `V${numeroLoja}`;
    }

    const { data, error } = await supabase
      .from("lancamentos")
      .insert([
        {
          ean: codigo,
          codigo_interno: codigo,
          descricao: normalizeText(payload.descricao || ""),
          funcionario: funcionarioNome,
          funcionario_id: funcionario.id,
          lote,
          validade: validadeStr,
          quantidade: quantidadeNumero,
          data_registro: dataRegistro,
          tipo_operacao: tipoOperacao,
          romaneio: normalizeText(payload.romaneio || ""),
          origem: origem || null,
          no_queima: false,
          queima_aprovada: false,
          origem_planilha: payload.origem_planilha || null,
          origem_aba: payload.origem_aba || null,
          origem_linha: payload.origem_linha || null,
          dados_origem: payload.dados_origem || {}
        }
      ])
      .select("id")
      .single();

    if (error) throw error;

    return {
      status: "saved",
      message: "Lançamento salvo com sucesso no Supabase.",
      id: data?.id || null
    };
  };

  const consultarHistoricoMes = async (mes = "TODOS") => {
    const query = supabase.from("lancamentos").select("*, funcionarios ( id, nome, aba_planilha )");

    if (mes && mes !== "TODOS") {
      if (!/^\d{4}-\d{2}$/.test(mes)) {
        return { sucesso: false, mensagem: "Mês inválido.", registros: [] };
      }

      const [ano, mesNumero] = mes.split("-");
      const inicio = new Date(Number(ano), Number(mesNumero) - 1, 1, 0, 0, 0, 0).toISOString();
      const fim = new Date(Number(ano), Number(mesNumero), 0, 23, 59, 59, 999).toISOString();

      query.gte("data_registro", inicio).lte("data_registro", fim);
    }

    const { data, error } = await query.order("data_registro", { ascending: false });
    if (error) throw error;

    return {
      sucesso: true,
      mes: mes,
      registros: (data || []).map(mapLancamento)
    };
  };

  const consultarValidades = async () => {
    const { data, error } = await supabase
      .from("lancamentos")
      .select("*, funcionarios ( id, nome, aba_planilha )")
      .not("validade", "is", null)
      .order("validade", { ascending: true });

    if (error) throw error;

    return {
      sucesso: true,
      registros: (data || []).map(mapLancamento)
    };
  };

  const registrarSinalizacao = async (payload = {}) => {
    const chaveUnica = normalizeText(payload.chaveUnica || payload.chave_unica || payload.id || "");
    const funcionarioNome = normalizeFuncionario(payload.funcionario);
    const motivo = normalizeText(payload.motivo || "");

    if (!chaveUnica) {
      throw new Error("Chave única não informada.");
    }
    if (!funcionarioNome) {
      throw new Error("Selecione um funcionário válido para registrar a sinalização.");
    }
    if (!motivo) {
      throw new Error("Informe o motivo da sinalização.");
    }

    const funcionario = await ensureFuncionario(funcionarioNome);
    const { error } = await supabase
      .from("sinalizacao")
      .insert([
        {
          chave_unica: chaveUnica,
          funcionario: funcionarioNome,
          funcionario_id: funcionario?.id || null,
          motivo,
          acao_tomada: "Em Aberto",
          data_registro: new Date().toISOString()
        }
      ]);

    if (error) throw error;

    return {
      sucesso: true,
      mensagem: "Sinalização registrada como Em Aberto."
    };
  };

  const consultarSinalizados = async () => {
    const { data, error } = await supabase
      .from("sinalizacao")
      .select("*")
      .order("data_registro", { ascending: false });

    if (error) throw error;

    return {
      sucesso: true,
      registros: (data || []).map(mapSinalizacao)
    };
  };

  const atualizarSinalizado = async (payload = {}) => {
    const chave = normalizeText(payload.chaveUnica || payload.chave_unica || "");
    const status = normalizeText(payload.status || "");
    const motivoResolucao = normalizeText(payload.motivoResolucao || "");

    if (!chave) {
      throw new Error("Chave única não informada.");
    }
    if (!["Resolvido", "Negado"].includes(status)) {
      throw new Error("Selecione Resolvido ou Negado.");
    }
    if (status === "Resolvido" && !motivoResolucao) {
      throw new Error("Informe o motivo da resolução.");
    }

    const { data, error } = await supabase
      .from("sinalizacao")
      .select("id, motivo")
      .eq("chave_unica", chave)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      throw new Error("Sinalização não encontrada.");
    }

    const motivoFinal = status === "Resolvido"
      ? `${data.motivo} | Resolução: ${motivoResolucao}`
      : data.motivo;

    const { error: updateError } = await supabase
      .from("sinalizacao")
      .update({
        motivo: motivoFinal,
        acao_tomada: status,
        data_registro: new Date().toISOString()
      })
      .eq("id", data.id);

    if (updateError) throw updateError;

    return {
      sucesso: true,
      mensagem: `Sinalização atualizada para ${status}.`
    };
  };

  const editarLancamento = async (payload = {}) => {
    const chave = normalizeText(payload.chaveUnica || payload.chave_unica || payload.id || "");
    const lote = normalizeText(payload.lote || "").toUpperCase();
    if (!chave) {
      throw new Error("Chave única não informada.");
    }
    if (!lote) {
      throw new Error("Informe o lote.");
    }

    const validadeStr = formatIsoDate(payload.validade);
    if (!validadeStr) {
      throw new Error("A validade informada não é válida.");
    }

    const quantidade = Number(payload.quantidade ?? 0);
    if (!Number.isFinite(quantidade) || quantidade < 1) {
      throw new Error("A quantidade deve ser maior que zero.");
    }

    const { error } = await supabase
      .from("lancamentos")
      .update({
        lote,
        validade: validadeStr,
        quantidade,
        updated_at: new Date().toISOString()
      })
      .eq("id", chave);

    if (error) throw error;

    return {
      sucesso: true,
      mensagem: "Lançamento atualizado com sucesso."
    };
  };

  const excluirLancamento = async (payload = {}) => {
    const chave = normalizeText(payload.chaveUnica || payload.chave_unica || payload.id || "");
    if (!chave) {
      throw new Error("Chave única não informada.");
    }

    const { error } = await supabase
      .from("lancamentos")
      .delete()
      .eq("id", chave);

    if (error) throw error;

    return {
      sucesso: true,
      mensagem: "Lançamento removido com sucesso."
    };
  };

  const executeAction = async (action, callbackName, extra = {}) => {
    const normalizedAction = String(action || "").trim();

    try {
      switch (normalizedAction) {
        case "historicoMes":
          return await consultarHistoricoMes(extra.mes || "TODOS");
        case "validades":
          return await consultarValidades();
        case "sinalizarLancamento":
          return await registrarSinalizacao(extra);
        case "consultarSinalizados":
          return await consultarSinalizados();
        case "atualizarSinalizado":
          return await atualizarSinalizado(extra);
        case "editarLancamento":
          return await editarLancamento(extra);
        case "excluirLancamento":
          return await excluirLancamento(extra);
        default:
          return {
            sucesso: false,
            mensagem: `Ação não implementada: ${normalizedAction}`,
            registros: []
          };
      }
    } catch (error) {
      return {
        sucesso: false,
        mensagem: error?.message || "Erro ao consultar o Supabase.",
        registros: []
      };
    }
  };

  const executeFetchAction = async (url, init = {}) => {
    const parsed = new URL(url, window.location.href);
    const action = parsed.searchParams.get("action");
    const rawParams = Object.fromEntries(parsed.searchParams.entries());
    const payload = { ...rawParams, ...(init && init.body ? JSON.parse(init.body) : {}) };

    const result = await executeAction(action, rawParams.callback || "", payload);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  return {
    normalizeFuncionario,
    ensureFuncionario,
    salvarLancamento,
    consultarHistoricoMes,
    consultarValidades,
    registrarSinalizacao,
    consultarSinalizados,
    atualizarSinalizado,
    editarLancamento,
    excluirLancamento,
    executeAction,
    executeFetchAction
  };
})();
