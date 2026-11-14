/* Visualização do próprio mapa: página dedicada e compartilhada com a SPA.
   O backend aplica autorização independentemente dos filtros enviados pelo navegador. */
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number(n||0).toLocaleString('pt-BR');
const formatDate=v=>{const s=String(v||'').slice(0,10);const p=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);return p?`${p[3]}/${p[2]}/${p[1]}`:'—';};
const formatTime=v=>v?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(v)):'—';
const prefs={tab:'mapas',mode:'mes',month:'',allMonths:true,status:'criticos',owner:'',search:'',lote:'',validade:'',size:15,page:0};
const reasons=['Não Entrou na Queima','Muita Quantidade','Outras'];
export function downloadVisualizacaoCSV(nome,colunas,linhas){
 const safe=s=>{const val=String(s??'');const guarded=/^[\s]*[=+@\-]/.test(val)?"'"+val:val;return '"'+guarded.replaceAll('"','""')+'"';};
 const content='\ufeff'+[colunas,...linhas].map(row=>row.map(safe).join(';')).join('\r\n');
 const blob=new Blob([content],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=nome;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
export async function renderVisualizacao({request,content,user,isAdmin,statusVal,badgeValidade,nowBrISO,toast,confirmDialog}){
 if(user.perfil==='geral')throw new Error('O Administrador Geral deve utilizar o Painel Geral.');
 const loggedAdmin=isAdmin();
 // Esta tela apresenta somente Mapa/Lançamentos; os demais históricos
 // continuam no Painel Conferente e não são consultados pela Visualização.
 const mapData=await request('/visualizacao/mapas');
 const mapas=mapData.registros||[];
 prefs.tab='mapas';
 const hoje=nowBrISO(),mesAtual=hoje.slice(0,7);
 if(!prefs.month)prefs.month=mesAtual;
 if(!['mes','validade','queima'].includes(prefs.mode))prefs.mode='mes';
 const owners=loggedAdmin?(mapData.abasPermitidas||['Estoque','Termolabil','Psicotropicos','Antibioticos']):[user.nome];
 const ownerOptions=loggedAdmin?`<label>Mapa<select id="view-owner"><option value="">Todas as abas especiais</option>${owners.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('')}</select></label>`:`<div class="notice view-fixed-owner"><strong>Meu mapa:</strong> ${escapeHtml(user.nome)} · Loja ${escapeHtml(user.loja)}</div>`;
 const actions=`<a class="btn-outline" href="/lancamentos.html">← Lançamentos</a>${loggedAdmin?'<a class="btn-outline" href="/#dashboard">Painel Conferente</a>':''}<button class="btn-outline" type="button" id="view-logout">Sair da conta</button>`;
 content.innerHTML=`<div class="page-head view-title"><div><span class="eyebrow">Registro de validades</span><h1>Visualização dos Lançamentos</h1><p>${loggedAdmin?'Histórico das abas especiais da loja, com filtros de mapa, mês e validade.':`Histórico do mapa de ${escapeHtml(user.nome)}, com filtros de lançamento e validade.`}</p></div><div class="toolbar">${actions}</div></div>
 <section class="card card-pad view-quick-stats"><div class="stat-grid view-stats" id="view-stats"></div></section>
 <section class="card card-pad view-filter-card"><div class="view-tabs" role="group" aria-label="Visualizar dados"><button type="button" data-view-tab="mapas">Mapa / Lançamentos</button></div>
 <div id="view-month-mode" class="view-month-modes"><button type="button" data-view-mode="mes">Por mês de lançamento</button><button type="button" data-view-mode="validade">Validade (a vencer)</button><button type="button" data-view-mode="queima">Queima (aprovados)</button></div>
 <div class="filter-row view-filters">${ownerOptions}
 <label id="view-month-field">Mês do lançamento<input id="view-month" type="month"></label>
 <label class="toolbar-checkbox" id="view-all-month-field"><input id="view-all-months" type="checkbox"> Todos os meses</label>
 <label id="view-status-field" hidden>Situação da validade<select id="view-status"><option value="criticos">Vencidos e a vencer</option><option value="vencido">Somente vencidos</option><option value="avencer">Somente a vencer</option><option value="vendavel">Somente vendáveis</option><option value="todos">Todos</option></select></label>
 <label>Pesquisar EAN / descrição<input id="view-search" type="search" placeholder="Nome, EAN ou código interno"></label>
 <label>Pesquisar lote<input id="view-lote" type="search" placeholder="Lote"></label>
 <label>Filtrar validade<input id="view-validade" type="date"></label>
 <button class="btn-outline" id="view-clear" type="button">Limpar filtros</button></div>
 <div class="view-controls"><label>Itens por página<select id="view-size"><option value="15">15</option><option value="25">25</option><option value="50">50</option></select></label><button id="view-refresh" class="btn-outline" type="button">Atualizar</button><button id="view-export" class="btn-outline" type="button">Exportar CSV</button><button id="view-print" class="btn-outline" type="button">Imprimir</button></div>
 </section><div id="view-warnings" role="status"></div><p class="notice warn" id="view-queima-alert" role="note" hidden><strong>Atenção:</strong> a quantidade informada na Queima pode estar incorreta. Confira o produto e o estoque antes de utilizar essa quantidade como saldo.</p><section class="card card-pad" id="view-results"><h2>Histórico</h2><p id="view-summary" class="footer-hint"></p><div id="view-table"></div><div class="pager"><button id="view-prev" class="btn-outline" type="button">Anterior</button><span id="view-page-label"></span><button id="view-next" class="btn-outline" type="button">Próxima</button></div></section>
 <dialog class="dialog view-dialog" id="view-edit-dialog"><form id="view-edit-form" class="dialog-inner"><h2>Editar lançamento</h2><p>As alterações são registradas na auditoria. O mapa de destino não poderá ser alterado.</p><div class="form-grid"><label>EAN<input name="ean" required inputmode="numeric" pattern="[0-9]{8,14}" maxlength="14"></label><label>Lote<input name="lote" required maxlength="100"></label><label>Validade<input name="validade" type="date" required></label><label>Quantidade<input name="quantidade" type="number" min="0" max="999999" step="1" required></label></div><p class="error-note" id="view-edit-error" role="alert" hidden></p><div class="dialog-actions"><button id="view-edit-cancel" class="btn-outline" type="button">Cancelar</button><button class="primary" type="submit">Salvar alterações</button></div></form></dialog>
 <dialog class="dialog view-dialog" id="view-signal-dialog"><form id="view-signal-form" class="dialog-inner"><h2>Sinalizar ao Administrador</h2><p id="view-signal-product"></p><p>A sinalização ficará visível na aba Sinalizados do Painel Conferente.</p><fieldset class="view-reasons"><legend>Motivo</legend>${reasons.map((x,i)=>`<label><input type="radio" name="motivo" value="${escapeHtml(x)}" ${i===0?'required':''}> ${escapeHtml(x)}</label>`).join('')}</fieldset><label id="view-other-reason" hidden>Descreva o motivo<textarea name="observacao" rows="3" maxlength="500" placeholder="Explique o problema"></textarea></label><p id="view-signal-error" role="alert" class="error-note" hidden></p><div class="dialog-actions"><button class="btn-outline" type="button" id="view-signal-cancel">Cancelar</button><button type="submit" class="primary">Enviar sinalização</button></div></form></dialog>
 <dialog class="dialog view-dialog" id="view-info-dialog"><div class="dialog-inner"><h2>Histórico completo da Queima</h2><div id="view-info-content"></div><div class="dialog-actions"><button id="view-info-close" type="button" class="btn-outline">Fechar</button></div></div></dialog>`;
 const $=selector=>content.querySelector(selector);
 $('#view-logout').onclick=()=>document.querySelector('#btn-logout')?.click();
 $('#view-warnings').textContent=mapData.warning||'';
 $('#view-month').value=prefs.month;$('#view-all-months').checked=prefs.allMonths;$('#view-status').value=prefs.status;
 $('#view-search').value=prefs.search;$('#view-lote').value=prefs.lote;$('#view-validade').value=prefs.validade;
 $('#view-size').value=String(prefs.size);if(loggedAdmin)$('#view-owner').value=prefs.owner;
 const withdrawn=x=>statusVal(x.validade,x.secao)[0]==='Vencido';
 const days=iso=>{const a=Date.parse(String(iso||'').slice(0,10)+'T12:00:00Z');const b=Date.parse(hoje+'T12:00:00Z');return Number.isFinite(a)&&Number.isFinite(b)?Math.round((a-b)/864e5):null;};
 const prettyStatus=r=>{const badge=badgeValidade(r.validade,r.secao);const d=days(r.validade);return badge+(d!==null&&d<=0?` <small class="second">${Math.abs(d)} dia(s) após a validade</small>`:'');};
 const asRow=(cells)=>`<tr>${cells.map(c=>`<td>${c}</td>`).join('')}</tr>`;
 const link=x=>escapeHtml(x);
 let queimaRows=[],queimaLoaded=false,queimaBusy=false,queimaWarning='';
 const loadQueima=async()=>{
  if(queimaBusy)return;
  queimaBusy=true;queimaLoaded=false;draw();
  try{
   const params=loggedAdmin&&prefs.owner?'?mapa='+encodeURIComponent(prefs.owner):'';
   const r=await request('/visualizacao/queima-aprovados'+params);
   queimaRows=(r.registros||[]).filter(x=>x.estado==='aprovado');
   queimaWarning=r.aviso||'';queimaLoaded=true;
  }catch(err){queimaRows=[];queimaWarning=err.message;queimaLoaded=false;toast(err.message,true);}
  finally{queimaBusy=false;draw();}
 };
 const rowsForTab=()=>{
  if(prefs.mode==='queima')return queimaRows.filter(r=>(!prefs.search||[r.descricao,r.ean,r.codigoInterno,r.produto_relatorio].some(x=>String(x||'').toLowerCase().includes(prefs.search.toLowerCase())))&&
   (!prefs.lote||String(r.lote||'').toLowerCase().includes(prefs.lote.toLowerCase()))&&(!prefs.validade||r.validade===prefs.validade));
  return mapas.filter(r=>(!prefs.owner||r.mapa_nome===prefs.owner)&&
   (prefs.mode==='validade'||prefs.allMonths||String(r.mes_lancamento||'').slice(0,7)===prefs.month)&&
   (prefs.mode!=='validade'||prefs.status==='todos'||(prefs.status==='criticos'?['Vencido','A vencer'].includes(statusVal(r.validade,r.secao)[0]):
    ({vencido:'Vencido',avencer:'A vencer',vendavel:'Vendável'}[prefs.status]===statusVal(r.validade,r.secao)[0])))&&
   (!prefs.search||[r.descricao,r.ean,r.codigoInterno,r.secao].some(v=>String(v||'').toLowerCase().includes(prefs.search.toLowerCase())))&&
   (!prefs.lote||String(r.lote||'').toLowerCase().includes(prefs.lote.toLowerCase()))&&(!prefs.validade||r.validade===prefs.validade));
 };
 const refreshStats=()=>{
  const a=mapas.filter(r=>Number(r.quantidade)>0);const win=a.filter(r=>statusVal(r.validade,r.secao)[0]==='A vencer');const expired=a.filter(withdrawn);
  const closest=win.map(x=>days(x.validade)).filter(Number.isFinite).sort((x,y)=>x-y)[0];
  $('#view-stats').innerHTML=`<div class="card stat"><small>Lançamentos</small><strong>${money(mapas.length)}</strong><p>Todos os meses</p></div><div class="card stat"><small>Unidades</small><strong>${money(a.reduce((n,r)=>n+Number(r.quantidade||0),0))}</strong><p>Quantidade registrada</p></div><div class="card stat warn"><small>A vencer</small><strong>${money(win.length)}</strong><p>${closest!==undefined?`Próximo em ${closest} ${closest===1?'dia':'dias'}`:'Nenhum próximo ao vencimento'}</p></div><div class="card stat danger"><small>Vencidos / Prazo de retirada</small><strong>${money(expired.length)}</strong><p>Itens que exigem atenção</p></div>${loggedAdmin?`<div class="card stat"><small>Abas especiais disponíveis</small><strong>${money(owners.length)}</strong><p>Selecione a aba no filtro Mapa</p></div>`:''}`;
 };
 let showing=[];
 const draw=()=>{
  for(const b of content.querySelectorAll('[data-view-tab]')){const active=b.dataset.viewTab===prefs.tab;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}
  for(const b of content.querySelectorAll('[data-view-mode]')){const active=b.dataset.viewMode===prefs.mode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}
  $('#view-month-mode').hidden=false;$('#view-queima-alert').hidden=prefs.mode!=='queima';$('#view-month-field').hidden=prefs.mode!=='mes';$('#view-all-month-field').hidden=prefs.mode!=='mes';$('#view-status-field').hidden=prefs.mode!=='validade';
  $('#view-results').classList.toggle('view-queima-results',prefs.mode==='queima');
  showing=rowsForTab();const maxPage=Math.max(1,Math.ceil(showing.length/prefs.size));prefs.page=Math.min(prefs.page,maxPage-1);
  const pageRows=showing.slice(prefs.page*prefs.size,(prefs.page+1)*prefs.size);
  let headings=[];let trs=[];
  if(prefs.mode==='queima'){
   headings=['Produto / EAN','Lote','Validade','Validade da Gôndola','Preço da Gôndola','Qtd. informada','Situação'];
   trs=pageRows.map(r=>asRow([
    `<div class="view-product-first"><div><strong>${link(r.descricao||'Produto não identificado')}</strong><span class="second">${link(r.ean||r.codigoInterno||'Código não informado')}</span></div></div>`,
    link(r.lote||'Não informado'),formatDate(r.validade),formatDate(r.validade_gondola),
    r.preco_gondola==null?'Preço não informado':Number(r.preco_gondola).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),
    r.quantidade_pendente?'A conferir':money(r.quantidade),'<span class="pill green">Aprovado</span>'
   ]));
  }else{
   headings=['Produto / EAN','Mapa','Lote','Validade','Quantidade','Mês lançado','Situação','Ações'];
   trs=pageRows.map(r=>asRow([
    `<div class="view-product-first"><button type="button" class="view-eye-queima" data-view-info="${link(r.id)}" title="Ver todos os lançamentos do produto na Queima (inclusive aprovados)" aria-label="Ver histórico completo da Queima do EAN ${link(r.ean)}"><svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none" aria-hidden="true"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button><div><strong>${link(r.descricao||'Produto não identificado')}</strong><span class="second">${link(r.ean)}${r.codigoInterno?` · cód. ${link(r.codigoInterno)}`:''}</span>${r.formula_especial?'<span class="pill amber">Fórmula Especial · Queima bloqueada</span>':''}</div></div>`,
    link(r.mapa_nome),link(r.lote),formatDate(r.validade),money(r.quantidade),link(String(r.mes_lancamento||'').slice(0,7)),prettyStatus(r),
    `<div class="view-row-actions"><button class="action-link" data-view-edit="${link(r.id)}">Editar</button><button class="action-link danger-text" data-view-delete="${link(r.id)}">Excluir</button><button class="action-link" data-view-signal="${link(r.id)}">Sinalizar</button>${Number(r.quantidade)>0&&withdrawn(r)?`<button class="action-link" data-view-retirar="${link(r.id)}">Encaminhar para Vencidos</button>`:''}</div>`]));
  }
  $('#view-table').innerHTML=prefs.mode==='queima'&&!queimaLoaded?`<div class="empty"><strong>${queimaBusy?'Consultando produtos aprovados…':'Não foi possível carregar a Queima.'}</strong><p>${link(queimaWarning||'Tente Atualizar.')}</p></div>`:showing.length?`<div class="table-wrap" id="view-own-table"><table><thead><tr>${headings.map(x=>`<th>${link(x)}</th>`).join('')}</tr></thead><tbody>${trs.join('')}</tbody></table></div>`:`<div class="empty"><strong>Nenhum registro encontrado.</strong><p>Altere os filtros ou consulte novamente.</p></div>`;
  $('#view-summary').textContent=prefs.mode==='queima'?`${showing.length} produto(s) aprovados na Queima · quantidade sujeita a conferência`:`${showing.length} registro(s) · ${showing.reduce((n,r)=>n+Number(r.quantidade||0),0)} unidade(s) · mapa de validade`;
  $('#view-prev').disabled=prefs.page===0;$('#view-next').disabled=prefs.page>=maxPage-1;$('#view-page-label').textContent=`Página ${prefs.page+1} de ${maxPage}`;
  $('#view-results h2').textContent=prefs.mode==='queima'?'Meus produtos aprovados na Queima':'Histórico dos lançamentos';
 };
 const markChanged=(key,value)=>{prefs[key]=value;prefs.page=0;draw();};
 for(const x of content.querySelectorAll('[data-view-tab]'))x.onclick=()=>markChanged('tab',x.dataset.viewTab);
 for(const x of content.querySelectorAll('[data-view-mode]'))x.onclick=async()=>{markChanged('mode',x.dataset.viewMode);if(prefs.mode==='queima'&&!queimaLoaded)await loadQueima();};
 const bind=(id,key,fn=x=>x.value)=>{$('#'+id).addEventListener('input',event=>markChanged(key,fn(event.target)));};
 bind('view-month','month');bind('view-all-months','allMonths',x=>x.checked);bind('view-status','status');bind('view-search','search');bind('view-lote','lote');bind('view-validade','validade');if(loggedAdmin){$('#view-owner').addEventListener('input',async event=>{markChanged('owner',event.target.value);if(prefs.mode==='queima')await loadQueima();});}bind('view-size','size',x=>Number(x.value));
 $('#view-clear').onclick=()=>{Object.assign(prefs,{owner:'',search:'',lote:'',validade:'',status:'criticos',month:mesAtual,allMonths:true,page:0});
  for(const [id,val] of [['view-search',''],['view-lote',''],['view-validade',''],['view-status','criticos'],['view-month',mesAtual]])$('#'+id).value=val;
  $('#view-all-months').checked=true;if(loggedAdmin)$('#view-owner').value='';draw();if(prefs.mode==='queima')loadQueima();};
 $('#view-refresh').onclick=()=>prefs.mode==='queima'?loadQueima():renderVisualizacao({request,content,user,isAdmin,statusVal,badgeValidade,nowBrISO,toast,confirmDialog});
 $('#view-prev').onclick=()=>{prefs.page--;draw();};$('#view-next').onclick=()=>{prefs.page++;draw();};
 $('#view-results').addEventListener('rv:filtros-restaurados',e=>{const n=Number(e.detail?.paginas?.['view-page-label']);if(n>0){prefs.page=n-1;draw();}},{once:true});
 $('#view-print').onclick=()=>{
  const originalPage=prefs.page,originalSize=prefs.size;
  prefs.page=0;prefs.size=Math.max(15,showing.length);draw();
  const restore=()=>{prefs.page=originalPage;prefs.size=originalSize;draw();window.removeEventListener('afterprint',restore);};
  window.addEventListener('afterprint',restore,{once:true});window.print();setTimeout(restore,3000);
 };
 $('#view-export').onclick=()=>{
  const queimando=prefs.mode==='queima';
  const all=queimando?showing.map(r=>[r.descricao,r.ean||'',r.codigoInterno||'',r.lote||'',r.validade,r.validade_gondola||'',r.preco_gondola??'',r.quantidade_pendente?'Pendente':r.quantidade,'Aprovado']):showing.map(r=>[r.mapa_nome,r.ean,r.descricao,r.lote,r.validade,r.quantidade,String(r.mes_lancamento||'').slice(0,7),statusVal(r.validade,r.secao)[0]]);
  const cols=queimando?['Descrição','EAN','Código Interno','Lote','Validade','Validade da Gôndola','Preço da Gôndola','Quantidade informada','Situação']:['Mapa','EAN','Descrição','Lote','Validade','Quantidade','Mês','Situação'];
  downloadVisualizacaoCSV(`visualizacao-${queimando?'queima':'mapas'}-${hoje}.csv`,cols,all);
 };
 const editDialog=$('#view-edit-dialog'),editForm=$('#view-edit-form'),signalDialog=$('#view-signal-dialog'),signalForm=$('#view-signal-form'),infoDialog=$('#view-info-dialog');
 let editing=null,signaling=null;
 $('#view-edit-cancel').onclick=()=>editDialog.close();$('#view-signal-cancel').onclick=()=>signalDialog.close();$('#view-info-close').onclick=()=>infoDialog.close();
 content.querySelectorAll('[name="motivo"]').forEach(x=>x.onchange=()=>{const other=signalForm.elements.motivo.value==='Outras';$('#view-other-reason').hidden=!other;signalForm.elements.observacao.required=other;});
 $('#view-table').onclick=async event=>{
  const btn=event.target.closest('button[data-view-edit],button[data-view-delete],button[data-view-signal],button[data-view-info],button[data-view-retirar]');if(!btn)return;
  const id=btn.dataset.viewEdit||btn.dataset.viewDelete||btn.dataset.viewSignal||btn.dataset.viewInfo||btn.dataset.viewRetirar;
  const reg=mapas.find(r=>r.id===id);if(!reg)return;
  if(btn.dataset.viewEdit){editing=reg;editForm.reset();for(const k of ['ean','lote','validade','quantidade'])editForm.elements[k].value=reg[k]??'';$('#view-edit-error').hidden=true;editDialog.showModal();return;}
  if(btn.dataset.viewDelete){if(!await confirmDialog('Excluir lançamento',`Excluir o registro EAN ${reg.ean}, lote ${reg.lote}, do seu mapa? A operação ficará na auditoria.`))return;
    try{await request('/mapas',{method:'DELETE',body:{id}});toast('Registro excluído.');await renderVisualizacao({request,content,user,isAdmin,statusVal,badgeValidade,nowBrISO,toast,confirmDialog});}catch(err){toast(err.message,true);}return;}
  if(btn.dataset.viewSignal){signaling=reg;signalForm.reset();$('#view-signal-product').textContent=`${reg.descricao||reg.ean} · Lote ${reg.lote}`;$('#view-signal-error').hidden=true;$('#view-other-reason').hidden=true;signalDialog.showModal();return;}
  if(btn.dataset.viewInfo){infoDialog.showModal();$('#view-info-content').textContent='Consultando registros na Queima…';
   try{const rsp=await request('/visualizacao/queima?id='+encodeURIComponent(reg.id));const found=rsp.registros||[];
    $('#view-info-content').innerHTML=found.length?`<p class="footer-hint">${found.length} lançamento(s) encontrados, incluindo repetições, aprovados e relançados.</p><div class="table-wrap"><table><thead><tr><th>Lançado</th><th>EAN</th><th>Lote</th><th>Validade</th><th>Validade da Gôndola</th><th>Preço da Gôndola</th><th>Qtd.</th><th>Situação</th></tr></thead><tbody>${found.map(x=>asRow([formatTime(x.criado_em),link(x.ean),link(x.lote),formatDate(x.validade),formatDate(x.validade_gondola),x.preco_gondola==null?'—':Number(x.preco_gondola).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),money(x.quantidade),`<span class="pill ${x.estado==='aprovado'?'green':x.estado==='relancado'?'':'amber'}">${link(x.estado||'pendente')}</span>`])).join('')}</tbody></table></div>`:'<p>Nenhum lançamento deste item encontrado na Queima.</p>';
   }catch(err){$('#view-info-content').textContent=err.message;}return;}
  if(btn.dataset.viewRetirar){if(!await confirmDialog('Encaminhar para Vencidos',`Mover ${reg.quantidade} unidade(s) de ${reg.ean} para Vencidos? Esta operação será registrada.`))return;
   try{await request('/visualizacao/retirar',{method:'POST',body:{id}});toast('Produto movido para Vencidos.');await renderVisualizacao({request,content,user,isAdmin,statusVal,badgeValidade,nowBrISO,toast,confirmDialog});}catch(err){toast(err.message,true);}return;}
 };
 editForm.onsubmit=async ev=>{ev.preventDefault();if(!editing)return;
  const save=editForm.querySelector('[type=submit]');save.disabled=true;$('#view-edit-error').hidden=true;
  try{await request('/mapas',{method:'PATCH',body:{id:editing.id,...Object.fromEntries(new FormData(editForm)),quantidade:Number(editForm.elements.quantidade.value)}});
    editDialog.close();toast('Lançamento atualizado.');await renderVisualizacao({request,content,user,isAdmin,statusVal,badgeValidade,nowBrISO,toast,confirmDialog});
  }catch(err){$('#view-edit-error').textContent=err.message;$('#view-edit-error').hidden=false;}finally{save.disabled=false;}
 };
 signalForm.onsubmit=async ev=>{ev.preventDefault();if(!signaling)return;
  const save=signalForm.querySelector('[type=submit]');save.disabled=true;$('#view-signal-error').hidden=true;
  try{await request('/visualizacao/sinalizar',{method:'POST',body:{id:signaling.id,motivo:signalForm.elements.motivo.value,observacao:signalForm.elements.observacao.value}});
    signalDialog.close();toast('Sinalização enviada ao administrador.');await renderVisualizacao({request,content,user,isAdmin,statusVal,badgeValidade,nowBrISO,toast,confirmDialog});
  }catch(err){$('#view-signal-error').textContent=err.message;$('#view-signal-error').hidden=false;}finally{save.disabled=false;}
 };
 refreshStats();draw();if(prefs.mode==='queima')await loadQueima();
}
