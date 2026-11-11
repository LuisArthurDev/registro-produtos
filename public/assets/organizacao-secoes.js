// Quadro de organização de grupos. Atribuições administrativas independentes dos mapas.
const html = v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const secaoChave = v=>String(v??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
export function recomendacaoSecao(chave,estatisticas=[],funcionarios=[]){
  const ativos=new Set(funcionarios.map(p=>p.id));
  const porId=new Map();
  for(const r of estatisticas){
    if(secaoChave(r.chave)!==secaoChave(chave)||!ativos.has(r.funcionario_id))continue;
    const ant=porId.get(r.funcionario_id)||{funcionario_id:r.funcionario_id,registros:0,unidades:0};
    ant.registros+=Number(r.registros)||0;ant.unidades+=Number(r.unidades)||0;porId.set(r.funcionario_id,ant);
  }
  const ranking=[...porId.values()].sort((a,b)=>b.registros-a.registros||b.unidades-a.unidades||a.funcionario_id.localeCompare(b.funcionario_id));
  return {ranking,principal:ranking[0]||null,empate:ranking.length>1&&ranking[0].registros===ranking[1].registros,total:ranking.reduce((s,r)=>s+r.registros,0)};
}
export async function renderOrganizacaoSecoes({request,content,header,toast}){
 const data=await request('/organizacao-secoes');
 const funcionarios=data.funcionarios||[],secoes=data.secaoDisponiveis||[],stats=data.estatisticas||[];
 const funcionariosMap=new Map(funcionarios.map(x=>[x.id,x]));
 const atrib=new Map((data.atribuicoes||[]).map(x=>[secaoChave(x.secao_chave),x.responsavel_id]));
 const visibilidade=new Map((data.atribuicoes||[]).map(x=>[secaoChave(x.secao_chave),{oculta:!!x.oculta_no_quadro,excluida:!!x.excluida_das_listas}]));
 const ativos=funcionarios.map(x=>x.id);
 const options='<option value="">Sem responsável</option>'+funcionarios.map(x=>`<option value="${html(x.id)}">${html(x.nome)}</option>`).join('');
 const resumos=new Map(secoes.map(x=>[secaoChave(x.chave),recomendacaoSecao(x.chave,stats,funcionarios)]));
 const geral={registros:stats.reduce((s,x)=>s+(Number(x.registros)||0),0),unidades:stats.reduce((s,x)=>s+(Number(x.unidades)||0),0)};
 content.innerHTML=header('Seções por Grupo','Organize responsáveis, oculte cartões ou exclua grupos das listagens sem apagar o histórico.',
 '<button type="button" class="btn-outline" id="org-refresh">Atualizar análise</button>')+`
 <section class="card card-pad org-intro"><div class="stat-grid">
 <div class="card stat"><small>Grupos cadastrados</small><strong>${secoes.length}</strong></div>
 <div class="card stat"><small>Funcionários ativos</small><strong>${funcionarios.length}</strong></div>
 <div class="card stat"><small>Registros analisados</small><strong>${geral.registros}</strong><p>${geral.unidades} unidades ativas</p></div>
 <div class="card stat"><small>Sem dono definido</small><strong id="org-unassigned">0</strong><p>Apenas no quadro de organização</p></div></div>
 <div class="notice org-explanation">Este é um <strong>quadro organizacional</strong>, não um mapa de estoque. Arraste os cartões ou use o seletor de responsável. <strong>Nada é transferido, editado ou excluído dos lançamentos.</strong> Ocultar afeta apenas o quadro; excluir um grupo a remove das listagens operacionais da loja, mas preserva os dados.</div>
 ${Number(data.semSecao)>0?`<p class="org-note">${Number(data.semSecao)} registro(s) sem grupo definido no catálogo não entram nas recomendações. Cadastre o grupo em Produtos EAN.</p>`:''}
 ${Number(data.semFuncionario)>0?`<p class="org-note">${Number(data.semFuncionario)} registro(s) não têm funcionário identificável e não são atribuídos a alguém automaticamente.</p>`:''}
 <div class="filter-row"><label class="org-search"><span>Buscar grupo</span><input id="org-filter" type="search" placeholder="Ex.: ALIMENTICIO, HIGIENE, BELEZA"></label>
 <label>Exibir<select id="org-view"><option value="all">Todos os grupos</option><option value="alerts">Apenas sugestões e avisos</option><option value="unassigned">Sem responsável</option></select></label>
 <span id="org-status" role="status" aria-live="polite" class="footer-hint"></span></div>
 <div class="org-manage-toolbar"><button class="btn-outline" id="org-manage-toggle" type="button" aria-expanded="false" aria-controls="org-manage-list">Gerenciar ocultas e excluídas <span id="org-inactive-count"></span></button><span class="footer-hint">Produtos nas seções Brinde, Default e Serviços não são exibidos.</span></div>
 <div id="org-manage-list" class="org-managed-list" hidden></div>
 <div id="org-alerts" class="org-alerts" aria-live="polite"></div>
 <div class="org-board" id="org-board" aria-label="Quadro de responsáveis por grupo"></div></section>`;
 const board=content.querySelector('#org-board'),status=content.querySelector('#org-status');
 let busy=false;
 const render=()=>{
   const query=content.querySelector('#org-filter').value.toLocaleLowerCase('pt-BR').trim(),mode=content.querySelector('#org-view').value;
   let avisos=0,semDono=0;
   const columns=[{id:'',nome:'Sem responsável'},...funcionarios.map(x=>({id:x.id,nome:x.nome}))];
   const byCol=new Map(columns.map(x=>[x.id,[]]));
   const lista=[...secoes].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
   for(const sec of lista){
     const key=secaoChave(sec.chave);
     if(visibilidade.get(key)?.oculta||visibilidade.get(key)?.excluida)continue;
     const owner=atrib.get(key)||'',ownerAtivo=funcionariosMap.has(owner)?owner:'';
     if(!ownerAtivo)semDono++;
     const resumo=resumos.get(key)||{ranking:[],principal:null,empate:false,total:0};
     const leader=resumo.principal&&!resumo.empate?funcionariosMap.get(resumo.principal.funcionario_id):null;
     const diferenca=leader&&leader.id!==ownerAtivo;
     if(diferenca)avisos++;
     if(query&&!sec.nome.toLocaleLowerCase('pt-BR').includes(query))continue;
     if(mode==='unassigned'&&ownerAtivo)continue;
     if(mode==='alerts'&&!diferenca)continue;
     const self=ownerAtivo?resumo.ranking.find(x=>x.funcionario_id===ownerAtivo):null;
     const hint=leader?`Mais registros: <strong>${html(leader.nome)}</strong> · ${resumo.principal.registros} lançamento(s) · ${resumo.principal.unidades} unidade(s)`:
       resumo.empate?'Empate entre funcionários nos registros deste grupo':'Sem lançamentos identificados neste grupo';
     const card=`<article class="org-section-card ${diferenca?'org-suggested':''}" draggable="true" data-org-key="${html(key)}" aria-label="Grupo ${html(sec.nome)}">
       <div class="org-card-top"><span class="org-drag" aria-hidden="true">⠿</span><strong>${html(sec.nome)}</strong><span class="org-card-total">${resumo.total}</span></div>
       <p>${hint}</p>
       ${ownerAtivo?`<p class="org-own-count">No mapa do responsável: ${self?.registros||0} registros</p>`:''}
       ${diferenca?`<div class="org-card-hint">Sugestão: ${html(leader.nome)} possui mais registros neste grupo.</div><button class="action-link org-apply-suggestion" type="button" data-org-suggest="${html(key)}" data-org-target="${html(leader.id)}">Aplicar sugestão</button>`:''}
       ${owner&&!ownerAtivo?'<div class="org-card-hint">Responsável anterior inativo: selecione um novo.</div>':''}
       <label class="org-owner-select">Responsável <select aria-label="Responsável pelo grupo ${html(sec.nome)}" data-org-select="${html(key)}">${options}</select></label>
       <div class="org-card-actions">
         <button type="button" class="btn-outline" title="Ocultar grupo ${html(sec.nome)} somente do quadro" aria-label="Ocultar grupo ${html(sec.nome)} somente do quadro" data-org-action="ocultar" data-org-key="${html(key)}">Ocultar</button>
         <button type="button" class="btn-outline danger" title="Excluir grupo ${html(sec.nome)} das listagens" aria-label="Excluir grupo ${html(sec.nome)} das listagens" data-org-action="excluir" data-org-key="${html(key)}">Excluir</button>
       </div>
     </article>`;
     byCol.get(ownerAtivo).push(card);
   }
   content.querySelector('#org-unassigned').textContent=String(semDono);
   content.querySelector('#org-alerts').innerHTML=avisos?`<div class="notice warn"><strong>${avisos} sugestão(ões) de organização</strong> com base na frequência de produtos por grupo nos mapas. As sugestões não mudam os responsáveis automaticamente.</div>`:
     '<div class="notice">Nenhuma divergência encontrada entre a organização atual e os mapas analisados.</div>';
   board.innerHTML=columns.map(col=>{
     const cards=byCol.get(col.id),registros=stats.filter(x=>x.funcionario_id===col.id).reduce((sum,x)=>sum+(Number(x.registros)||0),0);
     const tops=col.id?stats.filter(x=>x.funcionario_id===col.id).sort((a,b)=>Number(b.registros)-Number(a.registros)) : [];
     const sectionName=tops.length?secoes.find(s=>secaoChave(s.chave)===secaoChave(tops[0].chave))?.nome:null;
     return `<section class="org-column" data-org-column="${html(col.id)}" aria-label="${html(col.nome)}">
       <div class="org-column-head"><strong>${html(col.nome)}</strong><span class="org-count">${cards.length}</span></div>
       <p class="org-column-meta">${col.id?`${registros} registro(s) no mapa${sectionName?` · Mais frequente: ${html(sectionName)}`:''}`:'Grupos aguardando definição'}</p>
       <div class="org-column-cards" role="region" tabindex="0" aria-label="Grupos de ${html(col.nome)}; use as setas para rolar a lista">${cards.join('')||'<p class="org-column-empty">Solte um grupo aqui ou escolha esta opção no seletor.</p>'}</div>
     </section>`;
   }).join('');
   for(const select of board.querySelectorAll('[data-org-select]'))select.value=funcionariosMap.has(atrib.get(select.dataset.orgSelect))?atrib.get(select.dataset.orgSelect):'';
   const arquivadas=lista.filter(sec=>{const f=visibilidade.get(secaoChave(sec.chave));return f?.oculta||f?.excluida;});
   content.querySelector('#org-inactive-count').textContent=`(${arquivadas.length})`;
   content.querySelector('#org-manage-list').innerHTML=arquivadas.length?arquivadas.map(sec=>{
     const f=visibilidade.get(secaoChave(sec.chave));return `<div class="org-managed-item"><span><strong>${html(sec.nome)}</strong><small>${f.excluida?'Excluída das listagens da loja':'Oculta somente deste quadro'}</small></span><button type="button" class="btn-outline" data-org-action="restaurar" data-org-key="${html(secaoChave(sec.chave))}" title="Restaurar grupo ${html(sec.nome)}">Restaurar</button></div>`;
   }).join(''):'<p class="footer-hint">Nenhum grupo oculta ou excluída.</p>';
   status.textContent=`${secoes.length-arquivadas.length} grupos visíveis · ${avisos} sugestão(ões)`;
 };
 async function save(chave,target){
   if(busy)return;
   if(!secoes.some(x=>secaoChave(x.chave)===chave))return;
   if(target&&!ativos.includes(target)){toast('Escolha um funcionário ativo da mesma loja.',true);return;}
   if((atrib.get(chave)||'')===target)return;
   const secao=secoes.find(x=>secaoChave(x.chave)===chave);
   const old=atrib.get(chave)||'';busy=true;status.textContent='Salvando organização…';
   try{await request('/organizacao-secoes',{method:'PUT',body:{secao:secao.nome,responsavel_id:target||null}});
     atrib.set(chave,target);render();toast(`Grupo ${secao.nome}: ${funcionariosMap.get(target)?.nome||'sem responsável'}. Organização salva, mapas inalterados.`);
   }catch(err){atrib.set(chave,old);render();toast(err.message,true);}finally{busy=false;}
 }
 board.addEventListener('change',e=>{const sel=e.target.closest('[data-org-select]');if(sel)void save(sel.dataset.orgSelect,sel.value);});
 async function mudarVisibilidade(chave,acao){
   const secao=secoes.find(x=>secaoChave(x.chave)===chave);if(!secao||busy)return;
   if(acao==='excluir'&&!confirm(`Excluir o grupo "${secao.nome}" das listagens desta loja? Produtos e lançamentos serão preservados no banco. Você poderá restaurar depois.`))return;
   busy=true;status.textContent='Salvando visibilidade…';
   try{
     await request('/organizacao-secoes',{method:'PATCH',body:{secao:secao.nome,acao}});
     toast(acao==='ocultar'?`Grupo ${secao.nome} oculto do quadro.`:acao==='excluir'?`Grupo ${secao.nome} excluído das listagens da loja.`:`Grupo ${secao.nome} restaurado.`);
     await renderOrganizacaoSecoes({request,content,header,toast});
   }catch(err){toast(err.message,true);render();}finally{busy=false;}
 }
 function tratarAcao(e){
   const acao=e.target.closest('[data-org-action]');if(acao){void mudarVisibilidade(acao.dataset.orgKey,acao.dataset.orgAction);return;}
   const sugestao=e.target.closest('[data-org-suggest]');if(sugestao)void save(sugestao.dataset.orgSuggest,sugestao.dataset.orgTarget);
 }
 board.addEventListener('click',tratarAcao);
 content.querySelector('#org-manage-list').addEventListener('click',tratarAcao);
 content.querySelector('#org-manage-toggle').onclick=()=>{
   const area=content.querySelector('#org-manage-list');area.hidden=!area.hidden;
   content.querySelector('#org-manage-toggle').setAttribute('aria-expanded',String(!area.hidden));
 };
 board.addEventListener('dragstart',e=>{const card=e.target.closest('.org-section-card');if(!card)return;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',card.dataset.orgKey);card.classList.add('org-dragging');});
 board.addEventListener('dragend',e=>{e.target.closest('.org-section-card')?.classList.remove('org-dragging');board.querySelectorAll('.org-drop-target').forEach(x=>x.classList.remove('org-drop-target'));});
 board.addEventListener('dragover',e=>{const col=e.target.closest('[data-org-column]');if(col){e.preventDefault();e.dataTransfer.dropEffect='move';col.classList.add('org-drop-target');}});
 board.addEventListener('dragleave',e=>{const col=e.target.closest('[data-org-column]');if(col&&!col.contains(e.relatedTarget))col.classList.remove('org-drop-target');});
 board.addEventListener('drop',e=>{const col=e.target.closest('[data-org-column]');if(!col)return;e.preventDefault();const key=e.dataTransfer.getData('text/plain');col.classList.remove('org-drop-target');void save(key,col.dataset.orgColumn);});
 content.querySelector('#org-filter').oninput=render;
 content.querySelector('#org-view').onchange=render;
 content.querySelector('#org-refresh').onclick=()=>renderOrganizacaoSecoes({request,content,header,toast}).catch(err=>toast(err.message,true));
 render();
}
