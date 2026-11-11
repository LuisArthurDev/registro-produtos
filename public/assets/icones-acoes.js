/* Ações SVG acessíveis para as páginas do Vercel. Não depende de CDN.
   Mantém os atributos de dados e eventos originais: altera apenas a apresentação. */
const paths={
 copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2"/>',
 edit:'<path d="M12 20h9M16 3a2.12 2.12 0 0 1 3 3L9 16l-5 1 1-5L16 3Z"/>',
 delete:'<path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v7m4-7v7"/>',
 fire:'<path d="M12 22c5 0 8-4 8-8 0-4-3-7-4-8-.4 4-3 5-4 6 1-5-1-8-4-10 0 5-4 8-4 12s3 8 8 8Z"/><path d="M12 22c2.5 0 4-2 4-4 0-2-2-4-4-5-1 2-4 3-4 5 0 2 1.5 4 4 4Z"/>',
 archive:'<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8m-10 4h6"/>',
 approve:'<circle cx="12" cy="12" r="9"/><path d="m7.5 12 3 3 6-6"/>',
 repeat:'<path d="M20 7v5h-5M4 17v-5h5M5 9a8 8 0 0 1 14-2l1 5M4 12l1 5a8 8 0 0 0 14-2"/>',
 transfer:'<path d="M3 7h18m-5-4 5 4-5 4M21 17H3m5-4-5 4 5 4"/>',
 users:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 5"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 refresh:'<path d="M20 7v5h-5M4 17v-5h5M5 9a8 8 0 0 1 14-2M19 15a8 8 0 0 1-14 2"/>',
 search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 download:'<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
 print:'<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6v-7Z"/>',
 save:'<path d="M4 3h14l3 3v15H3V3h1Zm3 0v7h9V3M7 21v-8h10v8"/>',
 close:'<path d="M5 5 19 19M19 5 5 19"/>',
 next:'<path d="m9 5 7 7-7 7"/>',
 previous:'<path d="m15 5-7 7 7 7"/>',
 eye:'<path d="M2 12c3-5 6-7 10-7s7 2 10 7c-3 5-6 7-10 7s-7-2-10-7Z"/><circle cx="12" cy="12" r="3"/>',
 'eye-off':'<path d="M3 3 21 21M10.6 5.2A11 11 0 0 1 12 5c4 0 7 2 10 7a18 18 0 0 1-3.2 3.8M6.2 6.2C4.7 7.3 3.3 9.3 2 12c3 5 6 7 10 7 1.3 0 2.5-.2 3.6-.6"/><path d="M9.5 9.5a3.5 3.5 0 0 0 5 5"/>',
 flag:'<path d="M5 21V4m0 1c6-3 8 3 15 0v11c-7 3-9-3-15 0"/>',
 warn:'<path d="m12 3 10 18H2L12 3Zm0 7v4m0 4h.01"/>',
 unlock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M9 11V7a4 4 0 0 1 8 0"/>',
 lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
 key:'<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9m-4 0h4v4"/>',
 camera:'<path d="M4 7h4l2-3h4l2 3h4v13H4V7Z"/><circle cx="12" cy="13" r="4"/>',
 bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 10h18c0-2-3-3-3-10ZM10 21h4"/>',
 mute:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 10h18c0-2-3-3-3-10ZM4 4l16 16"/>',
 layout:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 board:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M5 8h2m4 3h2m4-4h2"/>',
 chart:'<path d="M3 21h18M6 17V9m6 8V4m6 13v-6"/>',
 check:'<path d="m5 12 5 5 9-10"/>',
 more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
 reset:'<path d="M4 5v5h5M5 10a8 8 0 1 1 2 7"/>',
 smartphone:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
 barcode:'<path d="M3 5v14M6 7v10M9 5v14M13 7v10M16 5v14M20 7v10"/>'
};
const clean=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function detectarAcao(label,button){
 const t=clean(label);const attrs=clean(button?.getAttribute?.('class')||'')+' '+clean(button?.getAttribute?.('id')||'')+' '+Array.from(button?.attributes||[]).filter(a=>a.name.startsWith('data-')).map(a=>a.name+' '+a.value).join(' ');
 const has=(...words)=>words.some(w=>t.includes(w)||attrs.includes(w));
 if(has('copiar','copy','procfit'))return 'copy';
 if(has('ocultar','esconder','hide'))return 'eye-off';
 if(has('restaurar','reexibir','mostrar secao','mostrar seção'))return 'repeat';
 if(has('gerenciar'))return 'board';
 if(has('excluir','exclusao','delet','remover','remove','apagar','delete','inativar'))return 'delete';
 if(has('editar','edit','corrigir','alterar nome','rename'))return 'edit';
 if(has('aprovar','aprovado','confirmar','concluir','resolver','permitir','ativar','aceitar'))return 'approve';
 if(has('relaunch','relancar','reprocessar','repetir'))return 'repeat';
 if(has('queima','lançar na queima','lancar na queima'))return 'fire';
 if(has('vencido','retirar da loja','retirar','archive'))return 'archive';
 if(has('transfer','mover','descer','destino','redirecion'))return 'transfer';
 if(has('sinaliz','flag','negar','marcar'))return 'flag';
 if(has('cadastrar','adicionar','novo','nova','criar','incluir'))return 'plus';
 if(has('redefinir pin','senha','alterar pin'))return 'key';
 if(has('bloquear','travar'))return 'lock';
 if(has('desbloquear'))return 'unlock';
 if(has('atualizar','refresh','recarregar','retry','retomar','consultar novamente','reenviar'))return 'refresh';
 if(has('consultar','pesquisar','buscar','verificar','diagnostic'))return 'search';
 if(has('exportar','download','baixar','csv','ods'))return 'download';
 if(has('imprimir','print'))return 'print';
 if(has('salvar','registrar','gravar','lancamento'))return 'save';
 if(has('cancelar','fechar','limpar','agora nao','manter pendente'))return 'close';
 if(has('proxima','avancar','next'))return 'next';
 if(has('anterior','voltar','prev'))return 'previous';
 if(has('visualizar','ver dados','visualiz','detalhes','abrir'))return 'eye';
 if(has('camera','scan'))return 'camera';
 if(has('notifica','bell'))return 'bell';
 if(has('testar'))return 'check';
 if(has('organizacao','organizar','secao','trello'))return 'board';
 if(has('painel geral','dashboard','resumo'))return 'layout';
 if(has('todos','selecionar','marcar'))return 'check';
 if(has('celular','aparelho'))return 'smartphone';
 return 'more';
}
export function classeDaAcao(label,button){
 const s=clean(label),classes=String(button?.className||'');
 if(/(excluir|exclusao|apagar|remover|inativar|negar|bloquear|retirar da loja)/.test(s)||/danger/.test(classes))return 'danger';
 if(/(aprovar|aprovado|confirmar|resolver|salvar|registrar|permitir)/.test(s))return 'success';
 if(/(queima|vencido|relancar|transferir|sinaliz|atencao)/.test(s))return 'warning';
 return 'neutral';
}
function decorate(button){
 if(button.closest('#login-screen,#menu,.sidebar,.side-bottom,.page-subnav,.compare-tabs,.view-tabs,.view-month-modes,.mode-selector,.tab-list,[role=tablist]')||button.matches('[data-no-action-icon],[role=tab],[data-view-tab],[data-loss-tab],#btn-login,#btn-revalidar-sessao'))return;
 if(button.dataset.iconAction==='1'&&button.querySelector('svg[data-action-svg]'))return;
 const original=button.dataset.iconAction==='1' ? (button.innerText||button.textContent||button.getAttribute('aria-label')||'') : (button.getAttribute('aria-label')||button.getAttribute('title')||button.innerText||button.textContent||'');
 const label=String(original).replace(/\s+/g,' ').trim();
 if(!label)return;
 const kind=detectarAcao(label,button),variant=classeDaAcao(label,button);
 // Quando o título muda (por exemplo, Aprovar -> Aprovado), a ação também muda.
 button.setAttribute('aria-label',label);button.setAttribute('title',label);button.dataset.iconAction='1';
 button.classList.add('icon-action','icon-action--'+variant);
 for(const cls of ['neutral','danger','success','warning'])if(cls!==variant)button.classList.remove('icon-action--'+cls);
 // As confirmações sensíveis mantêm texto visível, além do SVG.
 const explicito=!!button.closest('dialog,.view-tabs,.view-month-modes,.view-title .toolbar,.view-controls') || button.matches('.primary,[data-icon-keep-label]');
 button.classList.toggle('icon-action--labeled',explicito);
 const svg=`<svg data-action-svg="${kind}" class="icon-action-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[kind]}</svg>`;
 button.innerHTML=svg+(explicito?`<span class="icon-action-label"></span>`:`<span class="icon-action-text"></span>`);
 button.lastElementChild.textContent=label;
}
export function instalarIconesDeAcao(){
 const areas='#content button,#launch-body button,dialog button,.header-actions button';
 let queued=false;
 const scan=()=>{queued=false;for(const bt of document.querySelectorAll(areas))decorate(bt);};
 const schedule=()=>{if(queued)return;queued=true;queueMicrotask(scan);};
 // As páginas e tabelas são montadas dinamicamente por innerHTML; preserva handlers e data-*.
 const observer=new MutationObserver(changes=>{
   if(changes.some(c=>c.type==='childList'))schedule();
 });
 observer.observe(document.body,{childList:true,subtree:true});
 scan();return ()=>observer.disconnect();
}
