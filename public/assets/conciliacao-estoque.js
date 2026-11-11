/* Conferência somente leitura entre mapas e saldo já importado em Controle de Estoque.
   O estoque é por PRODUTO, não por lote: distribuímos o saldo uma única vez,
   priorizando as validades mais próximas, para não multiplicar o saldo nos lotes. */
const txt = value => String(value ?? '').trim();
const numero = value => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
export function conciliarMapaComEstoque(mapa, estoque) {
  const porEan = new Map(), porCodigo = new Map();
  for (const item of estoque || []) {
    const ean = txt(item.ean), codigo = txt(item.codigo_interno || item.codigoInterno);
    if (ean) porEan.set(ean, item);
    if (codigo) {
      if (!porCodigo.has(codigo)) porCodigo.set(codigo, []);
      porCodigo.get(codigo).push(item);
    }
  }
  const grupos = new Map();
  const itens = (mapa || []).map((r, ordem) => {
    const ean = txt(r.ean), codigo = txt(r.codigoInterno || r.codigo_interno);
    // Um código interno repetido entre EANs não pode gerar associação equivocada.
    const candidatos = codigo ? porCodigo.get(codigo) || [] : [];
    const peloCodigo = candidatos.length === 1 && (!ean || txt(candidatos[0].ean) === ean)
      ? candidatos[0] : null;
    const stock = peloCodigo || porEan.get(ean) || null;
    const quantidadeMapa = numero(r.quantidade) ?? 0;
    const item = {
      id: r.id, ean, codigoInterno: codigo || txt(stock?.codigo_interno),
      lote: txt(r.lote), validade: txt(r.validade).slice(0, 10),
      descricao: txt(r.descricao || stock?.descricao), mapa: txt(r.mapa_nome), tipoMapa: txt(r.tipo_mapa),
      quantidadeMapa, quantidadeEstoque: stock ? numero(stock.quantidade) : 0,
      quantidadeCorrigida: stock ? null : 0, situacao: stock ? 'conferido' : 'nao_localizado',
      estoqueAtualizadoEm: stock?.atualizado_em || null, _ordem: ordem
    };
    if (stock) {
      const chave = txt(stock.ean) || `cod:${txt(stock.codigo_interno)}`;
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(item);
      if (item.quantidadeEstoque === null) item.situacao = 'saldo_invalido';
    }
    return item;
  });
  for (const lista of grupos.values()) {
    lista.sort((a, b) => a.validade.localeCompare(b.validade) || a._ordem - b._ordem);
    let restante = Math.floor(lista[0].quantidadeEstoque ?? 0);
    for (const item of lista) {
      if (item.quantidadeEstoque === null) continue;
      item.quantidadeCorrigida = Math.max(0, Math.min(item.quantidadeMapa, restante));
      restante = Math.max(0, restante - item.quantidadeCorrigida);
      if (item.quantidadeCorrigida < item.quantidadeMapa) item.situacao = 'reduzido';
    }
  }
  const resumo = {
    registros: itens.length,
    unidadesMapa: itens.reduce((s, x) => s + x.quantidadeMapa, 0),
    unidadesCorrigidas: itens.reduce((s, x) => s + (x.quantidadeCorrigida ?? 0), 0),
    naoEncontrados: itens.filter(x => x.situacao === 'nao_localizado').length,
    registrosReduzidos: itens.filter(x => x.situacao === 'reduzido').length
  };
  return {itens, resumo};
}
