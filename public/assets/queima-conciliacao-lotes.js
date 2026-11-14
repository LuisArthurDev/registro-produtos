/** A conciliação de novos itens usa lotes pequenos para evitar statement_timeout.
 * A prévia nunca grava; a gravação é idempotente por chave de origem.
 */
export const TAM_LOTE_QUEIMA=40;
export function dividirQueimaEmLotes(itens,tamanho=TAM_LOTE_QUEIMA){
 if(!Array.isArray(itens)||tamanho<1||!Number.isSafeInteger(tamanho))throw Error('Seleção de relatório inválida.');
 const lotes=[];for(let i=0;i<itens.length;i+=tamanho)lotes.push(itens.slice(i,i+tamanho));
 return lotes;
}
export function somarContagensQueima(resultados){
 const contagem={},amostras=[];let total=0,criados=0;
 for(const resposta of resultados){
  const obj=resposta?.resultado||resposta||{};
  total+=Number(obj.total_aprovados)||0;criados+=Number(obj.criados)||0;
  for(const [chave,n] of Object.entries(obj.contagem||{}))contagem[chave]=(contagem[chave]||0)+(Number(n)||0);
  for(const x of obj.amostras||[]){if(amostras.length<100)amostras.push(x);}
 }
 return {total_aprovados:total,contagem,amostras,criados};
}
export async function executarQueimaEmLotes(itens,requestLote,{simular=true,progresso=()=>{},tamanho=TAM_LOTE_QUEIMA}={}){
 const lotes=dividirQueimaEmLotes(itens,tamanho),respostas=[];
 for(let i=0;i<lotes.length;i++){
  const contexto={indice:i+1,total:lotes.length,itensProcessados:Math.min(itens.length,(i+1)*tamanho),totalItens:itens.length,simular};
  progresso({...contexto,executado:false});
  try{respostas.push(await requestLote(lotes[i],contexto));}
  catch(erro){erro.lotesConcluidos=i;erro.totalLotes=lotes.length;erro.itensConcluidos=i*tamanho;throw erro;}
  progresso({...contexto,executado:true});
 }
 return somarContagensQueima(respostas);
}
