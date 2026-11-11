// Quadro de organização de seções. Atribuições administrativas independentes dos mapas.
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
 const ativos=funcionarios.map(x=>x.id);
 const options='<option value="">Sem responsável</option>'+funcionarios.map(x=>`<option value="${html(x.id)}">${html(x.nome)}</option>`).join('');
 const resumos=new Map(secoes.map(x=>[secaoChave(x.chave),recomendacaoSecao(x.chave,stats,funcionarios)]));
 const geral={registros:stats.reduce((s,x)=>s+(Number(x.registros)||0),0),unidades:stats.reduce((s,x)=>s+(Number(x.unidades)||0),0)};
 content.innerHTML=header('Organização de Seções','Defina responsáveis visualmente; sugestões baseadas nos lançamentos dos mapas não modificam nenhum registro operacional.',
 '<button type="button" class="btn-outline" id="org-refresh">Atualizar análise</button>')+`
 <section class="card card-pad org-intro"><div class="stat-grid">
 <div class="card stat"><small>Seções no catálogo</small><strong>${secoes.length}</strong></div>
 <div class="card stat"><small>Funcionários ativos</small><strong>${funcionarios.length}</strong></div>
 <div class="card stat"><small>Registros analisados</small><strong>${geral.registros}</strong><p>${geral.unidades} unidades ativas</p></div>
 <div class="card stat"><small>Sem dono definido</small><strong id="org-unassigned">0</strong><p>Apenas no quadro de organização</p></div></div>
 <div class="notice org-explanation">Este é um <strong>quadro organizacional</strong>, não um mapa de estoque. Arraste um cartão para outra coluna no computador ou use o seletor de responsável no celular. <strong>Nada é transferido, editado ou excluído dos lançamentos.</strong></div>
 ${Number(data.semSecao)>0?`<p class="org-note">${Number(data.semSecao)} registro(s) sem seção definida no catálogo não entram nas recomendações. Complete a seção em Produtos EAN.</p>`:''}
 ${Number(data.semFuncionario)>0?`<p class="org-note">${Number(data.semFuncionario)} registro(s) não têm funcionário identificável e não são atribuídos a alguém automaticamente.</p>`:''}
 <div class="filter-row"><label class="org-search"><span>Buscar seção</span><input id="org-filter" type="search" placeholder="Ex.: Perfumaria, Fraldas, Alimentos"></label>
 <label>Exibir<select id="org-view"><option value="all">Todas as seções</option><option value="alerts">Apenas sugestões e avisos</option><option value="unassigned">Sem responsável</option></select></label>
 <span id="org-status" role="status" aria-live="polite" class="footer-hint"></span></div>
 <div id="org-alerts" class="org-alerts" aria-live="polite"></div>
 <div class="org-board" id="org-board" aria-label="Quadro de responsáveis por seção"></div></section>`;
 const board=content.querySelector('#org-board'),status=content.querySelector('#org-status');
 let busy=false;
 const render=()=>{
   const query=content.querySelector('#org-filter').value.toLocaleLowerCase('pt-BR').trim(),mode=content.querySelector('#org-view').value;
   let avisos=0,semDono=0;
   const columns=[{id:'',nome:'Sem responsável'},...funcionarios.map(x=>({id:x.id,nome:x.nome}))];
   const byCol=new Map(columns.map(x=>[x.id,[]]));
   const lista=[...secoes].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
   for(const sec of lista){
     const key=secaoChave(sec.chave),owner=atrib.get(key)||'',ownerAtivo=funcionariosMap.has(owner)?owner:'';
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
       resumo.empate?'Empate entre funcionários nos registros desta seção':'Sem lançamentos identificados nesta seção';
     const card=`<article class="org-section-card ${diferenca?'org-suggested':''}" draggable="true" data-org-key="${html(key)}" aria-label="Seção ${html(sec.nome)}">
       <div class="org-card-top"><span class="org-drag" aria-hidden="true">⠿</span><strong>${html(sec.nome)}</strong><span class="org-card-total">${resumo.total}</span></div>
       <p>${hint}</p>
       ${ownerAtivo?`<p class="org-own-count">No mapa do responsável: ${self?.registros||0} registros</p>`:''}
       ${diferenca?`<div class="org-card-hint">Sugestão: ${html(leader.nome)} possui mais registros nesta seção.</div><button class="action-link org-apply-suggestion" type="button" data-org-suggest="${html(key)}" data-org-target="${html(leader.id)}">Aplicar sugestão</button>`:''}
       ${owner&&!ownerAtivo?'<div class="org-card-hint">Responsável anterior inativo: selecione um novo.</div>':''}
       <label class="org-owner-select">Responsável <select aria-label="Responsável pela seção ${html(sec.nome)}" data-org-select="${html(key)}">${options}</select></label>
     </article>`;
     byCol.get(ownerAtivo).push(card);
   }
   content.querySelector('#org-unassigned').textContent=String(semDono);
   content.querySelector('#org-alerts').innerHTML=avisos?`<div class="notice warn"><strong>${avisos} sugestão(ões) de organização</strong> com base na frequência de produtos por seção nos mapas. As sugestões não mudam os responsáveis automaticamente.</div>`:
     '<div class="notice">Nenhuma divergência encontrada entre a organização atual e os mapas analisados.</div>';
   board.innerHTML=columns.map(col=>{
     const cards=byCol.get(col.id),registros=stats.filter(x=>x.funcionario_id===col.id).reduce((sum,x)=>sum+(Number(x.registros)||0),0);
     const tops=col.id?stats.filter(x=>x.funcionario_id===col.id).sort((a,b)=>Number(b.registros)-Number(a.registros)) : [];
     const sectionName=tops.length?secoes.find(s=>secaoChave(s.chave)===secaoChave(tops[0].chave))?.nome:null;
     return `<section class="org-column" data-org-column="${html(col.id)}" aria-label="${html(col.nome)}">
       <div class="org-column-head"><strong>${html(col.nome)}</strong><span class="org-count">${cards.length}</span></div>
       <p class="org-column-meta">${col.id?`${registros} registro(s) no mapa${sectionName?` · Mais frequente: ${html(sectionName)}`:''}`:'Seções aguardando definição'}</p>
       <div class="org-column-cards">${cards.join('')||'<p class="org-column-empty">Solte uma seção aqui ou escolha esta opção no seletor.</p>'}</div>
     </section>`;
   }).join('');
   for(const select of board.querySelectorAll('[data-org-select]'))select.value=funcionariosMap.has(atrib.get(select.dataset.orgSelect))?atrib.get(select.dataset.orgSelect):'';
   status.textContent=`${secoes.length} seções · ${avisos} sugestão(ões)`;
 };
 async function save(chave,target){
   if(busy)return;
   if(!secoes.some(x=>secaoChave(x.chave)===chave))return;
   if(target&&!ativos.includes(target)){toast('Escolha um funcionário ativo da mesma loja.',true);return;}
   if((atrib.get(chave)||'')===target)return;
   const secao=secoes.find(x=>secaoChave(x.chave)===chave);
   const old=atrib.get(chave)||'';busy=true;status.textContent='Salvando organização…';
   try{await request('/organizacao-secoes',{method:'PUT',body:{secao:secao.nome,responsavel_id:target||null}});
     atrib.set(chave,target);render();toast(`Seção ${secao.nome}: ${funcionariosMap.get(target)?.nome||'sem responsável'}. Organização salva, mapas inalterados.`);
   }catch(err){atrib.set(chave,old);render();toast(err.message,true);}finally{busy=false;}
 }
 board.addEventListener('change',e=>{const sel=e.target.closest('[data-org-select]');if(sel)void save(sel.dataset.orgSelect,sel.value);});
 board.addEventListener('click',e=>{const bt=e.target.closest('[data-org-suggest]');if(bt)void save(bt.dataset.orgSuggest,bt.dataset.orgTarget);});
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
