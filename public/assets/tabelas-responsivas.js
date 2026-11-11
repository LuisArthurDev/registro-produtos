/* Tabelas responsivas: usa os cabeçalhos originais como rótulos dos cards.
 * Funciona também com tabelas criadas dinamicamente por filtros/paginação,
 * sem reescrever a estrutura dos registros ou seus botões de ação. */
export function rotularTabela(tabela) {
  if (!tabela?.querySelectorAll) return;
  const colunas=[...tabela.querySelectorAll('thead tr:last-child th')]
    .map(th => (th.textContent || '').replace(/\s+/g, ' ').trim());
  if (!colunas.length) return;
  for (const tr of tabela.querySelectorAll('tbody tr')) {
    let posicao=0;
    for (const td of tr.children) {
      if (td.tagName !== 'TD') continue;
      const extensao=Math.max(1,Number(td.getAttribute('colspan')||1));
      // Mantém o texto original do cabeçalho, inclusive o da ação.
      const rotulo=extensao===1 ? (colunas[posicao] || '') : '';
      if (td.getAttribute('data-label')!==rotulo) td.setAttribute('data-label',rotulo);
      posicao+=extensao;
    }
  }
}
export function iniciarTabelasResponsivas(doc=globalThis.document) {
  if (!doc?.querySelectorAll || !globalThis.MutationObserver) return null;
  const processar=()=>doc.querySelectorAll('.table-wrap table').forEach(rotularTabela);
  let agendado=false;
  const agendar=()=>{
    if (agendado) return;
    agendado=true;
    queueMicrotask(()=>{agendado=false;processar();});
  };
  const obs=new MutationObserver(mudancas=>{
    // Somente a substituição de linhas gera um novo ciclo;
    // atributos data-label não são observados, evitando loop infinito.
    if (mudancas.some(m=>m.type==='childList')) agendar();
  });
  const ligar=()=>{
    if (!doc.body) return;
    obs.observe(doc.body,{childList:true,subtree:true});
    processar();
  };
  if (doc.body) ligar();
  else doc.addEventListener('DOMContentLoaded',ligar,{once:true});
  return obs;
}
