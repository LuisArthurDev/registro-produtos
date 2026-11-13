/** Preparação estruturada para importação Procfit, NÃO é um banco Absolute .TDB.
 * Os campos mapeados foram extraídos de uma amostra; o vínculo/IDs nativos
 * ainda dependem de homologação, por isso este módulo recusa criar .TDB.
 */
import {montarListaProcfit} from './procfit.js';

export const STATUS_TDB = 'NAO_IMPORTAVEL_AINDA';
export const CAMPOS_REAIS_CONFIRMADOS = Object.freeze({
  QUEIMA_ESTOQUE: Object.freeze(['QUEIMA_ESTOQUE','FORMULARIO_ORIGEM','TAB_MASTER_ORIGEM','REG_MASTER_ORIGEM','REG_LOG_INCLUSAO','USUARIO_LOGADO','DATA_HORA','EMPRESA']),
  QUEIMA_ESTOQUE_ITEM: Object.freeze(['QUEIMA_ESTOQUE_ITEM','FORMULARIO_ORIGEM','TAB_MASTER_ORIGEM','REG_MASTER_ORIGEM','REG_LOG_INCLUSAO','QUEIMA_ESTOQUE','EAN','PRODUTO','LOTE','VALIDADE','QUANTIDADE','CURVA','PRECO_VENDA','APROVADO','DEMANDA_DIA_PONDERADA','ESTOQUE','QUEIMA_ESTOQUE_MOTIVO','USUARIO_APROVACAO','DATA_HORA_APROVACAO','QUEIMA_ESTOQUE_PRECO_ITEM','GRUPO_PRODUTO','CATEGORIA_PRODUTO','DATA_INCLUSAO','DATA_PRIMEIRA_COMPRA','PROMOCAO_VIGENTE','DESCRICAO_PROMOCAO'])
});

const soTexto = value => String(value ?? '').trim();
/** Apenas itens já conciliados; saldo corrigido positivo, fórmulas excluídas,
 * sem criar número de solicitação nem alterar flags de aprovação. */
export function prepararDadosProcfitTdb(registros,{empresa,mes='',geradoEm}={}){
  const loja=soTexto(empresa);
  if(!/^\d{1,10}$/.test(loja))throw new Error('Empresa inválida. Escolha uma loja válida antes de preparar o arquivo.');
  const res=montarListaProcfit(registros,{corrigido:true});
  if(!res.total)throw new Error('Nenhum produto com quantidade corrigida positiva e dados válidos.');
  const linhas=res.texto.split('\r\n').slice(1);
  const itens=linhas.map((line,i)=>{
    const [codigo,ean,lote,validade,qtd]=line.split('\t');
    if(!ean && !codigo)throw new Error(`Identificador ausente no item ${i+1}.`);
    const br=validade.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(!br)throw new Error(`Validade inválida no item ${i+1}.`);
    // Os únicos SEIS campos da tabela de itens preenchidos pela preparação.
    // Identificadores/chaves internas serão atribuídos apenas pelo gerador nativo homologado.
    return {
      QUEIMA_ESTOQUE_MOTIVO:4,
      PRODUTO:codigo||null,
      EAN:ean,
      LOTE:lote,
      VALIDADE:`${br[3]}-${br[2]}-${br[1]}`,
      QUANTIDADE:Number(qtd)

    };
  });
  const iso=geradoEm??new Date().toISOString();
  if(Number.isNaN(Date.parse(iso)))throw new Error('Data de geração inválida.');
  const documento={
    tipo:'PREPARACAO_PROCFIT_QUEIMA',versao:1,status:STATUS_TDB,
    aviso:'ESTE ARQUIVO JSON NAO E UM TDB E NAO PODE SER IMPORTADO NO PROCFIT. Os IDs, defaults, tipos e relacionamentos ainda precisam de homologacao.',
    origem:'Conferencia do mapa com o estoque importado',gerado_em:iso,mes_conferencia:soTexto(mes)||null,
    motivo_fixo:4,aprovacao_final:'MANUAL_NO_PROCFIT',
    campos_preenchidos:['QUEIMA_ESTOQUE_MOTIVO','PRODUTO','EAN','LOTE','VALIDADE','QUANTIDADE'],
    empresa_contexto:loja,
    tabelas:{QUEIMA_ESTOQUE_ITEM:itens},
    validacao:{registros_conferidos:(registros||[]).length,registros_elegiveis:itens.length,ignorados:res.ignorados},
    campos_nao_resolvidos:['QUEIMA_ESTOQUE (chave primária nativa)','QUEIMA_ESTOQUE_ITEM (chave primária nativa)','QUEIMA_ESTOQUE_ITEM.QUEIMA_ESTOQUE (referência ao cabeçalho)','USUARIO_LOGADO (identificador Procfit)','DATA_HORA (tipo e timezone do Procfit)','tipos reais, restricoes, indices e campos de preenchimento obrigatório']
  };
  return {documento,total:itens.length,ignorados:res.ignorados};
}

export function serializarPreparacaoProcfit(resultado){
  if(resultado?.documento?.status!==STATUS_TDB)throw new Error('Formato de preparação não reconhecido.');
  return JSON.stringify(resultado.documento,null,2)+'\n';
}
/** Usa o download nativo do navegador; não tenta gravar um banco binário. */
export function baixarPreparacaoProcfit(resultado,{documento=globalThis.document,urlApi=globalThis.URL,BlobCtor=globalThis.Blob}={}){
  if(!documento?.createElement||!urlApi?.createObjectURL||!BlobCtor)throw new Error('Download indisponível neste navegador.');
  const mes=String(resultado?.documento?.mes_conferencia||'').replace(/[^0-9-]/g,'').slice(0,7)||'sem-mes';
  const loja=String(resultado?.documento?.empresa_contexto||'').replace(/[^0-9]/g,'');
  const nome=`procfit-preparacao-nao-importavel-loja${loja}-${mes}.json`;
  const blob=new BlobCtor([serializarPreparacaoProcfit(resultado)],{type:'application/json;charset=utf-8'});
  const url=urlApi.createObjectURL(blob),a=documento.createElement('a');
  a.href=url;a.download=nome;a.hidden=true;
  documento.body.appendChild(a);
  try{a.click();}finally{a.remove();globalThis.setTimeout?.(()=>urlApi.revokeObjectURL(url),1500);}
  return nome;
}
