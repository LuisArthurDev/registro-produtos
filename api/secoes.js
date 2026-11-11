/** Regras de visibilidade de seções. Não modifica o catálogo nem o histórico. */
export function chaveSecao(valor){
 return String(valor??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
   .toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');
}
const PADRAO = new Set(['brinde','brindes','default','servico','servicos','servicoes']);
export function secaoPadraoIgnorada(valor){return PADRAO.has(chaveSecao(valor));}
export function secaoNaoVisivel(valor,excluidas=new Set()){
 const chave=chaveSecao(valor);return !!chave&&(PADRAO.has(chave)||excluidas.has(chave));
}
export function filtrarSecoes(secoes,excluidas=new Set()){
 return (secoes||[]).filter(x=>!secaoNaoVisivel(typeof x==='string'?x:x.nome??x.chave,excluidas));
}
