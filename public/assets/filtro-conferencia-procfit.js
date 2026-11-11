/* Conferência e exportação para Procfit: permitir mapas de funcionários e
 * a ÚNICA aba especial Estoque. Não altera as outras abas do sistema. */
const texto = valor => String(valor ?? '').trim();
const chave = valor => texto(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const ESPECIAIS_EXCLUIDAS = new Set(['termolabil', 'psicotropicos', 'antibioticos']);

export function mapaElegivelParaConferencia(registro) {
  if (!registro || typeof registro !== 'object') return false;
  const tipo = chave(registro.tipo_mapa ?? registro.tipoMapa);
  const nome = chave(registro.mapa_nome ?? registro.mapa);
  // Defesa contra registros legados com tipo_mapa inconsistente.
  if (ESPECIAIS_EXCLUIDAS.has(tipo) || ESPECIAIS_EXCLUIDAS.has(nome)) return false;
  if (tipo === 'funcionario') return true;
  // Apenas a aba especial Estoque; nunca incluir outras abas especiais.
  return tipo === 'estoque' && nome === 'estoque';
}

export function filtrarMapasParaConferencia(registros) {
  return (registros || []).filter(mapaElegivelParaConferencia);
}
