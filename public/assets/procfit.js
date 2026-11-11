/* Exportação de lançamentos para o Conector Procfit v1.0.
 * TSV (tabulações) para colar diretamente, preservando zeros à esquerda.
 * Não altera dados do mapa, do estoque ou do Procfit.
 */
export const CABECALHO_PROCFIT = ['Código Interno', 'EAN', 'Lote', 'Validade', 'Quantidade'];

const textoCelula = valor => String(valor ?? '').replace(/[\t\r\n\u0000-\u001f\u007f]/g, ' ').trim();

export function dataProcfit(valor) {
  const s = textoCelula(valor);
  let dia, mes, ano;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (iso) [, ano, mes, dia] = iso;
  else if (br) [, dia, mes, ano] = br;
  else return '';
  dia = Number(dia); mes = Number(mes); ano = Number(ano);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return '';
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`;
}

/**
 * @param {Array} registros Lista já filtrada pela UI (todas as páginas).
 * @param {{corrigido?: boolean}} options A interface usa somente os saldos corrigidos na conferência.
 * @returns {{texto:string,total:number,ignorados:{zerados:number,semSaldo:number,invalidos:number}}}
 */
export function montarListaProcfit(registros, {corrigido = false} = {}) {
  const linhas = [], ignorados = {zerados: 0, semSaldo: 0, invalidos: 0};
  for (const r of registros || []) {
    const codigo = textoCelula(r.codigoInterno ?? r.codigo_interno);
    const ean = textoCelula(r.ean);  // Nunca converter EAN para Number.
    const lote = textoCelula(r.lote);
    const validade = dataProcfit(r.validade);
    const bruto = corrigido ? r.quantidadeCorrigida : r.quantidade;
    if (corrigido && (bruto === null || bruto === undefined || bruto === '')) {
      ignorados.semSaldo++;
      continue;
    }
    const qtd = Number(bruto);
    if ((!codigo && !ean) || !lote || !validade || bruto === null || bruto === undefined || bruto === '' || !Number.isSafeInteger(qtd) || qtd < 0) {
      ignorados.invalidos++;
      continue;
    }
    if (qtd === 0) {
      ignorados.zerados++;
      continue;
    }
    linhas.push([codigo, ean, lote, validade, String(qtd)].join('\t'));
  }
  return {
    texto: [CABECALHO_PROCFIT.join('\t'), ...linhas].join('\r\n'),
    total: linhas.length,
    ignorados
  };
}

/** Clipboard API preferencial; fallback para navegadores sem permissão de escrita. */
export async function copiarListaProcfit(texto, {clipboard = globalThis.navigator?.clipboard, documento = globalThis.document} = {}) {
  let erro;
  if (clipboard && typeof clipboard.writeText === 'function') {
    try {await clipboard.writeText(texto);return true;} catch (e) {erro = e;}
  }
  if (documento?.createElement && documento?.execCommand) {
    const campo = documento.createElement('textarea');
    campo.value = texto;
    campo.setAttribute('readonly', '');
    campo.style.position = 'fixed'; campo.style.left = '-9999px';
    // Em dialog.showModal(), elementos fora do dialog ficam inertes.
    // Anexe o campo temporário ao diálogo aberto para permitir focus/select/copy.
    const destino = documento.querySelector?.('dialog[open]') || documento.body;
    destino.appendChild(campo);
    try {
      campo.focus(); campo.select();
      if (documento.execCommand('copy')) return true;
    } finally {campo.remove();}
  }
  throw new Error(erro?.message ? `Não foi possível copiar: ${erro.message}` : 'Não foi possível acessar a área de transferência. Verifique a permissão do navegador.');
}
