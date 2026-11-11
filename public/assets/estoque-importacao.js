/* Leitura e validação do relatório "Estoque" exportado pelo Procfit.
 * Não transforma o EAN em número: zeros à esquerda são dados, não formatação.
 * Linhas sem EAN podem ser recuperadas no servidor por Código Interno, quando a
 * correspondência com o catálogo for única e verificável.
 */
export const CAMPOS_ESTOQUE = ['codigo_interno', 'ean', 'descricao', 'secao', 'quantidade'];
const limpar = v => String(v ?? '').trim();
const coluna = v => limpar(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[\s.\-_]+/g,'_').replace(/^_+|_+$/g,'');
const aliases = {
  ean: ['ean', 'codigo_ean', 'codigo_de_barras', 'codigo_barras'],
  codigo_interno: ['codigo_interno', 'cod_interno', 'produto', 'codigo_produto', 'cod_produto', 'codigo'],
  descricao: ['descricao', 'nome_produto', 'produto_descricao', 'nome'],
  secao: ['secao', 'departamento'],
  quantidade: ['saldo', 'quantidade', 'saldo_total', 'estoque'],
  empresa: ['empresa'],
  centro: ['c_estoque', 'centro_estoque', 'cestoque']
};
export function numeroSaldoProcfit(valor) {
  let s=limpar(valor).replace(/\s+/g,'').replace(/\u00a0/g,'');
  if(!s)return null;
  // Admite inteiros, casas decimais com vírgula e agrupamentos brasileiros.
  if(/^[-+]?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s))s=s.replace(/\./g,'').replace(',','.');
  else if(/^[-+]?\d+(?:,\d+)?$/.test(s))s=s.replace(',','.');
  if(!/^[-+]?\d+(?:\.\d+)?$/.test(s))return null;
  const n=Number(s);
  return Number.isFinite(n) && n>=0 ? n : null;
}
export function identificarCabecalhoEstoque(linhas) {
  const limite=Math.min(linhas?.length||0,25);
  for(let n=0;n<limite;n++){
    const headers=(linhas[n]||[]).map(coluna);
    const indices={};
    for(const [campo,nomes] of Object.entries(aliases))indices[campo]=nomes.map(s=>headers.indexOf(s)).find(i=>i>=0)??-1;
    if(indices.ean>=0 && indices.quantidade>=0)return {linha:n,indices,headers};
  }
  throw new Error('Cabeçalho não encontrado: o arquivo precisa das colunas EAN e Saldo (ou Quantidade).');
}
const naoMostrarSecao = secao => new Set(['brinde','brindes','default','servico','servicos','servicoes'])
 .has(limpar(secao).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase());
export function prepararImportacaoEstoque(linhas,{loja=''}={}) {
  const {linha,indices}=identificarCabecalhoEstoque(linhas);
  const get=(r,n)=>indices[n] < 0 ? '' : limpar(r[indices[n]]);
  const itens=[];
  const resumo={lidas:0,aptas:0,pendentesCodigo:0,semIdentificador:0,saldoInvalido:0,outraLoja:0,secaoIgnorada:0,vazias:0,cabecalho:linha+1};
  const amostras=[];
  for(let i=linha+1;i<linhas.length;i++){
    const row=linhas[i]||[];
    if(!row.some(v=>limpar(v))){resumo.vazias++;continue;}
    // Não tratar linhas soltas de rodapé como produto.
    const ean=get(row,'ean').replace(/^\uFEFF/,'');
    const codigo_interno=get(row,'codigo_interno');
    const quantidade=numeroSaldoProcfit(get(row,'quantidade'));
    const secao=get(row,'secao');
    const empresa=get(row,'empresa'),centro=get(row,'centro');
    resumo.lidas++;
    const anotar=(motivo)=>{if(amostras.length<12)amostras.push({linha:i+1,codigo_interno,ean,motivo});};
    if(loja && ((empresa && empresa!==String(loja)) || (centro && centro!==String(loja)))){resumo.outraLoja++;anotar('Loja/centro diferente');continue;}
    if(naoMostrarSecao(secao)){resumo.secaoIgnorada++;continue;}
    if(quantidade===null){resumo.saldoInvalido++;anotar('Saldo inválido ou negativo');continue;}
    if(!/^\d{8,14}$/.test(ean) && !/^\d+$/.test(codigo_interno)){
      resumo.semIdentificador++;anotar('Sem EAN válido e sem código interno numérico');continue;
    }
    if(!/^\d{8,14}$/.test(ean))resumo.pendentesCodigo++;
    itens.push({codigo_interno,ean,descricao:get(row,'descricao'),secao,quantidade});
    resumo.aptas++;
  }
  return {itens,resumo,amostras};
}
