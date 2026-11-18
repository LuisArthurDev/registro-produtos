import { lerODS } from './ods.js';

export function registroDaQueimaOds(nome){
 const m=/^Queima-(\d{1,20})\.ods$/i.exec(String(nome||''));
 if(!m)throw Error('O nome do arquivo deve ser Queima-NUMERO_DO_REGISTRO.ods (ex.: Queima-176612.ods).');
 return m[1];
}
const norm=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const texto=x=>String(x??'').trim().replace(/\.0$/,'');
const iso=x=>{
 const s=String(x??'').trim();
 let m=/^(\d{4})-(\d\d)-(\d\d)(?:T.*)?$/.exec(s);
 if(m)return `${m[1]}-${m[2]}-${m[3]}`;
 m=/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(s);
 return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:s;
};
export function interpretarLinhasQueimaODS(linhas,registro){
 const colunas={ean:['ean'],codigo:['produto','codigo interno','cod interno','codigo'],lote:['lote'],validade:['validade'],quantidade:['quantidade','qtd','qtde'],motivo:['motivo de queima','motivo'],descricao:['descricao','descricao produto']};
 let cabecalho=-1,indices={};
 for(let i=0;i<Math.min(35,linhas.length);i++){
  const row=linhas[i],idx={};
  for(const [k,apelidos] of Object.entries(colunas))idx[k]=row.findIndex(x=>apelidos.includes(norm(x)));
  if(['codigo','lote','validade','quantidade'].every(k=>idx[k]>=0)){cabecalho=i;indices=idx;break;}
 }
 if(cabecalho<0)throw Error('Estrutura ODS não reconhecida: esperado Produto, Lote, Validade e Quantidade.');
 const itens=[];
 for(let i=cabecalho+1;i<linhas.length;i++){
  const row=linhas[i],v=k=>indices[k]<0?'':row[indices[k]];
  const codigo=texto(v('codigo')),ean=texto(v('ean')),lote=texto(v('lote'));
  if(!codigo&&!ean&&!lote)continue;
  const motivo=indices.motivo>=0?Number(texto(v('motivo'))):4;
  const quantidade=Number(texto(v('quantidade')).replace(',','.'));
  itens.push({linha:i+1,codigo_interno:codigo,ean,lote,validade:iso(v('validade')),quantidade,motivo,descricao:texto(v('descricao')),registro_queima:registro});
 }
 if(!itens.length)throw Error('Nenhum produto encontrado no arquivo ODS.');
 return {registro,itens};
}
export async function lerArquivoQueimaOds(file){
 const registro=registroDaQueimaOds(file?.name);
 return interpretarLinhasQueimaODS(await lerODS(file,{maxLinhas:3100,maxColunas:120}),registro);
}
