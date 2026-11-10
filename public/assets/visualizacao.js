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
 const [mapData,vencData,signalsData]=await Promise.all([
  request('/mapas'),
  request('/visualizacao/vencidos').catch(err=>({registros:[],warning:'Não foi possível carregar Vencidos: '+err.message})),
  request('/visualizacao/sinalizacoes').catch(err=>({registros:[],warning:'Não foi possível carregar sinalizações: '+err.message}))
 ]);
 const mapas=mapData.registros||[],vencidos=vencData.registros||[],sinalizacoes=signalsData.registros||[];
 const hoje=nowBrISO(),mesAtual=hoje.slice(0,7);
 if(!prefs.month)prefs.month=mesAtual;
 const owners=[...new Set(mapas.map(r=>r.mapa_nome).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 const ownerOptions=loggedAdmin?`<label>Mapa<select id="view-owner"><option value="">Todos os mapas da loja</option>${owners.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join('')}</select></label>`:`<div class="notice view-fixed-owner"><strong>Meu mapa:</strong> ${escapeHtml(user.nome)} · Loja ${escapeHtml(user.loja)}</div>`;
 const actions=`<a class="btn-outline" href="/lancamentos.html">← Lançamentos</a>${loggedAdmin?'<a class="btn-outline" href="/#dashboard">Painel Conferente</a>':''}<button class="btn-outline" type="button" id="view-logout">Sair da conta</button>`;
 content.innerHTML=`<div class="page-head view-title"><div><span class="eyebrow">Registro de validades</span><h1>Visualização dos Lançamentos</h1><p>${loggedAdmin?'Histórico dos mapas da loja, com controle por funcionário.':`Histórico do mapa de ${escapeHtml(user.nome)}, seus vencimentos e sinalizações.`}</p></div><div class="toolbar">${actions}</div></div>
 <section class="card card-pad view-quick-stats"><div class="stat-grid view-stats" id="view-stats"></div></section>
 <section class="card card-pad view-filter-card"><div class="view-tabs" role="group" aria-label="Visualizar dados"><button type="button" data-view-tab="mapas">Meu mapa / Lançamentos</button><button type="button" data-view-tab="vencidos">Vencidos / Retiradas</button><button type="button" data-view-tab="sinalizacoes">Sinalizações</button></div>
 <div id="view-month-mode" class="view-month-modes"><button type="button" data-view-mode="mes">Por mês de lançamento</button><button type="button" data-view-mode="validade">Validade (a vencer)</button></div>
 <div class="filter-row view-filters">${ownerOptions}
 <label id="view-month-field">Mês do lançamento<input id="view-month" type="month"></label>
 <label class="toolbar-checkbox" id="view-all-month-field"><input id="view-all-months" type="checkbox"> Todos os meses</label>
 <label id="view-status-field" hidden>Situação da validade<select id="view-status"><option value="criticos">Vencidos e a vencer</option><option value="vencido">Somente vencidos</option><option value="avencer">Somente a vencer</option><option value="vendavel">Somente vendáveis</option><option value="todos">Todos</option></select></label>
 <label>Pesquisar EAN / descrição<input id="view-search" type="search" placeholder="Nome, EAN ou código interno"></label>
 <label>Pesquisar lote<input id="view-lote" type="search" placeholder="Lote"></label>
 <label>Filtrar validade<input id="view-validade" type="date"></label>
 <button class="btn-outline" id="view-clear" type="button">Limpar filtros</button></div>
 <div class="view-controls"><label>Itens por página<select id="view-size"><option value="15">15</option><option value="25">25</option><option value="50">50</option></select></label><button id="view-refresh" class="btn-outline" type="button">Atualizar</button><button id="view-export" class="btn-outline" type="button">Exportar CSV</button><button id="view-print" class="btn-outline" type="button">Imprimir</button></div>
 </section><div id="view-warnings" role="status"></div><section class="card card-pad" id="view-results"><h2>Histórico</h2><p id="view-summary" class="footer-hint"></p><div id="view-table"></div><div class="pager"><button id="view-prev" class="btn-outline" type="button">Anterior</button><span id="view-page-label"></span><button id="view-next" class="btn-outline" type="button">Próxima</button></div></section>
 <dialog class="dialog view-dialog" id="view-edit-dialog"><form id="view-edit-form" class="dialog-inner"><h2>Editar lançamento</h2><p>As alterações são registradas na auditoria. O mapa de destino não poderá ser alterado.</p><div class="form-grid"><label>EAN<input name="ean" required inputmode="numeric" pattern="[0-9]{8,14}" maxlength="14"></label><label>Lote<input name="lote" required maxlength="100"></label><label>Validade<input name="validade" type="date" required></label><label>Quantidade<input name="quantidade" type="number" min="0" max="999999" step="1" required></label></div><p class="error-note" id="view-edit-error" role="alert" hidden></p><div class="dialog-actions"><button id="view-edit-cancel" class="btn-outline" type="button">Cancelar</button><button class="primary" type="submit">Salvar alterações</button></div></form></dialog>
 <dialog class="dialog view-dialog" id="view-signal-dialog"><form id="view-signal-form" class="dialog-inner"><h2>Sinalizar ao Administrador</h2><p id="view-signal-product"></p><p>A sinalização ficará visível na aba Sinalizados do Painel Conferente.</p><fieldset class="view-reasons"><legend>Motivo</legend>${reasons.map((x,i)=>`<label><input type="radio" name="motivo" value="${escapeHtml(x)}" ${i===0?'required':''}> ${escapeHtml(x)}</label>`).join('')}</fieldset><label id="view-other-reason" hidden>Descreva o motivo<textarea name="observacao" rows="3" maxlength="500" placeholder="Explique o problema"></textarea></label><p id="view-signal-error" role="alert" class="error-note" hidden></p><div class="dialog-actions"><button class="btn-outline" type="button" id="view-signal-cancel">Cancelar</button><button type="submit" class="primary">Enviar sinalização</button></div></form></dialog>
 <dialog class="dialog view-dialog" id="view-info-dialog"><div class="dialog-inner"><h2>Informações de Queima</h2><div id="view-info-content"></div><div class="dialog-actions"><button id="view-info-close" type="button" class="btn-outline">Fechar</button></div></div></dialog>`;
 const $=selector=>content.querySelector(selector);
 $('#view-logout').onclick=()=>document.querySelector('#btn-logout')?.click();
 $('#view-warnings').textContent=[vencData.warning,signalsData.warning].filter(Boolean).join(' · ');
 $('#view-month').value=prefs.month;$('#view-all-months').checked=prefs.allMonths;$('#view-status').value=prefs.status;
 $('#view-search').value=prefs.search;$('#view-lote').value=prefs.lote;$('#view-validade').value=prefs.validade;
 $('#view-size').value=String(prefs.size);if(loggedAdmin)$('#view-owner').value=prefs.owner;
 const withdrawn=x=>statusVal(x.validade,x.secao)[0]==='Vencido';
 const days=iso=>{const a=Date.parse(String(iso||'').slice(0,10)+'T12:00:00Z');const b=Date.parse(hoje+'T12:00:00Z');return Number.isFinite(a)&&Number.isFinite(b)?Math.round((a-b)/864e5):null;};
 const prettyStatus=r=>{const badge=badgeValidade(r.validade,r.secao);const d=days(r.validade);return badge+(d!==null&&d<=0?` <small class="second">${Math.abs(d)} dia(s) após a validade</small>`:'');};
 const asRow=(cells)=>`<tr>${cells.map(c=>`<td>${c}</td>`).join('')}</tr>`;
 const link=x=>escapeHtml(x);
 const rowsForTab=()=>{
  if(prefs.tab==='vencidos')return vencidos.filter(r=>(!prefs.owner||r.mapa_origem===prefs.owner)&&(!prefs.search||[r.ean_resolvido,r.ean,r.descricao,r.codigo_interno].some(v=>String(v||'').toLowerCase().includes(prefs.search.toLowerCase())))&&(!prefs.lote||String(r.lote||'').toLowerCase().includes(prefs.lote.toLowerCase()))&&(!prefs.validade||r.validade===prefs.validade));
  if(prefs.tab==='sinalizacoes')return sinalizacoes.filter(r=>(!prefs.owner||mapas.some(m=>m.id===r.lancamento_id&&m.mapa_nome===prefs.owner))&&(!prefs.search||[r.ean,r.observacao].some(v=>String(v||'').toLowerCase().includes(prefs.search.toLowerCase()))));
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
  $('#view-stats').innerHTML=`<div class="card stat"><small>Lançamentos</small><strong>${money(mapas.length)}</strong><p>Todos os meses</p></div><div class="card stat"><small>Unidades</small><strong>${money(a.reduce((n,r)=>n+Number(r.quantidade||0),0))}</strong><p>Quantidade registrada</p></div><div class="card stat warn"><small>A vencer</small><strong>${money(win.length)}</strong><p>${closest!==undefined?`Próximo em ${closest} ${closest===1?'dia':'dias'}`:'Nenhum próximo ao vencimento'}</p></div><div class="card stat danger"><small>Vencidos / Prazo de retirada</small><strong>${money(expired.length)}</strong><p>Itens que exigem atenção</p></div><div class="card stat"><small>Retiradas</small><strong>${money(vencidos.length)}</strong><p>Histórico de vencidos</p></div>${loggedAdmin?`<div class="card stat"><small>Funcionários nos mapas</small><strong>${money(owners.filter(x=>!['Estoque','Termolabil','Psicotropicos','Antibioticos'].includes(x)).length)}</strong><p>Mapas individuais cadastrados</p></div>`:''}`;
 };
 let showing=[];
 const draw=()=>{
  for(const b of content.querySelectorAll('[data-view-tab]')){const active=b.dataset.viewTab===prefs.tab;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}
  for(const b of content.querySelectorAll('[data-view-mode]')){const active=b.dataset.viewMode===prefs.mode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}
  $('#view-month-mode').hidden=prefs.tab!=='mapas';$('#view-month-field').hidden=prefs.tab!=='mapas'||prefs.mode!=='mes';$('#view-all-month-field').hidden=prefs.tab!=='mapas'||prefs.mode!=='mes';$('#view-status-field').hidden=prefs.tab!=='mapas'||prefs.mode!=='validade';
  showing=rowsForTab();const maxPage=Math.max(1,Math.ceil(showing.length/prefs.size));prefs.page=Math.min(prefs.page,maxPage-1);
  const pageRows=showing.slice(prefs.page*prefs.size,(prefs.page+1)*prefs.size);
  let headings=[];let trs=[];
  if(prefs.tab==='mapas'){
   headings=['Produto / EAN','Mapa','Lote','Validade','Quantidade','Mês lançado','Situação','Ações'];
   trs=pageRows.map(r=>asRow([
    `<strong>${link(r.descricao||'Produto não identificado')}</strong><span class="second">${link(r.ean)}${r.codigoInterno?` · cód. ${link(r.codigoInterno)}`:''}</span>`,
    link(r.mapa_nome),link(r.lote),formatDate(r.validade),money(r.quantidade),link(String(r.mes_lancamento||'').slice(0,7)),prettyStatus(r),
    `<div class="view-row-actions"><button class="action-link" data-view-edit="${link(r.id)}">Editar</button><button class="action-link danger-text" data-view-delete="${link(r.id)}">Excluir</button><button class="action-link" data-view-signal="${link(r.id)}">Sinalizar</button><button class="action-link" data-view-info="${link(r.id)}">ⓘ Queima</button>${Number(r.quantidade)>0&&withdrawn(r)?`<button class="action-link" data-view-retirar="${link(r.id)}">Encaminhar para Vencidos</button>`:''}</div>`]));
  } else if(prefs.tab==='vencidos'){
   headings=['Data retirada','Produto / EAN','Lote','Validade','Quantidade','Origem','Motivo'];
   trs=pageRows.map(r=>asRow([formatTime(r.criado_em),`<strong>${link(r.descricao||r.descricao_original||'Produto não identificado')}</strong><span class="second">${link(r.ean_resolvido||r.ean||r.codigo_interno||'EAN não informado')}</span>`,link(r.lote),formatDate(r.validade),money(r.quantidade),link(r.mapa_origem),link(r.motivo)]));
  } else {
   headings=['Data','EAN','Motivo','Situação'];
   trs=pageRows.map(r=>asRow([formatTime(r.criado_em),link(r.ean),link(r.observacao),link(r.situacao||'aberto')]));
  }
  $('#view-table').innerHTML=showing.length?`<div class="table-wrap" id="view-own-table"><table><thead><tr>${headings.map(x=>`<th>${link(x)}</th>`).join('')}</tr></thead><tbody>${trs.join('')}</tbody></table></div>`:`<div class="empty"><strong>Nenhum registro encontrado.</strong><p>Altere os filtros ou consulte novamente.</p></div>`;
  $('#view-summary').textContent=`${showing.length} registro(s) · ${prefs.tab==='mapas'?showing.reduce((n,r)=>n+Number(r.quantidade||0),0)+' unidade(s) · ':''}${prefs.tab==='mapas'?'mapa de validade':prefs.tab==='vencidos'?'retiradas':'sinalizações'}`;
  $('#view-prev').disabled=prefs.page===0;$('#view-next').disabled=prefs.page>=maxPage-1;$('#view-page-label').textContent=`Página ${prefs.page+1} de ${maxPage}`;
  $('#view-results h2').textContent=({mapas:'Histórico dos lançamentos',vencidos:'Vencidos e retiradas',sinalizacoes:'Sinalizações para o administrador'})[prefs.tab];
 };
 const markChanged=(key,value)=>{prefs[key]=value;prefs.page=0;draw();};
 for(const x of content.querySelectorAll('[data-view-tab]'))x.onclick=()=>markChanged('tab',x.dataset.viewTab);
 for(const x of content.querySelectorAll('[data-view-mode]'))x.onclick=()=>markChanged('mode',x.dataset.viewMode);
 const bind=(id,key,fn=x=>x.value)=>{$('#'+id).addEventListener('input',event=>markChanged(key,fn(event.target)));};
 bind('view-month','month');bind('view-all-months','allMonths',x=>x.checked);bind('view-status','status');bind('view-search','search');bind('view-lote','lote');bind('view-validade','validade');if(loggedAdmin)bind('view-owner','owner');bind('view-size','size',x=>Number(x.value));
 $('#view-clear').onclick=()=>{Object.assign(prefs,{owner:'',search:'',lote:'',validade:'',status:'criticos',month:mesAtual,allMonths:true,page:0});
  for(const [id,val] of [['view-search',''],['view-lote',''],['view-validade',''],['view-status','criticos'],['view-month',mesAtual]])$('#'+id).value=val;
  $('#view-all-months').checked=true;if(loggedAdmin)$('#view-owner').value='';draw();};
 $('#view-refresh').onclick=()=>renderVisualizacao({request,content,user,isAdmin,statusVal,badgeValidade,nowBrISO,toast,confirmDialog});
 $('#view-prev').onclick=()=>{prefs.page--;draw();};$('#view-next').onclick=()=>{prefs.page++;draw();};
 $('#view-print').onclick=()=>{
  const originalPage=prefs.page,originalSize=prefs.size;
  prefs.page=0;prefs.size=Math.max(15,showing.length);draw();
  const restore=()=>{prefs.page=originalPage;prefs.size=originalSize;draw();window.removeEventListener('afterprint',restore);};
  window.addEventListener('afterprint',restore,{once:true});window.print();setTimeout(restore,3000);
 };
 $('#view-export').onclick=()=>{
  const all=showing.map(r=>prefs.tab==='mapas'?[r.mapa_nome,r.ean,r.descricao,r.lote,r.validade,r.quantidade,String(r.mes_lancamento||'').slice(0,7),statusVal(r.validade,r.secao)[0]]:prefs.tab==='vencidos'?[r.criado_em,r.ean_resolvido||r.ean||'',r.descricao,r.lote,r.validade,r.quantidade,r.mapa_origem,r.motivo]:[r.criado_em,r.ean,r.observacao,r.situacao]);
  const cols=prefs.tab==='mapas'?['Mapa','EAN','Descrição','Lote','Validade','Quantidade','Mês','Situação']:prefs.tab==='vencidos'?['Retirada','EAN','Descrição','Lote','Validade','Quantidade','Mapa','Motivo']:['Data','EAN','Motivo','Situação'];
  downloadVisualizacaoCSV(`visualizacao-${prefs.tab}-${hoje}.csv`,cols,all);
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
    $('#view-info-content').innerHTML=found.length?`<div class="table-wrap"><table><thead><tr><th>Lançado</th><th>EAN</th><th>Qtd.</th><th>Estado</th></tr></thead><tbody>${found.map(x=>asRow([formatTime(x.criado_em),link(x.ean),money(x.quantidade),link(x.estado)])).join('')}</tbody></table></div>`:'<p>Nenhum lançamento deste item encontrado na Queima.</p>';
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
 refreshStats();draw();
}
