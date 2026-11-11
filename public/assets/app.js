import { lerODS } from './ods.js';
import { conciliarMapaComEstoque } from './conciliacao-estoque.js';
import { renderVisualizacao } from './visualizacao.js';
import { renderOrganizacaoSecoes } from './organizacao-secoes.js';
import { instalarIconesDeAcao } from './icones-acoes.js';
import { resumoQueima } from './queima-grafico.js';
import { abrirScannerEAN, fecharScanner } from './scanner.js';
import { mascararValidade, validadeParaISO } from './validade.js';
import { elegivelTentativaVenda } from './tentativa.js';
import { associarPush, ativarPush, desassociarPush, recusarPush, escolhaPush, transferirEscolhaParaConta, prepararPush, diagnosticarPush } from './push.js';
/* Registro de Validades — frontend unificado. Não armazene chaves administrativas aqui. */
const $=s=>document.querySelector(s);
const H=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TOKEN_KEY='rv_session', PENDING_KEY='rv_pending_launch', STORE_KEY='rv_loja';
// Transferência efêmera de um login já confirmado no servidor para a página móvel.
const AUTH_BRIDGE_KEY='rv_login_validado_para_lancamentos_v1';
const special=['Estoque','Termolabil','Psicotropicos','Antibioticos'];
const menus=[['dashboard','dashboard','Dashboard'],['mapas','clipboard','Mapa de Validade'],['controle-validade','calendar','Controle de Validade'],['perdas','package-x','Perdas'],['estoque-mapa','warehouse','Estoque'],['saldo','scale','Saldo Procfit'],['produtos','barcode','Produtos EAN'],['queima','recycle','Queima'],['transferencias','arrows','Transferências'],['sinalizacoes','flag','Sinalizados'],['usuarios','users','Funcionários'],['organizacao-secoes','board','Seções'],['auditoria','history','Histórico'],['pendencias','alert','Pendências'],['notificacoes','bell','Notificações']];
const menusGeral=[['painel-geral','shield','Painel Geral'],['admins-geral','users','Administradores de loja'],['notificacoes','bell','Notificações']];
// Ícones SVG locais: tamanhos e traços uniformes, sem dependência de CDN.
const menuIconPaths={
 dashboard:'<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
 clipboard:'<rect x="5" y="5" width="14" height="16" rx="2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h6"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18m-13 5 2 2 4-4"/>',
 'package-x':'<path d="m12 3-9 5v9l9 5 9-5V8l-9-5Zm0 0v19M3 8l9 5 9-5"/><path d="m15 15 4 4m0-4-4 4"/>',
 warehouse:'<path d="M3 21V9l9-6 9 6v12H3ZM3 10h18M7 21v-8h10v8M10 13v8M14 13v8"/>',
 scale:'<path d="M12 3v18M5 7h14M7 7l-4 8h8L7 7Zm10 0-4 8h8l-4-8ZM8 21h8"/>',
 barcode:'<path d="M3 5v14M6 7v10M9 5v14M13 7v10M16 5v14M20 7v10"/>',
 recycle:'<path d="m7 7 3-5 3 5M10 2 5 11h5m9-1 3 5h-6m6 0-5 6h-5m-4-5-5-2 2-3m-2 3 5 7h6"/>',
 arrows:'<path d="M3 7h18m-5-4 5 4-5 4M21 17H3m5-4-5 4 5 4"/>',
 flag:'<path d="M5 21V4m0 1c6-3 8 3 15 0v11c-7 3-9-3-15 0"/>',
 users:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 5"/>',
 board:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M6 8h1m4 4h2m5-5h1"/>',
 history:'<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6M12 7v5l3 2"/>',
 alert:'<path d="m12 3 10 18H2L12 3Zm0 7v4m0 4h.01"/>',
 bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 10h18c0-2-3-3-3-10ZM10 21h4"/>',
 shield:'<path d="m12 2 9 4v6c0 5-3.4 8-9 10-5.6-2-9-5-9-10V6l9-4Zm-4 10 3 3 5-6"/>',
 logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5m5 5H9"/>',
 launch:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h4"/>',
 menu:'<path d="M4 7h16M4 12h16M4 17h16"/>'
};
function navIcon(name){return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${menuIconPaths[name]||menuIconPaths.dashboard}</svg>`;}

const SIDEBAR_KEY='rv_sidebar_recolhido';
// O mesmo app atende ao painel e à página dedicada para lançamentos no Vercel.
const IS_LAUNCH_PAGE=location.pathname.replace(/\/+$/, '')==='/lancamentos.html';
const IS_VIEW_PAGE=location.pathname.replace(/\/+$/, '')==='/visualizacao.html';

const state={token:localStorage.getItem(TOKEN_KEY)||sessionStorage.getItem(TOKEN_KEY)||'',user:null,route:'dashboard',loja:localStorage.getItem(STORE_KEY)||'151',mapRows:[],staff:[],pending:null};
let toastTimeout;
function toast(msg,error=false){const el=$('#toast');el.textContent=msg;el.classList.toggle('error',!!error);el.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.remove('show'),5200);}
const dataBR=x=>{if(!x)return '—';const y=String(x).slice(0,10);const m=y.match(/^(\d{4})-(\d\d)-(\d\d)/);return m?`${m[3]}/${m[2]}/${m[1]}`:H(y);};
const dtBR=x=>{if(!x)return '—';const d=new Date(x);return Number.isNaN(+d)?String(x):new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(d);};
function nowBrISO(){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}-${parts.day}`;}
function mesBrasil(timestamp){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).formatToParts(new Date(timestamp)).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}`;}
const newId=()=>globalThis.crypto?.randomUUID?.()||`rv-${Date.now()}-${Math.random().toString(36).slice(2)}`;
function statusVal(d,secao='',emQueima=false){const n=Date.parse(`${String(d).slice(0,10)}T12:00:00Z`),h=Date.parse(`${nowBrISO()}T12:00:00Z`);if(!Number.isFinite(n))return ['Sem validade',''];const dias=Math.round((n-h)/86400000);const sensivel=/ALIMENT|CONVENI|NUTRI/i.test(String(secao).normalize('NFD').replace(/[\u0300-\u036f]/g,''));const limite=sensivel?(emQueima?3:15):60;if(dias<=limite)return ['Vencido','red'];if(dias<=160)return ['A vencer','amber'];return ['Vendável','green'];}
const pill=(text,kind='')=>`<span class="pill ${kind}">${H(text)}</span>`;
// Mantém o estado operacional usado pelos filtros, acrescentando o prazo real
// aos badges de A vencer sem classificar um lançamento como vencido mais cedo.
function diasAteVencer(iso){
 const v=Date.parse(String(iso||'').slice(0,10)+'T12:00:00Z');
 const h=Date.parse(nowBrISO()+'T12:00:00Z');
 return Number.isFinite(v)&&Number.isFinite(h)?Math.round((v-h)/86400000):null;
}
function badgeValidade(iso,secao='',emQueima=false){
 const [situacao,classe]=statusVal(iso,secao,emQueima);
 const dias=diasAteVencer(iso);
 const texto=situacao==='A vencer'&&dias!==null?`A vencer · ${dias} ${dias===1?'dia':'dias'}`:situacao;
 return pill(texto,classe);
}

function loading(label='Consultando servidor…'){return `<section class="card card-pad"><div class="notice">${H(label)} Se sua conexão estiver lenta, esta operação pode levar alguns segundos.</div></section>`;}
function empty(label='Nenhum registro encontrado.'){return `<div class="empty"><span class="empty-icon">◎</span><strong>${H(label)}</strong><span>Altere os filtros ou consulte novamente.</span></div>`;}
function header(title,subtitle,extra=''){return `<div class="page-head"><div><span class="eyebrow">Registro de validades</span><h1>${H(title)}</h1><p>${H(subtitle)}</p></div><div class="toolbar">${extra}</div></div>`;}
function table(headers,rows){if(!rows.length)return empty();return `<div class="table-wrap"><table><thead><tr>${headers.map(x=>`<th scope="col">${H(x)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;}
/* Paginação progressiva das tabelas sem paginação própria.
   Mapas/Controle/Queima já paginam antes de montar as linhas: não paginar novamente. */
function paginarTabelasSimples(){
 const content=$('#content');if(!content)return;
 for(const wrap of content.querySelectorAll('.table-wrap')){
   if(wrap.dataset.paginado||wrap.closest('#maps-table,#ctrl-list,#gen-list,#tv-list,#transfer-list,#view-table'))continue;
   const trs=[...wrap.querySelectorAll('tbody > tr')];if(!trs.length)continue;
   wrap.dataset.paginado='1';let page=0;
   const foot=document.createElement('div');foot.className='pager pager-auto';
   foot.innerHTML='<label>Itens por página <select aria-label="Itens por página"><option>15</option><option>25</option><option>50</option></select></label><button type="button" class="btn-outline" data-prev>Anterior</button><span class="page-info"></span><button type="button" class="btn-outline" data-next>Próxima</button>';
   wrap.after(foot);
   const select=foot.querySelector('select'),prev=foot.querySelector('[data-prev]'),next=foot.querySelector('[data-next]'),info=foot.querySelector('.page-info');
   const draw=()=>{
     const n=Number(select.value),total=Math.max(1,Math.ceil(trs.length/n));page=Math.max(0,Math.min(page,total-1));
     trs.forEach((tr,i)=>{tr.hidden=i<page*n||i>=(page+1)*n;});
     info.textContent=`Página ${page+1} de ${total} · ${trs.length} registro(s)`;
     prev.disabled=page===0;next.disabled=page===total-1;
   };
   select.onchange=()=>{page=0;draw();};prev.onclick=()=>{page--;draw();};next.onclick=()=>{page++;draw();};draw();
 }
}
// Mantém um único acesso a Lançamentos mesmo se uma versão antiga adicionar botões repetidos.
// A página de destino é própria do Vercel; não duplica o formulário nem o estado da SPA.
function garantirAcessoUnicoAoLancamento(){
  const sidebar=$('#sidebar'),bottom=sidebar?.querySelector('.side-bottom');
  if(!sidebar||!bottom)return;
  const found=[...sidebar.querySelectorAll('#side-open-launch, .side-launch')];
  if(!found.length)return;
  const principal=found.find(el=>el.tagName==='A')||found[0];
  for(const el of found)if(el!==principal)el.remove();
  if(principal.tagName==='A'){
    if(principal.getAttribute('href')!=='/lancamentos.html')principal.setAttribute('href','/lancamentos.html');
  }
  const logout=bottom.querySelector('#btn-logout');
  if(logout&&principal.nextElementSibling!==logout)bottom.insertBefore(principal,logout);
}
const observerAcessoLancamentos=new MutationObserver(garantirAcessoUnicoAoLancamento);
observerAcessoLancamentos.observe($('#sidebar'),{childList:true,subtree:true});
garantirAcessoUnicoAoLancamento();

const observerTabelas=new MutationObserver(paginarTabelasSimples);
observerTabelas.observe($('#content'),{subtree:true,childList:true});

async function request(path,{method='GET',body=null,retries=method==='GET'?2:0,timeout=45000}={}){
  let last;
  for(let n=0;n<=retries;n++){
    const c=new AbortController();const t=setTimeout(()=>c.abort(),timeout);
    try{
      const res=await fetch('/api'+path,{method,headers:{'Content-Type':'application/json',...(state.token?{'Authorization':`Bearer ${state.token}`}:{})},body:body===null?undefined:JSON.stringify(body),signal:c.signal,cache:'no-store'});
      const data=await res.json().catch(()=>({sucesso:false,mensagem:'Resposta inválida do servidor.'}));
      if(!res.ok){const e=new Error((data.mensagem||`Erro ${res.status}`)+(data.referencia?` (referência: ${data.referencia})`:''));e.code=res.status;throw e;}
      return data;
    }catch(e){last=e;if(e.code===401&&state.user){logout(false);throw new Error('Sessão encerrada. Entre novamente.');}if(n>=retries||e.code&&e.code<500)break;await new Promise(ok=>setTimeout(ok,600*(n+1)));}
    finally{clearTimeout(t);}
  }
  const erro=new Error(last?.name==='AbortError'?'Tempo excedido. A operação pode ter sido concluída no servidor. Verifique antes de enviar novamente.':last?.message||'Falha de conexão.');
  // Preservar o HTTP 401/403: não confundir sessão expirada com falha de internet.
  erro.code=last?.code;
  throw erro;
}
function isAdmin(){return state.user?.perfil==='admin';}
function isGeral(){return state.user?.perfil==='geral';}
function canManage(){return isAdmin()||isGeral();}
function lojaParams(){return state.user?.perfil==='geral'?`loja=${encodeURIComponent(state.loja)}`:'';}
function urlWithLoja(url){return url+(url.includes('?')?'&':'?')+lojaParams();}
function showLogin(error=''){
  $('#login-screen').hidden=false;$('#app-shell').hidden=true;
  const retry=$('#btn-revalidar-sessao');if(retry)retry.hidden=!(error&&state.token);
  const note=$('#login-erro');note.textContent=error;note.hidden=!error;
}
function criarPonteDeLogin(){
  if(!state.user?.id||!state.token)return;
  sessionStorage.setItem(AUTH_BRIDGE_KEY,JSON.stringify({token:state.token,usuario:state.user,emissao:Date.now()}));
}
function consumirPonteDeLogin(){
  if(!(IS_LAUNCH_PAGE||IS_VIEW_PAGE)||!state.token)return null;
  const raw=sessionStorage.getItem(AUTH_BRIDGE_KEY);sessionStorage.removeItem(AUTH_BRIDGE_KEY);
  if(!raw)return null;
  try{
    const v=JSON.parse(raw);
    if(v.token!==state.token||Date.now()-v.emissao>30000||Date.now()<v.emissao||
       !/^[a-f\d-]{36}$/i.test(v.usuario?.id||'')||
       !['admin','funcionario'].includes(v.usuario?.perfil)||
       typeof v.usuario?.nome!=='string')return null;
    return v.usuario;
  }catch{return null;}
}
function configurarBotaoDuploPerfil(){
 const btn=$('#dual-mode-button');
 if(!btn)return;
 const permitido=state.user?.acessoGeral===true && state.user?.perfilBase==='admin';
 btn.hidden=!permitido;
 if(!permitido)return;
 btn.textContent=isGeral()?'← Painel Conferente':'Acessar Painel Geral';
 btn.title=isGeral()?'Voltar às operações da Loja '+String(state.user?.loja||''):'Confirmar PIN para acessar Painel Geral';
}
async function alternarPerfilParaLoja(){
 const btn=$('#dual-mode-button');btn.disabled=true;
 try{
   const r=await request('/conta/modo',{method:'POST',body:{modo:'admin'},retries:0});
   state.user=r.usuario;
   window.location.assign('/#dashboard');
 }catch(err){toast(err.message,true);}finally{btn.disabled=false;}
}
function configurarAcessoDuplo(){
 const btn=$('#dual-mode-button'),dlg=$('#dual-mode-dialog'),form=$('#dual-mode-form');
 if(!btn||!dlg||!form)return;
 $('#dual-mode-cancel').onclick=()=>dlg.close();
 dlg.addEventListener('close',()=>{form.reset();$('#dual-mode-error').hidden=true;});
 btn.onclick=()=>{
   if(!state.user?.acessoGeral||state.user?.perfilBase!=='admin')return;
   if(isGeral()){void alternarPerfilParaLoja();return;}
   form.reset();$('#dual-mode-error').hidden=true;dlg.showModal();form.elements.pin.focus();
 };
 form.onsubmit=async e=>{
   e.preventDefault();const error=$('#dual-mode-error'),save=form.querySelector('[type="submit"]');
   error.hidden=true;save.disabled=true;
   try{
     const r=await request('/conta/modo',{method:'POST',body:{modo:'geral',pin:form.elements.pin.value},retries:0,timeout:45000});
     form.elements.pin.value='';state.user=r.usuario;dlg.close();
     window.location.assign('/#painel-geral');
   }catch(err){error.textContent=err.message;error.hidden=false;form.elements.pin.value='';form.elements.pin.focus();}
   finally{save.disabled=false;}
 };
}
function showApp(fromLogin=false){
  // Funcionários NUNCA entram no Dashboard/Painel Conferente.
  // No celular, após efetuar login, inclusive com #dashboard antigo na URL,
  // abrir a página dedicada de Lançamentos. Acesso explícito do admin a
  // /#dashboard continua permitido após o login.
  if(!IS_LAUNCH_PAGE && !IS_VIEW_PAGE && !isGeral()){
    const mobile=window.matchMedia('(max-width: 900px)').matches;
    if(!isAdmin() || (mobile && (fromLogin || !location.hash))){
      criarPonteDeLogin();
      window.location.replace(mobile?'/lancamentos.html':'/visualizacao.html');
      return;
    }
  }
  transferirEscolhaParaConta(state.user);
  void associarPush(state.user,request);
  queueMicrotask(exibirConsentimento);
  $('#login-screen').hidden=true;$('#app-shell').hidden=false;
  configurarBotaoDuploPerfil();
  $('#user-name').textContent=state.user.nome;
  $('#user-role').textContent=({admin:'Administrador de loja',geral:'Administrador Geral',funcionario:'Funcionário'})[state.user.perfil]||state.user.perfil;
  $('#workspace-store').textContent=isGeral()?'Administração geral':'Loja '+state.user.loja;
  $('#avatar').textContent=(state.user.nome||'U').slice(0,1).toUpperCase();
  $('#launch-to-panel').hidden=!isAdmin();$('#side-open-launch').hidden=isGeral();
  const items=isGeral()?menusGeral:menus.filter(m=>isAdmin()||m[0]==='notificacoes');
  $('#menu').innerHTML=items.map(([id,icon,title],i)=>`${i===0?'<div class="nav-group">Principal</div>':''}${i===4?'<div class="nav-group">Gestão</div>':''}<button class="nav-item" data-route="${id}" type="button" title="${H(title)}"><span class="nav-icon" aria-hidden="true">${navIcon(icon)}</span><span class="nav-label">${H(title)}</span></button>`).join('');
  $('#menu').onclick=e=>{const btn=e.target.closest('[data-route]');if(btn)navigate(btn.dataset.route);};
  const p=localStorage.getItem(PENDING_KEY);if(p){try{const saved=JSON.parse(p);state.pending=(!saved.ownerId||saved.ownerId===state.user.id)?saved:null;}catch{localStorage.removeItem(PENDING_KEY);}}
  const collapsed=localStorage.getItem(SIDEBAR_KEY)==='1';
  $('#app-shell').classList.toggle('sidebar-collapsed',collapsed);
  $('#sidebar-collapse').setAttribute('aria-expanded',String(!collapsed));
  $('#sidebar-collapse').textContent='◈';
  $('#sidebar-collapse').title=collapsed?'Expandir menu':'Recolher menu';
  $('#sidebar-collapse').setAttribute('aria-label',collapsed?'Expandir menu':'Recolher menu');
  if(IS_LAUNCH_PAGE){
    if(isGeral()){window.location.replace('/#painel-geral');return;}
    navigate('lancamentos');return;
  }
  if(IS_VIEW_PAGE){
    if(isGeral()){window.location.replace('/#painel-geral');return;}
    navigate('visualizacao');return;
  }
  const allowed=items.map(x=>x[0]),requested=(location.hash||'').replace('#','');
  navigate(allowed.includes(requested)?requested:(isGeral()?'painel-geral':'dashboard'));
  if(requested==='lancamentos'&&!isGeral())queueMicrotask(abrirNovoLancamento);
}
async function logout(call=true){
 void fecharScanner();
 if(call&&state.token){
   // Primeiro revoga a assinatura da sessão atual; depois encerra a sessão no banco.
   await Promise.race([desassociarPush(request),new Promise(resolve=>setTimeout(resolve,2300))]);
   await request('/logout',{method:'POST',timeout:7000}).catch(()=>{});
 }
 localStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem(TOKEN_KEY);sessionStorage.removeItem(AUTH_BRIDGE_KEY);
 state.token='';state.user=null;showLogin();
}
function mobileClose(){$('#sidebar').classList.remove('open');$('#menu-backdrop').hidden=true;}
function navigate(route){
 void fecharScanner();
 if(!isAdmin()&&!isGeral()&&!IS_VIEW_PAGE&&!IS_LAUNCH_PAGE){
   // URL/hash digitado manualmente não concede acesso ao Dashboard.
   window.location.replace(window.matchMedia('(max-width: 900px)').matches?'/lancamentos.html':'/visualizacao.html');return;
 }
 // A Visualização é uma página independente também para o Administrador de Loja.
 // Ela não é rota do menu lateral do Painel Conferente.
 if(IS_VIEW_PAGE){
   if(route!=='visualizacao'){
     if(route==='lancamentos'){window.location.assign('/lancamentos.html');return;}
     if(isAdmin()){window.location.assign('/#'+encodeURIComponent(route));return;}
     route='visualizacao'; // funcionário não possui acesso ao painel
   }
   state.route='visualizacao';
   if(location.hash!=='#visualizacao')history.replaceState(null,'',location.pathname+location.search+'#visualizacao');
   mobileClose();$('#breadcrumb-current').textContent='Visualização dos Lançamentos';
   renderRoute('visualizacao');return;
 }
 if(IS_LAUNCH_PAGE&&route!=='lancamentos'){window.location.assign(isAdmin()?'/#'+encodeURIComponent(route):'/visualizacao.html');return;}
 if(route==='lancamentos'&&IS_LAUNCH_PAGE&&!isGeral()){
   state.route='lancamentos';if(location.hash!=='#lancamentos')location.hash='lancamentos';mobileClose();
   $('#breadcrumb-current').textContent='Lançamentos';
   renderRoute('lancamentos');return;
 }
 const allowed=isGeral()?menusGeral.map(x=>x[0]):menus.filter(m=>isAdmin()||m[0]==='notificacoes').map(x=>x[0]);
 if(route==='lancamentos'){if(!isGeral())return abrirNovoLancamento();route='mapas';}
 if(!allowed.includes(route))route=isGeral()?'painel-geral':'dashboard';
 state.route=route;location.hash=route;mobileClose();
 document.querySelectorAll('[data-route]').forEach(b=>b.classList.toggle('active',b.dataset.route===route));
 $('#breadcrumb-current').textContent=[...menus,...menusGeral].find(m=>m[0]===route)?.[2]||'Painel';
 renderRoute(route);
}
async function renderRoute(route){
 const content=$('#content');content.innerHTML=loading();try{
  if(state.user?.perfil==='funcionario'&&!['lancamentos','visualizacao'].includes(route)){
    // Guarda adicional contra chamadas diretas ou hash alterado por funcionário.
    window.location.replace(window.matchMedia('(max-width:900px)').matches?'/lancamentos.html':'/visualizacao.html');return;
  }
  if(isGeral()&&!['painel-geral','admins-geral','notificacoes'].includes(route))throw new Error('Use o Painel Geral para administrar as lojas.');
  switch(route){case 'painel-geral':await painelGeral();break;case 'admins-geral':await administradoresGeral();break;
   case 'dashboard':await dashboard();break;case 'lancamentos':await lancamentos(false);break;case 'visualizacao':await renderVisualizacao({request,content,user:state.user,isAdmin,statusVal,badgeValidade,nowBrISO,toast,confirmDialog});break;case 'mapas':await mapas();break;case 'controle-validade':await controleValidade();break;
   case 'perdas':await perdas();break;case 'transferencias':await transferenciasPainel();break;case 'estoque-mapa':await mapas('Estoque');break;case 'saldo':await saldo();break;
   case 'produtos':await produtos();break;case 'usuarios':await usuarios();break;case 'organizacao-secoes':if(!isAdmin())throw new Error('Seções: acesso reservado ao administrador da loja.');await renderOrganizacaoSecoes({request,content,header,toast});break;case 'auditoria':await generic('auditoria','Histórico de operações');break;
   case 'pendencias':await pendencias();break;case 'notificacoes':await notificacoes();break;default:await generic(route,menus.find(m=>m[0]===route)?.[2]||route);}
 }catch(e){content.innerHTML=header('Não foi possível carregar','Verifique a conexão e tente novamente.')+`<div class="card card-pad"><div class="notice danger">${H(e.message)}</div><div class="form-actions"><button class="primary" id="btn-reload">Tentar novamente</button></div></div>`;$('#btn-reload').onclick=()=>renderRoute(route);}}
async function getMaps(mapa=''){const p=new URLSearchParams();if(lojaParams())p.set('loja',state.loja);if(mapa)p.set('mapa',mapa);const d=await request('/mapas?'+p.toString());state.mapRows=d.registros||[];return state.mapRows;}
function counts(rows){const d={total:0,vencido:0,proximo:0,ok:0};for(const r of rows){d.total+=Number(r.quantidade)||0;const s=statusVal(r.validade,r.secao)[0];if(s==='Vencido')d.vencido++;else if(s==='A vencer')d.proximo++;else d.ok++;}return d;}
async function dashboard(){
 const base=await getMaps(),ativos=base.filter(x=>Number(x.quantidade)>0);
 const now=nowBrISO().slice(0,7),status=counts(ativos);
 const [queima,vencidos,estoque]=isAdmin()?await Promise.all([request('/queima').catch(e=>({_erro:e.message,registros:[]})),request('/vencidos').catch(()=>({registros:[]})),request('/estoque').catch(()=>({registros:[]}))]):[{registros:[]},{registros:[]},{registros:[]}];
 const queue=queima.registros||[],removed=vencidos.registros||[],stock=estoque.registros||[];
 const mes=base.filter(x=>String(x.mes_lancamento||'').startsWith(now));
 const semMapa=stock.filter(x=>Number(x.quantidade)>0&&!ativos.some(m=>m.ean===x.ean));
 const proximos=ativos.filter(x=>statusVal(x.validade,x.secao)[0]==='A vencer');
 const primeiroPrazo=proximos.length?Math.min(...proximos.map(x=>diasAteVencer(x.validade)).filter(n=>n!=null)):null;
 // Relançamento de mês anterior gera novo registro: não somar o histórico relançado duas vezes.
 const queueAtiva=queue.filter(x=>x.estado!=='relancado');
 const queimados=queueAtiva.length;
 const queimaMes=queueAtiva.filter(x=>mesBrasil(x.criado_em)===now).length;
 const grafico=resumoQueima(ativos,queue);
 const pctAprovado=grafico.total?100*grafico.aprovados/grafico.total:0;
 const pctPendente=grafico.total?100*grafico.pendentes/grafico.total:0;
 const fimAprovado=pctAprovado;
 const fimPendente=pctAprovado+pctPendente;
 const atencao=ativos.filter(x=>statusVal(x.validade,x.secao)[0]!=='Vendável').sort((a,b)=>String(a.validade).localeCompare(String(b.validade)));
 const countStatus={dentro:ativos.filter(x=>statusVal(x.validade,x.secao)[0]==='Vendável').length,proximos:proximos.length,vencidos:status.vencido,sem:semMapa.length},total=Object.values(countStatus).reduce((a,b)=>a+b,0)||1;
 $('#content').innerHTML=header('Painel Conferente','Indicadores calculados sobre os registros da loja. Mês de lançamento separado do vencimento.',
 `${isAdmin()?'<button id="dash-new" class="primary" type="button">Ir para Lançamentos</button>':''}<button id="dash-print" class="btn-outline" type="button">Imprimir resumo</button><button id="dash-refresh" class="btn-outline" type="button">Atualizar</button>`)+
 `<div class="stat-grid"><div class="card stat"><small>Total de lançamentos</small><strong>${base.length}</strong><p class="stat-subtitle">Lançamentos do mês: <b>${mes.length}</b></p></div>
 <div class="card stat"><small>Total lançado na Queima</small><strong>${queima._erro?'—':queimados}</strong><p class="stat-subtitle">${queima._erro?'Consulta indisponível':`Lançamentos do mês: <b>${queimaMes}</b>`}</p></div>
 <div class="card stat warn"><small>A vencer (até 160 dias)</small><strong>${proximos.length}</strong><p class="stat-subtitle">${primeiroPrazo===null?'Sem registros a vencer':`Próxima validade em ${primeiroPrazo} ${primeiroPrazo===1?'dia':'dias'}`}</p></div>
 <div class="card stat danger"><small>Vencidos (regras da loja)</small><strong>${status.vencido}</strong><p>Inclui limite de retirada antecipada</p></div></div>
 ${queima._erro?`<section class="card card-pad queima-progress"><h2>Queima — situação dos produtos</h2><div class="notice warn">Não foi possível carregar a Queima. Atualize o Dashboard para recalcular o gráfico; valores indisponíveis não são considerados como zero.</div></section>`:`<section class="card card-pad queima-progress"><div class="page-head"><div><h2>Queima — situação dos produtos dos mapas</h2><p>Distribuição dos registros ativos dos mapas e dos lançamentos na Queima da loja, sem duplicar relançamentos anteriores.</p></div></div>
 <div class="queima-progress-layout"><div class="queima-donut" role="img" aria-label="${grafico.naoLancados} não lançados na Queima, ${grafico.pendentes} lançados e não aprovados, ${grafico.aprovados} aprovados. Total ${grafico.total} registros." style="--percentual-aprovado:${fimAprovado}%;--percentual-pendente:${fimPendente}%">
 <div class="queima-donut-center"><strong>${grafico.total}</strong><small>Registros</small></div></div>
 <div class="queima-donut-legend"><div><span class="queima-key nao-lancado"></span><span>Não lançados na Queima</span><strong>${grafico.naoLancados} <small>(${grafico.percentuais.naoLancados}%)</small></strong></div><div><span class="queima-key pendente"></span><span>Lançados, não aprovados</span><strong>${grafico.pendentes} <small>(${grafico.percentuais.pendentes}%)</small></strong></div><div><span class="queima-key aprovado"></span><span>Aprovados</span><strong>${grafico.aprovados} <small>(${grafico.percentuais.aprovados}%)</small></strong></div><div class="queima-legend-total"><span>Total de registros acompanhados</span><strong>${grafico.total}</strong></div><small>Base: lançamentos ativos dos mapas + lançamentos sem mapa vinculado na Queima. Cada lançamento é contado uma vez; os estados históricos “Relançado” não são somados.</small></div></div></section>`}
 <div class="split"><section class="card card-pad"><h2>Resumo de validade</h2><div class="kpi-list">
 ${[['Dentro da validade',countStatus.dentro],['A vencer',countStatus.proximos],['Vencidos',countStatus.vencidos],['Sem informação no mapa',countStatus.sem]].map(([label,n])=>`<div><span>${H(label)}${label==='A vencer'&&primeiroPrazo!==null?`<small class="validade-minima">Próximo: ${primeiroPrazo} ${primeiroPrazo===1?'dia':'dias'}</small>`:''}</span><strong>${n} (${Math.round(n/total*100)}%)</strong></div>`).join('')}</div>
 <div class="footer-hint">Regras de corte operacional preservadas: padrão 60 dias, alimentos/nutrição/conveniência 15 dias, Queima sensível 3 dias; faixa de atenção até 160 dias.</div></section>
 <section class="card card-pad"><h2>Totais operacionais</h2><div class="kpi-list"><div><span>Produtos registrados em mapas</span><strong>${ativos.length}</strong></div><div><span>Unidades em mapas</span><strong>${status.total}</strong></div><div><span>Vencidos e retiradas</span><strong>${removed.length}</strong></div><div><span>Saldo Procfit sem mapa</span><strong>${semMapa.length}</strong></div></div></section></div>
 <section class="card card-pad secondary-card"><div class="page-head"><h2>Produtos que precisam de atenção</h2><button class="btn-outline" id="dash-control" type="button">Abrir Controle de Validade</button></div>
 <div class="filter-row"><input id="dash-search" class="wide" placeholder="Buscar produto ou lote"><select id="dash-status"><option value="">Todos</option><option>Vencido</option><option>A vencer</option></select></div><p class="footer-hint" id="dash-count"></p><div id="dash-table"></div></section>`;
 const draw=()=>{const q=$('#dash-search').value.toLowerCase(),state=$('#dash-status').value,items=atencao.filter(x=>(!state||statusVal(x.validade,x.secao)[0]===state)&&[x.descricao,x.ean,x.lote,x.codigoInterno].join(' ').toLowerCase().includes(q));
 $('#dash-count').textContent=`${items.length} registro(s) de atenção`;
 $('#dash-table').innerHTML=table(['Produto / EAN','Mapa','Lote','Validade','Quantidade','Situação'],items.slice(0,200).map(r=>`<tr><td><strong>${H(r.descricao||r.ean)}</strong><span class="second">${H(r.ean)}</span></td><td>${H(r.mapa_nome)}</td><td>${H(r.lote)}</td><td>${dataBR(r.validade)}</td><td>${H(r.quantidade)}</td><td>${badgeValidade(r.validade,r.secao)}</td></tr>`));};
 $('#dash-search').oninput=draw;$('#dash-status').onchange=draw;draw();
 $('#dash-refresh').onclick=()=>renderRoute(state.route);
 $('#dash-print').onclick=()=>window.print();$('#dash-control').onclick=()=>navigate('controle-validade');$('#dash-new')?.addEventListener('click',abrirNovoLancamento);
}

async function staffList(){if(!isAdmin())return [];const d=await request(urlWithLoja('/usuarios'));state.staff=d.usuarios||[];return state.staff;}
async function lancamentos(emModal=false){
 const saved=state.pending;
 const notice=saved?`<div class="notice warn">Existe uma solicitação ainda não confirmada neste dispositivo (EAN ${H(saved.ean)}). Use <strong>Retomar tentativa</strong> antes de criar outra.</div>`:'';
 const standaloneActions=IS_LAUNCH_PAGE?`<a class="btn-outline" href="/visualizacao.html">◫ Visualizar meu mapa</a>${isAdmin()?'<a class="btn-outline" href="/#dashboard">← Painel Conferente</a>':''}<button type="button" class="btn-outline" id="launch-logout-standalone">Sair da conta</button>`:'';
 const specialOptions=special.map(m=>`<option value="${H(m)}">${H(m)}</option>`).join('');
 const adminControls=isAdmin()?`<label class="full">Tipo de lançamento<select id="launch-kind" name="tipoRegistro"><option value="mapa">Mapa especial</option><option value="transferencia">Transferência recebida</option></select></label><label id="launch-map-destination" class="full">Mapa de destino<select name="mapa" required>${specialOptions}</select></label><div id="launch-transfer-fields" class="form-grid full" hidden><label>Loja de origem<input name="loja_origem" inputmode="numeric" pattern="[0-9]{1,12}" maxlength="12" placeholder="Número da loja de origem"></label><label>Romaneio<input name="romaneio" maxlength="100" placeholder="Número do romaneio"></label><p class="footer-hint full">A loja de destino será sempre a loja da sessão (${H(state.user.loja)}).</p></div>`:
   `<div class="notice full"><strong>Mapa de destino:</strong> ${H(state.user.nome)}. O destino é definido automaticamente pelo seu login.</div>`;
 const launchMarkup=header('Novo lançamento','Lançamento no mapa da sessão; administradores também podem lançar nas abas especiais ou registrar transferências.',standaloneActions)+
 `<div class="split"><div class="card card-pad"><h2>Dados do produto</h2>${notice}
 <form id="form-launch" class="stack"><div class="form-grid">${adminControls}
 <div class="full product-identity" id="product-identity" aria-live="polite"><strong>Produto não consultado</strong><span>Leia ou digite um EAN para identificar o produto.</span></div>
 <div class="ean-field"><label for="launch-ean">EAN (8 a 14 dígitos)</label><div class="ean-input-row"><input id="launch-ean" name="ean" required inputmode="numeric" pattern="[0-9]{8,14}" autocomplete="off" maxlength="14" placeholder="Bipe ou digite o EAN" ${IS_LAUNCH_PAGE?'':'autofocus'}><button class="btn-outline ean-camera-button" type="button" id="scan-ean" aria-label="Ler EAN pela câmera"><span aria-hidden="true">📷</span><span>Ler câmera</span></button></div></div>
 <label>Lote<input name="lote" required maxlength="100" placeholder="Lote da embalagem"></label>
 <label>Validade (DD/MM/AA ou MM/AA)<input id="launch-validade" name="validade_digitada" required type="text" inputmode="numeric" autocomplete="off" maxlength="10" placeholder="Ex.: 31/01/26 ou 01/26"><small>Quando informar só mês e ano, será considerado o último dia do mês.</small></label>
 <label>Quantidade<input name="quantidade" required type="number" min="1" max="999999" step="1" value="1"></label></div>
 <div class="notice">A gravação registra o mês automaticamente e mantém o identificador da tentativa caso a conexão caia.</div>
 <div class="form-actions"><button class="btn-outline" type="button" id="lookup-product">Consultar EAN</button>${saved?'<button class="btn-outline" type="button" id="retry-launch">Retomar tentativa pendente</button>':''}<button class="primary" type="submit" id="save-launch">Registrar produto</button></div>
 </form><div id="launch-result" aria-live="polite"></div></div>
 <div class="card card-pad"><h2>Consulta do catálogo</h2><div id="product-preview" class="notice">Digite o EAN e consulte. Você ainda pode registrar o produto se o catálogo estiver temporariamente indisponível.</div><div class="footer-hint">O nome encontrado também aparece sobre o EAN. Códigos são sempre tratados como texto, inclusive os que começam com zero.</div></div></div>`;
 if(emModal){$('#launch-body').innerHTML=launchMarkup;$('#launch-dialog').showModal();}else{$('#content').innerHTML=launchMarkup;}
 const f=$('#form-launch'),ident=$('#product-identity');
 if(IS_LAUNCH_PAGE){const exit=$('#launch-logout-standalone');if(exit)exit.onclick=()=>logout();}
 if(!IS_LAUNCH_PAGE||window.matchMedia('(min-width:768px)').matches)f.elements.ean.focus();
 const mode=f.elements.tipoRegistro;
 if(mode){mode.onchange=()=>{
   const transfer=mode.value==='transferencia';
   $('#launch-transfer-fields').hidden=!transfer;
   $('#launch-map-destination').hidden=transfer;
   f.elements.mapa.required=!transfer;
   f.elements.loja_origem.required=transfer;
   f.elements.romaneio.required=transfer;
   $('#save-launch').textContent=transfer?'Registrar transferência':'Registrar produto';
 };}
 const validade=f.elements.validade_digitada;
 validade.oninput=()=>{const pos=validade.selectionStart;const old=validade.value;validade.value=mascararValidade(old);if(document.activeElement===validade&&pos===old.length)validade.setSelectionRange(validade.value.length,validade.value.length);};
 f.elements.ean.oninput=()=>{ident.innerHTML='<strong>Produto não consultado</strong><span>Consulte o EAN para confirmar a descrição.</span>';};
 f.querySelector('#scan-ean').onclick=()=>{try{abrirScannerEAN({input:f.elements.ean,onDetected:()=>{if(f.isConnected)f.querySelector('#lookup-product')?.click();}});}catch(e){toast(e.message,true);}};
 $('#lookup-product').onclick=async()=>{
   const ean=f.elements.ean.value.trim();if(!/^\d{8,14}$/.test(ean))return toast('Digite um EAN válido.',true);
   $('#product-preview').textContent='Consultando…';ident.textContent='Consultando produto…';
   try{const d=await request('/produtos?q='+encodeURIComponent(ean)+'&limite=2');const r=(d.produtos||[]).find(p=>p.ean===ean)||d.produtos?.[0];
     ident.innerHTML=r?`<strong>${H(r.descricao||'Sem descrição')}</strong><span>${H(r.secao||'Seção não informada')} · Código interno: ${H(r.codigo_interno||'—')}</span>`:'<strong>Produto não localizado no catálogo</strong><span>Confirme o EAN antes de salvar.</span>';
     $('#product-preview').innerHTML=r?`<strong>${H(r.descricao||'Sem descrição')}</strong><div class="detail-meta" style="margin-top:12px"><div><small>Código interno</small><strong>${H(r.codigo_interno||'—')}</strong></div><div><small>Seção</small><strong>${H(r.secao||'—')}</strong></div></div>`:'Produto não localizado. Confira o EAN e prossiga, se estiver correto.';
   }catch(e){ident.innerHTML='<strong>Catálogo indisponível</strong><span>Confira o EAN manualmente.</span>';$('#product-preview').textContent='Consulta indisponível: '+e.message;}
 };
 f.onsubmit=async e=>{
   e.preventDefault();prepararAudio();if(state.pending){toast('Conclua ou confira a solicitação pendente antes de criar outra.',true);return;}
   let iso;try{iso=validadeParaISO(f.elements.validade_digitada.value);}catch(err){toast(err.message,true);validade.focus();return;}
   const transfer=isAdmin()&&mode?.value==='transferencia';
   const x={requestId:newId(),ownerId:state.user.id,tipoRegistro:transfer?'transferencia':'mapa',ean:f.elements.ean.value.trim(),lote:f.elements.lote.value.trim(),validade:iso,quantidade:Number(f.elements.quantidade.value)};
   if(transfer){x.loja_origem=f.elements.loja_origem.value.trim();x.romaneio=f.elements.romaneio.value.trim();}
   else x.mapa=isAdmin()?f.elements.mapa.value:state.user.nome;
   if(!/^\d{8,14}$/.test(x.ean)||!x.lote||x.quantidade<=0||(transfer&&(!/^\d{1,12}$/.test(x.loja_origem)||!x.romaneio))){toast('Confira os campos do lançamento.',true);return;}
   state.pending=x;localStorage.setItem(PENDING_KEY,JSON.stringify(x));await submitLaunch(x,f);
 };
 if(saved)$('#retry-launch').onclick=()=>{prepararAudio();submitLaunch(saved,f);};
}

async function abrirNovoLancamento(){
 if(isGeral())return;
 const dialog=$('#launch-dialog');if(dialog.open)return;
 $('#launch-body').innerHTML=loading('Preparando formulário…');
 try{await lancamentos(true);}catch(e){toast(e.message,true);$('#launch-body').innerHTML=`<p class="notice danger">${H(e.message)}</p>`;dialog.showModal();}
}

let audioConfirmacao=null;
function prepararAudio(){
  // A ativação acontece na interação com o botão de registrar (não depois do fetch).
  try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
    audioConfirmacao=audioConfirmacao||new Audio();
    if(audioConfirmacao.state==='suspended')void audioConfirmacao.resume();
  }catch{/* Som opcional. */}
}
function tocarConfirmacao(){
 try{if(!audioConfirmacao||audioConfirmacao.state!=='running')return;
   const ctx=audioConfirmacao,osc=ctx.createOscillator(),gain=ctx.createGain();
   osc.type='sine';osc.frequency.setValueAtTime(770,ctx.currentTime);
   osc.frequency.setValueAtTime(980,ctx.currentTime+.085);
   gain.gain.setValueAtTime(.0001,ctx.currentTime);
   gain.gain.exponentialRampToValueAtTime(.07,ctx.currentTime+.012);
   gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.19);
   osc.connect(gain).connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.20);
 }catch{/* Em navegadores sem áudio permitido, a gravação continua funcionando. */}
}
let envioLancamentoEmAndamento=false;
async function submitLaunch(data, form) {
 if(envioLancamentoEmAndamento)return;envioLancamentoEmAndamento=true;
 const btn = $('#save-launch');
 if (btn) btn.disabled = true;
 $('#launch-result').innerHTML = '<div class="notice">Enviando ao servidor… Aguarde a confirmação.</div>';
 try {
   const r = await request(urlWithLoja(data.tipoRegistro === 'transferencia' ? '/transferencias' : '/mapas'), {
     method: 'POST',
     body: {...data, ...(state.user.perfil === 'geral' ? {loja: state.loja} : {})},
     timeout: 60000
   });
   if (r.status === 'duplicate') {
     const accepted = await confirmDialog('Produto já cadastrado', `O mapa já tem ${r.quantidadeExistente} unidade(s) deste EAN, lote e validade. Deseja acrescentar outra ocorrência?`);
     if (accepted) {
       data.confirmarDuplicado = true;
       localStorage.setItem(PENDING_KEY, JSON.stringify(data));
       envioLancamentoEmAndamento=false;return await submitLaunch(data, form);
     }
     state.pending=null;localStorage.removeItem(PENDING_KEY);
     $('#launch-result').innerHTML = '<div class="notice warn">Lançamento repetido cancelado. Nenhuma linha foi gravada.</div>';
     return;
   }
   if (r.status === 'saved' || (data.tipoRegistro === 'transferencia' && r.sucesso === true)) {
     state.pending = null;
     localStorage.removeItem(PENDING_KEY);
     $('#launch-result').innerHTML = `<div class="result-tip">✔ ${data.tipoRegistro === 'transferencia' ? 'Transferência registrada' : 'Produto registrado'} com sucesso. ${r.idempotente ? '(Resposta recuperada após reenvio)' : ''}${r.pendenciaEan?' · EAN não cadastrado: pendência aberta para revisão.':''}</div>`;
     toast(data.tipoRegistro === 'transferencia' ? 'Transferência registrada com sucesso.' : 'Produto registrado com sucesso.');
     tocarConfirmacao();
     form.reset();
     form.elements.quantidade.value = 1;
     form.querySelector('#launch-kind')?.dispatchEvent(new Event('change'));
     form.querySelector('#product-identity').innerHTML='<strong>Produto não consultado</strong><span>Leia o próximo EAN.</span>';
     form.elements.ean.focus();
     return;
   }
   throw new Error(r.mensagem || 'Sem confirmação definitiva de gravação.');
 } catch (e) {
   toast(e.message, true);
   $('#launch-result').innerHTML = `<div class="notice warn">${H(e.message)} A solicitação permanece salva neste aparelho. <button class="btn-outline" id="retry-pending-inline" type="button">Reenviar a mesma tentativa</button></div>`;
   $('#retry-pending-inline').onclick = () => {prepararAudio();submitLaunch(data, form);};
 } finally {
   if (btn) btn.disabled = false;envioLancamentoEmAndamento=false;
 }
}

async function confirmDialog(title,message){const d=$('#confirm-dialog');$('#dialog-title').textContent=title;$('#dialog-message').textContent=message;return new Promise(resolve=>{d.addEventListener('close',()=>resolve(d.returnValue==='confirm'),{once:true});d.showModal();});}
function exportCsv(nome, cabecalho, linhas){
 const safe=v=>{
   const value=String(v??'');
   // CSV protegido contra fórmulas em Excel/LibreOffice; EAN em formato textual.
   const clean=/^[=+@\-\t\r]/.test(value)?"'"+value:value;
   return '"'+clean.replace(/"/g,'""')+'"';
 };
 const csv='\uFEFF'+[cabecalho,...linhas].map(row=>row.map(safe).join(';')).join('\r\n');
 const a=document.createElement('a'),blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob);
 a.href=url;a.download=nome;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function printableTable(target,makeAll){
 const host=$(target),before=host.innerHTML;host.innerHTML=makeAll();host.querySelectorAll('tbody tr[hidden]').forEach(x=>x.hidden=false);host.querySelectorAll('.pager-auto').forEach(x=>x.hidden=true);
 const done=()=>{host.innerHTML=before;for(const wrap of host.querySelectorAll('.table-wrap[data-paginado]')){wrap.removeAttribute('data-paginado');wrap.nextElementSibling?.matches('.pager-auto')&&wrap.nextElementSibling.remove();}host.querySelectorAll('tbody tr[hidden]').forEach(x=>x.hidden=false);paginarTabelasSimples();window.removeEventListener('afterprint',done);};
 window.addEventListener('afterprint',done,{once:true});
 window.print();setTimeout(done,12000);
}
function mapsTable(rows,{actions=false,selectable=false}={}){
 return table([...(selectable?['Selecionar']:[]),'Produto / EAN','Mapa','Lote','Validade','Qtd.','Mês lançado','Situação',...(actions?['Ação']:[])],
 rows.map(r=>`<tr>${selectable?`<td><input class="row-select" type="checkbox" data-check-map="${H(r.id)}" aria-label="Selecionar ${H(r.descricao||r.ean)}"></td>`:''}
 <td><span class="product-name">${H(r.descricao||'Sem descrição')}</span><span class="second">${H(r.codigoInterno||'—')} · ${H(r.ean)}</span></td>
 <td>${H(r.mapa_nome)}</td><td>${H(r.lote)}</td><td>${dataBR(r.validade)}</td><td>${H(r.quantidade)}</td><td>${H(String(r.mes_lancamento||'').slice(0,7))}</td><td>${badgeValidade(r.validade,r.secao)}</td>
 ${actions?`<td class="row-actions"><button type="button" class="action-link" data-edit="${H(r.id)}">Editar</button><button type="button" class="action-link danger-text" data-remove-map="${H(r.id)}">Excluir registro</button>${Number(r.quantidade)>0?`<button type="button" class="action-link" data-send-map="${H(r.id)}" data-send-to="${statusVal(r.validade,r.secao)[0]==='Vencido'?'vencidos':'queima'}">${statusVal(r.validade,r.secao)[0]==='Vencido'?'Lançar como Vencido':'Lançar na Queima'}</button>${r.tipo_mapa==='Estoque'?`<button type="button" class="action-link" data-descer-map="${H(r.id)}">Descer para mapa</button>`:''}`:''}</td>`:''}</tr>`));
}
async function mapas(forced=''){
 const rows=await getMaps(forced),tipo=[...new Set(rows.map(r=>r.mapa_nome))].sort();
 const isStock=forced==='Estoque',able=isAdmin();let page=0,selected=new Set(),filtered=[];
 const title=isStock?'Estoque':'Mapa de Validade';
 const head=header(title,isStock?'Produtos armazenados antes de irem à seção.':'Mapas de todos os meses; filtros por funcionário, mês, validade e situação.',
 `${!isStock?'<button type="button" class="primary" id="map-novo">Novo lançamento</button>':''}<button class="btn-outline" id="map-print" type="button">Imprimir mapa</button><button class="btn-outline" id="map-csv" type="button">Exportar CSV</button>`);
 $('#content').innerHTML=head+(isStock?'':`<div class="page-subnav compare-tabs" role="tablist" aria-label="Mapa e conferência"><button id="map-tab-list" type="button" class="btn-outline" role="tab" aria-selected="true">Mapa de Validade</button><button id="map-tab-compare" type="button" class="btn-outline" role="tab" aria-selected="false">Conferir com estoque</button></div>`)+`<section class="card card-pad" id="map-main-card"><div class="filter-row">
 <input id="map-search" class="wide" aria-label="Buscar produto ou EAN" placeholder="Produto, EAN ou código interno">
 <input id="map-lot" placeholder="Lote" aria-label="Filtrar lote">
 ${!isStock&&able?`<select id="map-owner"><option value="">Todos os mapas</option>${tipo.map(x=>`<option value="${H(x)}">${H(x)}</option>`).join('')}</select>`:''}
 <select id="map-status"><option value="">Todas as situações</option><option value="Vencido">Vencido</option><option value="A vencer">A vencer</option><option value="Vendável">Vendável</option></select>
 <label>Mês do mapa <input type="month" id="map-month"></label><label>Validade a partir de <input type="date" id="map-valid-from" class="filter-date"></label>
 <label>Validade até <input type="date" id="map-valid-to" class="filter-date"></label>
 <label>Linhas por página <select id="map-size"><option>15</option><option>25</option><option>50</option></select></label>
 <button class="btn-outline" id="map-clear" type="button">Limpar filtros</button><button class="btn-outline" id="reload-maps" type="button">Atualizar</button></div>
 ${isStock?'<div class="page-subnav"><button id="stock-all" class="btn-outline" type="button" aria-pressed="true">Estoque atual</button><button id="stock-expired" class="btn-outline" type="button" aria-pressed="false">Vencidos do Estoque</button></div>':''}<div class="panel-actions">${able?'<label class="toolbar-checkbox"><input id="map-select-all" type="checkbox"> Selecionar página</label><button class="btn-outline" id="map-to-queima" type="button">Lançar na Queima</button><button class="btn-outline" id="map-to-vencidos" type="button">Mover para Vencidos</button><button class="btn-outline" id="map-unselect" type="button">Limpar seleção</button>':''}</div>
 <p class="footer-hint" id="map-counter"></p><div id="maps-table"></div><div class="pager"><button id="map-prev" class="btn-outline" type="button">Anterior</button><span id="map-page-label"></span><button id="map-next" class="btn-outline" type="button">Próxima</button></div></section>`+(isStock?'':`<section id="map-compare-section" class="card card-pad" hidden><h2>Conferência do mapa com o estoque importado</h2><p class="footer-hint">Usa os saldos do ODS já importado em <strong>Controle de Estoque / Saldo Procfit</strong>. Não altera nenhuma quantidade dos mapas. O saldo do produto é distribuído entre os lotes, começando pela validade mais próxima.</p><div class="filter-row"><label>Mês do mapa <input id="compare-month" type="month" aria-label="Mês para comparar ao estoque"></label><label>Itens por página <select id="compare-size"><option>25</option><option>50</option><option>100</option></select></label><button class="btn-outline" id="compare-refresh" type="button">Reconsultar estoque</button><button class="btn-outline" id="compare-csv" type="button">Exportar conferência CSV</button></div><div id="compare-notice" class="notice">Selecione o mês do mapa para comparar com o saldo importado.</div><div id="compare-summary" class="compare-summary" aria-live="polite"></div><div id="compare-table"></div><div class="pager"><button id="compare-prev" class="btn-outline" type="button">Anterior</button><span id="compare-page"></span><button id="compare-next" class="btn-outline" type="button">Próxima</button></div></section>`);
 const paged=()=>filtered.slice(page*Number($('#map-size').value),(page+1)*Number($('#map-size').value));
 const draw=()=>{
  page=Math.min(page,Math.max(0,Math.ceil(filtered.length/Number($('#map-size').value))-1));
  $('#maps-table').innerHTML=mapsTable(paged(),{actions:able,selectable:able});
  for(const cb of document.querySelectorAll('[data-check-map]'))cb.checked=selected.has(cb.dataset.checkMap);
  $('#map-prev').disabled=page===0;$('#map-next').disabled=(page+1)*Number($('#map-size').value)>=filtered.length;
  if($('#map-select-all')){$('#map-select-all').checked=paged().length>0&&paged().every(x=>selected.has(x.id));$('#map-select-all').indeterminate=paged().some(x=>selected.has(x.id))&&!$('#map-select-all').checked;}
  $('#map-page-label').textContent=`Página ${page+1} de ${Math.max(1,Math.ceil(filtered.length/Number($('#map-size').value)))}`;
  $('#map-counter').textContent=`${filtered.length} registro(s) · ${filtered.reduce((n,r)=>n+Number(r.quantidade||0),0)} unidade(s) · ${selected.size} selecionado(s)`;
 };
 const apply=()=>{const q=$('#map-search').value.toLowerCase().trim(),l=$('#map-lot').value.toLowerCase().trim(),st=$('#map-status').value,owner=$('#map-owner')?.value||forced,
 m=$('#map-month').value,v1=$('#map-valid-from').value,v2=$('#map-valid-to').value;
  filtered=rows.filter(r=>(!owner||r.mapa_nome===owner)&&(!st||statusVal(r.validade,r.secao)[0]===st)
   &&(!m||String(r.mes_lancamento).slice(0,7)===m)&&(!v1||r.validade>=v1)&&(!v2||r.validade<=v2)
   &&(!l||String(r.lote).toLowerCase().includes(l))&&(!q||[r.ean,r.codigoInterno,r.descricao,r.secao].join(' ').toLowerCase().includes(q)));
  page=0;draw();};
 for(const id of ['map-search','map-lot','map-status','map-owner','map-month','map-valid-from','map-valid-to'])$('#'+id)?.addEventListener('input',apply);
 $('#map-size').onchange=()=>{page=0;draw();};
 $('#map-clear').onclick=()=>{for(const id of ['map-search','map-lot','map-status','map-owner','map-month','map-valid-from','map-valid-to']){const el=$('#'+id);if(el)el.value='';}selected.clear();apply();};
 $('#map-prev').onclick=()=>{if(page){page--;draw();}};$('#map-next').onclick=()=>{if((page+1)*Number($('#map-size').value)<filtered.length){page++;draw();}};
 $('#reload-maps').onclick=()=>renderRoute(state.route);
 $('#map-print').onclick=()=>printableTable('#maps-table',()=>mapsTable(filtered,{actions:false}));
 $('#map-csv').onclick=()=>exportCsv('mapa-'+nowBrISO()+'.csv',['Mapa','EAN','Codigo interno','Descricao','Lote','Validade','Quantidade','Mes lancamento','Situacao'],filtered.map(r=>[r.mapa_nome,r.ean,r.codigoInterno,r.descricao,r.lote,r.validade,r.quantidade,String(r.mes_lancamento).slice(0,7),statusVal(r.validade,r.secao)[0]]));
 $('#map-novo')?.addEventListener('click',abrirNovoLancamento);
 $('#maps-table').onclick=async e=>{
   const cb=e.target.closest('[data-check-map]');if(cb){if(cb.checked)selected.add(cb.dataset.checkMap);else selected.delete(cb.dataset.checkMap);draw();return;}
   const edit=e.target.closest('[data-edit]');if(edit){const reg=rows.find(x=>x.id===edit.dataset.edit);if(reg)openMapEdit(reg);return;}
   const remove=e.target.closest('[data-remove-map]');if(remove){const reg=rows.find(x=>x.id===remove.dataset.removeMap);if(!reg)return;
     if(!await confirmDialog('Excluir lançamento',`Excluir o lançamento do mapa ${reg.mapa_nome} (EAN ${reg.ean}, lote ${reg.lote})? Esta ação será registrada na auditoria.`))return;
     try{await request('/mapas',{method:'DELETE',body:{id:reg.id}});toast('Lançamento excluído.');await renderRoute(state.route);}catch(err){toast(err.message,true);}return;
   }
   const descer=e.target.closest('[data-descer-map]');if(descer){const reg=rows.find(x=>x.id===descer.dataset.descerMap);if(!reg)return;
     try{
       const staff=await staffList(),destinos=[...new Set([...staff.filter(x=>x.perfil==='funcionario'&&x.ativo).map(x=>x.nome),...special.filter(x=>x!=='Estoque')])];
       const dlg=$('#stock-descent-dialog'),form=$('#stock-descent-form');
       $('#stock-descent-label').textContent=`${reg.ean} · ${reg.lote} · ${reg.quantidade} unidade(s) disponíveis`;
       form.elements.destino.innerHTML=destinos.map(x=>`<option value="${H(x)}">${H(x)}</option>`).join('');
       form.elements.quantidade.max=String(reg.quantidade);form.elements.quantidade.value=String(reg.quantidade);
       form.onsubmit=async ev=>{ev.preventDefault();const quantity=Number(form.elements.quantidade.value);
         if(!Number.isInteger(quantity)||quantity<1||quantity>Number(reg.quantidade)){toast('Quantidade inválida para o Estoque.',true);return;}
         const btn=form.querySelector('[type=submit]');btn.disabled=true;
         try{await request('/mapas/descer',{method:'POST',body:{id:reg.id,destino:form.elements.destino.value,quantidade:quantity,requestId:newId()}});dlg.close();toast('Produto encaminhado ao mapa.');await renderRoute(state.route);}
         catch(err){toast(err.message,true);}finally{btn.disabled=false;}
       };dlg.showModal();
     }catch(err){toast(err.message,true);}return;
   }
   const send=e.target.closest('[data-send-map]');if(send){const destino=send.dataset.sendTo,reg=rows.find(x=>x.id===send.dataset.sendMap);if(!reg)return;
     if(!await confirmDialog(destino==='vencidos'?'Lançar como Vencido':'Lançar na Queima',`Encaminhar ${reg.quantidade} unidade(s) do EAN ${reg.ean} (${reg.mapa_nome})?`))return;
     try{await request('/mapas/encaminhar',{method:'POST',body:{ids:[reg.id],destino}});toast('Encaminhamento concluído.');await renderRoute(state.route);}catch(err){toast(err.message,true);}return;
   }
 };
 if(able){
  $('#map-select-all').onchange=e=>{for(const r of paged()){if(e.target.checked)selected.add(r.id);else selected.delete(r.id);}draw();};
  $('#map-unselect').onclick=()=>{selected.clear();$('#map-select-all').checked=false;draw();};
  for(const destino of ['queima','vencidos'])$('#map-to-'+destino).onclick=async()=>{
   const ids=[...selected].filter(id=>rows.some(r=>r.id===id&&Number(r.quantidade)>0));
   if(!ids.length)return toast('Selecione ao menos um lançamento.',true);
   if(!await confirmDialog('Encaminhar '+ids.length+' produto(s)',destino==='queima'?'O lançamento original será preservado e incluído na Queima com motivo 4.':'A quantidade do mapa será zerada e o registro será preservado para auditoria.'))return;
   try{await request('/mapas/encaminhar',{method:'POST',body:{ids,destino}});toast('Encaminhamento concluído.');renderRoute(state.route);}catch(err){toast(err.message,true);}
  };
 }
 apply();
 if(!isStock){
  let compareActive=false, saldos=null, compareRows=[],comparePage=0,compareResult=null;
  const base=$('#map-main-card'),pane=$('#map-compare-section');
  const desenharComparacao=()=>{
    const tam=Number($('#compare-size').value)||25,total=compareRows.length;
    comparePage=Math.min(comparePage,Math.max(0,Math.ceil(total/tam)-1));
    const pageRows=compareRows.slice(comparePage*tam,(comparePage+1)*tam);
    $('#compare-table').innerHTML=table(['Código interno','EAN (se sem código)','Lote','Validade','Qtd corrigida / mapa','Qtd estoque'],pageRows.map(r=>`<tr>
      <td><strong>${H(r.codigoInterno||'—')}</strong><span class="compare-product-desc">${H(r.descricao||'Sem descrição')}</span></td>
      <td>${r.codigoInterno?'—':H(r.ean)}</td><td>${H(r.lote)}</td><td>${dataBR(r.validade)}</td>
      <td class="compare-quantity"><strong class="${r.situacao==='reduzido'?'danger-text':''}">${r.quantidadeCorrigida===null?'Sem saldo':H(r.quantidadeCorrigida)}</strong><small>Mapa: ${H(r.quantidadeMapa)}</small></td>
      <td>${r.quantidadeEstoque===null?pill('Não localizado','amber'):H(r.quantidadeEstoque)}${r.estoqueAtualizadoEm?`<span class="second">${dtBR(r.estoqueAtualizadoEm)}</span>`:''}</td></tr>`));
    $('#compare-page').textContent=`Página ${comparePage+1} de ${Math.max(1,Math.ceil(total/tam))} · ${total} registro(s)`;
    $('#compare-prev').disabled=comparePage===0;
    $('#compare-next').disabled=(comparePage+1)*tam>=total;
  };
  const atualizarComparacao=async(atualizarSaldo=false)=>{
    if(!compareActive)return;
    const mes=$('#compare-month').value;
    if(!mes){$('#compare-notice').textContent='Escolha o mês do lançamento para conferir.';return;}
    const notice=$('#compare-notice');notice.textContent='Comparando mapa com os saldos importados…';
    try{
      if(!saldos||atualizarSaldo){
        const resp=await request(urlWithLoja('/estoque'),{timeout:60000});
        saldos=resp.registros||[];
      }
      if(!saldos.length){notice.textContent='Não há saldos importados nesta loja. Importe o ODS em Controle de Estoque antes de realizar a conferência.';
        $('#compare-table').innerHTML='';$('#compare-summary').innerHTML='';return;}
      const lista=filtered.filter(r=>String(r.mes_lancamento).slice(0,7)===mes);
      compareResult=conciliarMapaComEstoque(lista,saldos);compareRows=compareResult.itens;comparePage=0;
      const res=compareResult.resumo;
      notice.textContent=`Base: ${saldos.length} saldo(s) importado(s) para a loja. Mês ${mes}. A conferência é somente leitura; nenhum lançamento foi modificado.`;
      $('#compare-summary').innerHTML=`<span>${res.registros} registros</span><span>${res.unidadesMapa} un. no mapa</span><span>${res.unidadesCorrigidas} un. corrigidas (localizadas)</span><span>${res.registrosReduzidos} reduzidos</span><span>${res.naoEncontrados} sem saldo importado</span>`;
      desenharComparacao();
    }catch(err){notice.textContent='Não foi possível consultar o saldo importado: '+err.message;
      $('#compare-table').innerHTML='';$('#compare-summary').innerHTML='';toast(err.message,true);}
  };
  const mudarAba=async(paraComparacao)=>{
    compareActive=paraComparacao;base.hidden=paraComparacao;pane.hidden=!paraComparacao;
    $('#map-tab-list').setAttribute('aria-selected',String(!paraComparacao));
    $('#map-tab-compare').setAttribute('aria-selected',String(paraComparacao));
    if(paraComparacao){
      if(!$('#map-month').value){$('#map-month').value=nowBrISO().slice(0,7);apply();}
      $('#compare-month').value=$('#map-month').value;
      await atualizarComparacao();
    }
  };
  $('#map-tab-list').onclick=()=>mudarAba(false);
  $('#map-tab-compare').onclick=()=>mudarAba(true);
  $('#compare-month').onchange=e=>{$('#map-month').value=e.target.value;apply();atualizarComparacao();};
  $('#compare-refresh').onclick=()=>atualizarComparacao(true);
  $('#compare-size').onchange=()=>{comparePage=0;desenharComparacao();};
  $('#compare-prev').onclick=()=>{if(comparePage){comparePage--;desenharComparacao();}};
  $('#compare-next').onclick=()=>{if((comparePage+1)*Number($('#compare-size').value)<compareRows.length){comparePage++;desenharComparacao();}};
  $('#compare-csv').onclick=()=>{
    if(!compareResult)return toast('Abra uma conferência antes de exportar.',true);
    exportCsv('conferencia-mapa-'+$('#compare-month').value+'.csv',
      ['Codigo interno','EAN','Lote','Validade','Quantidade corrigida','Quantidade estoque','Quantidade mapa','Descricao','Mapa','Situacao'],
      compareRows.map(r=>[r.codigoInterno,r.codigoInterno?'':r.ean,r.lote,r.validade,r.quantidadeCorrigida??'',r.quantidadeEstoque??'',r.quantidadeMapa,r.descricao,r.mapa,r.situacao]));
  };
 }
 if(isStock){$('#stock-all').onclick=()=>{$('#map-status').value='';$('#stock-all').setAttribute('aria-pressed','true');$('#stock-expired').setAttribute('aria-pressed','false');apply();};$('#stock-expired').onclick=()=>{$('#map-status').value='Vencido';$('#stock-all').setAttribute('aria-pressed','false');$('#stock-expired').setAttribute('aria-pressed','true');apply();};}
 if(isStock&&able){
  $('#content').insertAdjacentHTML('beforeend',`<section class="card card-pad secondary-card"><h2>Descer para o mapa</h2><form id="move-form" class="form-grid"><label>Registro em estoque<select name="id">${rows.filter(r=>Number(r.quantidade)>0).map(r=>`<option value="${H(r.id)}">${H(r.descricao||r.ean)} · ${H(r.lote)} · ${H(r.quantidade)} un.</option>`).join('')}</select></label><label>Mapa de destino<select name="destino"></select></label><label>Quantidade<input name="quantidade" type="number" min="1" step="1" required></label><div class="form-actions"><button class="primary" type="submit">Descer para mapa</button></div></form></section>`);
  const pessoas=await staffList();$('#move-form').elements.destino.innerHTML=pessoas.filter(u=>u.ativo&&u.perfil!=='geral').map(u=>`<option>${H(u.nome)}</option>`).join('')+special.filter(x=>x!=='Estoque').map(x=>`<option>${H(x)}</option>`).join('');
  $('#move-form').onsubmit=async e=>{e.preventDefault();const f=e.target;try{await request('/mapas/descer',{method:'POST',body:{id:f.elements.id.value,destino:f.elements.destino.value,quantidade:Number(f.elements.quantidade.value),requestId:newId()}});toast('Estoque transferido para o mapa.');renderRoute(state.route);}catch(err){toast(err.message,true);}};
 }
}
async function produtos(){
 const d=await request('/produtos?limite=50');
 $('#content').innerHTML=header('Produtos EAN','Catálogo unificado com código interno, EAN, descrição e seção.',isAdmin()?'<button class="primary" id="add-product" type="button">Adicionar produto</button>':'')+
 `<section class="card card-pad"><div class="filter-row"><input id="product-search" class="wide" placeholder="EAN, código ou descrição"><button id="product-go" class="primary" type="button">Pesquisar</button></div><div id="product-list"></div></section>`;
 const render=a=>$('#product-list').innerHTML=table(['EAN','Código interno','Descrição','Seção'],a.map(r=>`<tr><td>${H(r.ean)}</td><td>${H(r.codigo_interno||'—')}</td><td>${H(r.descricao)}</td><td>${H(r.secao||'—')}</td></tr>`));
 render(d.produtos||[]);
 const search=async()=>{try{const q=$('#product-search').value.trim(),r=await request('/produtos?q='+encodeURIComponent(q)+'&limite=100');render(r.produtos||[]);}catch(e){toast(e.message,true);}};
 $('#product-go').onclick=search;$('#product-search').onkeydown=e=>{if(e.key==='Enter')search();};
 if(isAdmin())$('#add-product').onclick=()=>{const dialog=$('#product-dialog'),form=$('#product-modal-form');form.reset();$('#product-modal-error').hidden=true;$('#product-modal-cancel').onclick=()=>dialog.close();form.onsubmit=async e=>{e.preventDefault();const body=Object.fromEntries(new FormData(form)),btn=form.querySelector('[type="submit"]');btn.disabled=true;try{
  const found=await request('/produtos?q='+encodeURIComponent(body.ean)+'&limite=2'),duplicate=(found.produtos||[]).find(x=>x.ean===body.ean);
  if(duplicate&&!await confirmDialog('EAN já cadastrado','Este EAN já existe. Deseja atualizar seu código interno, descrição e seção?'))return;
  await request('/produtos',{method:'POST',body});dialog.close();toast('Produto salvo no catálogo.');search();
 }catch(err){$('#product-modal-error').textContent=err.message;$('#product-modal-error').hidden=false;}finally{btn.disabled=false;}};dialog.showModal();};
}

function openMapEdit(registro){
 const dialog=$('#edit-map-dialog'),form=$('#edit-map-form'),error=$('#edit-map-error');
 form.elements.id.value=registro.id;
 for(const key of ['ean','lote','quantidade'])form.elements[key].value=registro[key]??'';
 form.elements.validade.value=String(registro.validade||'').slice(0,10);
 $('#edit-map-context').textContent=`Mapa: ${registro.mapa_nome} · Mês original: ${String(registro.mes_lancamento||'').slice(0,7)}`;
 error.hidden=true;
 $('#edit-map-cancel').onclick=()=>dialog.close();
 form.onsubmit=async e=>{
   e.preventDefault();const btn=form.querySelector('[type="submit"]');btn.disabled=true;error.hidden=true;
   const data=Object.fromEntries(new FormData(form));data.quantidade=Number(data.quantidade);
   if(!/^\d{8,14}$/.test(data.ean)||!data.lote.trim()||data.lote.trim().length>100||!/^\d{4}-\d{2}-\d{2}$/.test(data.validade)||!Number.isInteger(data.quantidade)||data.quantidade<0||data.quantidade>999999){
     error.textContent='Verifique o EAN, lote, validade e quantidade.';error.hidden=false;btn.disabled=false;return;
   }
   try{
     await request(urlWithLoja('/mapas'),{method:'PATCH',body:{...data,...(state.user.perfil==='geral'?{loja:state.loja}:{})}});
     dialog.close();toast('Produto atualizado no mapa.');await renderRoute(state.route);
   }catch(err){error.textContent=err.message;error.hidden=false;}finally{btn.disabled=false;}
 };
 dialog.showModal();
}

async function pendencias(){
 const data=await request('/pendencias',{timeout:55000});
 const catalogo=data.catalogo||[], migracao=data.migracao||[], lacunas=data.lancamentos||[];
 const all=[...lacunas.map(v=>({...v,_tipo:'lancamento',_id:v.id,tabela_origem:'mapa_lancamentos',
   motivo:'EAN não encontrado no catálogo',dados:{...v.mapa_lancamentos,loja_id:v.loja_id,ean:v.ean,lancamento_id:v.lancamento_id}})),
   ...migracao.map(v=>({...v,_tipo:'migracao',_id:v.origem_migracao})),
   ...catalogo.map(v=>({...v,_tipo:'catalogo',_id:v.codigo_original}))];
 $('#content').innerHTML=header('Pendências','Revise EANs desconhecidos e registros históricos. Ignorar não apaga lançamentos.')+
 `<section class="card card-pad"><div class="stat-grid" style="margin-bottom:20px"><div class="stat card"><small>EANs não encontrados nos lançamentos</small><strong>${lacunas.length}</strong><p>Produtos lançados sem cadastro no catálogo</p></div><div class="stat card"><small>Catálogo para revisão</small><strong>${catalogo.length}</strong><p>Produtos com código de barras incompleto ou irregular</p></div><div class="stat card"><small>Registros operacionais</small><strong>${migracao.length}</strong><p>Mapas, vencidos e Queima</p></div></div>
 <div class="filter-row"><input id="pending-search" class="wide" placeholder="Pesquisar EAN, lote, mapa ou motivo" aria-label="Pesquisar pendências"><select id="pending-kind"><option value="">Todas</option><option value="lancamento">EAN não encontrado</option><option value="catalogo">Produtos EAN legados</option><option value="migracao">Migração de mapas</option></select></div>
 <p id="pending-count" class="footer-hint"></p><div id="pending-table"></div></section>`;
 const area=$('#pending-table');
 const render=()=>{
  const q=$('#pending-search').value.toLowerCase().trim(),tipo=$('#pending-kind').value;
  const selected=all.filter(r=>(!tipo||r._tipo===tipo)&&(!q||[r.codigo_original,r.codigo_interno,r.descricao,r.motivo,r.tabela_origem,JSON.stringify(r.dados||{})].join(' ').toLowerCase().includes(q)));
  $('#pending-count').textContent=`${selected.length} pendência(s) localizada(s).`;
  area.innerHTML=table(['Origem','Identificação','Motivo','Ação'],selected.slice(0,500).map(r=>{
    const d=r.dados||{};const title=r._tipo==='catalogo'?`Código original: ${r.codigo_original}`:`${r.tabela_origem} · ${d.mapa_nome||d.mapa_origem||d.loja_id||'sem loja'}`;
    const sub=r._tipo==='catalogo'?r.descricao||'Sem descrição':`${d.ean||d.codigo_interno||'Sem EAN'} · ${d.lote||'Sem lote'}`;
    return `<tr><td>${pill(r._tipo==='lancamento'?'EAN desconhecido':r._tipo==='catalogo'?'Produto EAN':'Registro','amber')}</td><td><strong>${H(title)}</strong><span class="second">${H(sub)}</span></td><td>${H(r.motivo)}</td><td><button class="action-link" type="button" data-pending-id="${H(r._id)}" data-pending-type="${H(r._tipo)}">Ações</button></td></tr>`;
  }));
  if(selected.length>500)area.insertAdjacentHTML('beforeend','<p class="footer-hint">Exibindo até 500 registros. Use a busca para encontrar os demais.</p>');
 };
 $('#pending-search').addEventListener('input',render);$('#pending-kind').addEventListener('change',render);
 area.onclick=e=>{const b=e.target.closest('[data-pending-id]');if(!b)return;const r=all.find(x=>x._tipo===b.dataset.pendingType&&x._id===b.dataset.pendingId);if(r)openPendingActions(r);};
 render();
}
function openPendingActions(registro){
 const dlg=$('#pending-actions-dialog'),info=$('#pending-action-info'),title=$('#pending-action-title'),details=$('#pending-action-details');
 const isCatalog=registro._tipo==='catalogo',d=registro.dados||{};
 title.textContent=isCatalog?'Ações — Produto EAN':'Ações — Pendência de '+(registro.tabela_origem||'mapa');
 info.textContent=isCatalog?'Revise o código EAN e o cadastro antes de aplicar a correção.':'Confirme lote, validade e quantidade antes de regularizar o registro histórico.';
 details.hidden=true;details.textContent='';
 $('#pending-action-edit').textContent=registro._tipo==='lancamento'?'Corrigir / cadastrar EAN':isCatalog?'Corrigir EAN e cadastro':'Corrigir registro do mapa';
 $('#pending-action-edit').onclick=()=>{dlg.close();openPendingEdit(registro);};
 $('#pending-action-original').onclick=()=>{details.hidden=!details.hidden;details.textContent=JSON.stringify(isCatalog?{
   codigo_original:registro.codigo_original,codigo_interno:registro.codigo_interno,descricao:registro.descricao,secao:registro.secao,motivo:registro.motivo
 }:{origem:registro.tabela_origem,motivo:registro.motivo,dados:d},null,2);};
 $('#pending-action-ignore').onclick=async()=>{
   if(!await confirmDialog('Ignorar pendência',`Ignorar ${registro._tipo==='lancamento'?'o EAN '+registro.ean:'esta pendência'}? O registro original será preservado.`))return;
   const botao=$('#pending-action-ignore');botao.disabled=true;
   try{await request('/pendencias',{method:'POST',body:{acao:'ignorar',tipo:registro._tipo,id:registro._id}});
     dlg.close();toast('Pendência ignorada. O registro original foi mantido.');await renderRoute(state.route);
   }catch(err){toast(err.message,true);}finally{botao.disabled=false;}
 };
 $('#pending-action-cancel').onclick=()=>dlg.close();
 dlg.showModal();
}
function openPendingEdit(r){
 const dialog=$('#pending-dialog'),form=$('#pending-form'),fields=$('#pending-fields'),error=$('#pending-error');
 const catalog=r._tipo==='catalogo',d=r.dados||{};
 $('#pending-title').textContent=catalog?'Corrigir cadastro Produtos EAN':'Corrigir '+(r.tabela_origem||'registro');
 $('#pending-description').textContent=catalog?`Código original: ${r.codigo_original}. ${r.motivo||''}`:`${r.motivo}. Mapa: ${d.mapa_nome||d.mapa_origem||'—'} · Mês: ${d.mes_lancamento||'—'}`;
 const make=(name,label,value,opts={})=>`<label>${H(label)}<input name="${name}" ${opts.type?'type="'+opts.type+'"':''} ${opts.inputmode?'inputmode="'+opts.inputmode+'"':''} ${opts.pattern?'pattern="'+opts.pattern+'"':''} ${opts.max?'maxlength="'+opts.max+'"':''} ${opts.min?'min="'+opts.min+'"':''} ${opts.step?'step="'+opts.step+'"':''} ${opts.required?'required':''}></label>`;
 if(r._tipo==='lancamento'){
  fields.innerHTML=make('ean','EAN correto',d.ean||'',{inputmode:'numeric',pattern:'[0-9]{8,14}',max:14,required:true})+
   make('descricao','Descrição (se ainda não cadastrado)','')+make('secao','Seção (se ainda não cadastrado)','');
  form.elements.ean.value=d.ean||'';
 }else if(catalog){
  fields.innerHTML=make('ean','EAN correto','',{inputmode:'numeric',pattern:'[0-9]{8,14}',max:14,required:true})+make('codigo_interno','Código interno',r.codigo_interno||'')+make('descricao','Descrição',r.descricao||'',{required:true})+make('secao','Seção',r.secao||'');
  for(const k of ['codigo_interno','descricao','secao'])form.elements[k].value=r[k]||'';
 }else{
  fields.innerHTML=(state.user.perfil==='geral'?make('loja_id','Loja',d.loja_id||'',{inputmode:'numeric',pattern:'[0-9]{1,12}',required:true}):'')+
   make('ean','EAN',d.ean||'',{inputmode:'numeric',max:14})+make('lote','Lote',d.lote||'',{max:100})+
   make('validade','Validade',d.validade||'',{type:'date'})+make('quantidade','Quantidade',d.quantidade||'',{type:'number',min:0,step:1,required:true});
  for(const k of ['loja_id','ean','lote','validade','quantidade'])if(form.elements[k])form.elements[k].value=(d[k]??'').toString().slice(0,k==='validade'?10:undefined);
 }
 error.hidden=true;$('#pending-cancel').onclick=()=>dialog.close();
 form.onsubmit=async e=>{
  e.preventDefault();const btn=form.querySelector('[type="submit"]');btn.disabled=true;error.hidden=true;
  const correcao=Object.fromEntries(new FormData(form));if(!catalog&&r._tipo!=='lancamento')correcao.quantidade=Number(correcao.quantidade);
  try{await request('/pendencias',{method:'PATCH',body:{tipo:r._tipo,id:r._id,correcao},timeout:55000});dialog.close();toast('Pendência corrigida e registrada na auditoria.');await renderRoute(state.route);}
  catch(x){error.textContent=x.message;error.hidden=false;}finally{btn.disabled=false;}
 };
 dialog.showModal();
}

async function saldo(){const r=await request(urlWithLoja('/estoque'));const rows=r.registros||[];$('#content').innerHTML=header('Saldo importado do Procfit','Saldo total por produto na loja. Independente das quantidades dos mapas de validade.')+`<section class="card card-pad"><div class="filter-row"><input id="saldo-search" class="wide" placeholder="Pesquisar EAN, código ou descrição"></div><div id="saldo-table"></div></section><section class="card card-pad" style="margin-top:18px"><h2>Importar saldo por CSV ou ODS</h2><p>Colunas: <code>codigo_interno,ean,descricao,secao,quantidade</code>. ODS e CSV são lidos no próprio navegador. XLSX pode ser convertido para CSV.</p><input type="file" accept=".ods,.csv,text/csv,application/vnd.oasis.opendocument.spreadsheet" id="import-csv"><div class="form-actions"><button class="primary" id="start-import" type="button">Importar ODS / CSV</button></div><div id="import-progress" role="status"></div></section>`;const render=q=>$('#saldo-table').innerHTML=table(['EAN','Código interno','Descrição','Seção','Saldo Procfit','Atualização'],rows.filter(x=>[x.ean,x.codigo_interno,x.descricao,x.secao].join(' ').toLowerCase().includes(q)).slice(0,500).map(x=>`<tr><td>${H(x.ean)}</td><td>${H(x.codigo_interno)}</td><td>${H(x.descricao)}</td><td>${H(x.secao)}</td><td>${H(x.quantidade)}</td><td>${dtBR(x.atualizado_em)}</td></tr>`));render('');$('#saldo-search').oninput=e=>render(e.target.value.toLowerCase());$('#start-import').onclick=async()=>{const file=$('#import-csv').files[0];if(!file)return toast('Selecione um arquivo ODS ou CSV.',true);const lines=file.name.toLowerCase().endsWith('.ods')?await lerODS(file):parseCSV(await file.text());if(lines.length<2)return toast('Arquivo vazio.',true);const headers=lines[0].map(x=>String(x).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'_'));const index=n=>headers.indexOf(n);const aliases={ean:['ean','codigo_ean','codigo_de_barras'],codigo_interno:['codigo_interno','codigo','cod_interno','produto'],descricao:['descricao','nome','produto_descricao'],secao:['secao','departamento'],quantidade:['quantidade','saldo','saldo_total','estoque']};const findIndex=n=>(aliases[n]||[n]).map(index).find(x=>x>=0)??-1;if(findIndex('ean')<0||findIndex('quantidade')<0)return toast('O arquivo deve conter EAN e Quantidade (ou Saldo).',true);const get=(row,name)=>findIndex(name)>=0?String(row[findIndex(name)]||''):'';const data=lines.slice(1).filter(r=>r.some(v=>v.trim())).map(row=>({ean:get(row,'ean').trim(),codigo_interno:get(row,'codigo_interno'),descricao:get(row,'descricao'),secao:get(row,'secao'),quantidade:Number(get(row,'quantidade').replace(',','.'))}));if(data.some(x=>!/^\d{8,14}$/.test(x.ean)||!Number.isFinite(x.quantidade)||x.quantidade<0))return toast('Há EAN ou quantidade inválidos. Confira o CSV.',true);if(!await confirmDialog('Importar estoque',`Atualizar ${data.length} saldos do Procfit? Somente produtos presentes no arquivo serão alterados.`))return;const btn=$('#start-import');btn.disabled=true;try{for(let i=0;i<data.length;i+=250){$('#import-progress').textContent=`Enviando ${Math.min(i+250,data.length)} de ${data.length}…`;await request('/estoque',{method:'POST',body:{itens:data.slice(i,i+250),...(state.user.perfil==='geral'?{loja:state.loja}:{})},timeout:60000});}toast('Importação concluída.');renderRoute(state.route);}catch(e){toast('Importação interrompida: '+e.message,true);}finally{btn.disabled=false;}};}
function parseCSV(txt){const first=(txt.split(/\r?\n/)[0]||''),sep=first.includes(';')?';':',';const out=[];let row=[],cell='',inQuotes=false;for(let i=0;i<txt.length;i++){const c=txt[i];if(c==='"'){if(inQuotes&&txt[i+1]==='"'){cell+='"';i++;}else inQuotes=!inQuotes;}else if(!inQuotes&&c===sep){row.push(cell);cell='';}else if(!inQuotes&&(c==='\n'||c==='\r')){if(c==='\r'&&txt[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.length))out.push(row);row=[];cell='';}else cell+=c;}row.push(cell);if(row.some(x=>x.length))out.push(row);if(out[0]?.[0])out[0][0]=out[0][0].replace(/^\uFEFF/,'');return out;}
async function painelGeral(){
 const r=await request('/geral',{timeout:55000});const lojas=r.lojas||[],admins=r.administradores||[];
 $('#content').innerHTML=header('Painel Geral','Administração central. Somente o Administrador Geral pode gerenciar todas as lojas e seus administradores.',
 '<button class="btn-outline" id="geral-change-pin" type="button">Alterar minha senha</button><button class="btn-outline" id="geral-store-new" type="button">Cadastrar loja</button><button class="primary" id="geral-admin-new" type="button">Cadastrar administrador</button>')+
 `<div class="stat-grid"><div class="card stat"><small>Lojas cadastradas</small><strong>${lojas.length}</strong><p>Unidades no Supabase</p></div><div class="card stat"><small>Administradores de loja</small><strong>${admins.length}</strong><p>Contas com perfil administrativo</p></div><div class="card stat"><small>Funcionários</small><strong>${H(r.totais?.funcionarios||0)}</strong></div><div class="card stat"><small>Acesso</small><strong>Geral</strong><p>${state.user?.perfilBase==='admin'?'Acesso duplo: use o botão Painel Conferente no topo.':'Administração geral'}</p></div></div>
 <section class="card card-pad"><h2>Unidades cadastradas</h2>${table(['Loja','Nome','Administradores'],lojas.map(l=>`<tr><td>${H(l.id)}</td><td>${H(l.nome||'Loja '+l.id)}</td><td>${H(admins.filter(a=>a.loja_id===l.id).map(a=>a.nome).join(', ')||'Nenhum')}</td></tr>`))}</section>
 <dialog id="geral-store-dialog" class="dialog" aria-labelledby="geral-store-title"><form id="geral-store-form" class="dialog-inner" autocomplete="off">
 <h2 id="geral-store-title">Cadastrar nova loja</h2><p class="footer-hint">O Painel Geral administra todas as lojas. O cadastro não muda a Loja 151 de origem da sua conta.</p>
 <label>Código da loja<input name="codigo" type="text" inputmode="numeric" pattern="[0-9]{1,12}" maxlength="12" placeholder="Ex.: 152" required></label>
 <label>Nome da loja<input name="nome" type="text" minlength="2" maxlength="120" placeholder="Ex.: Loja 152 - Centro" required></label>
 <p class="error-note" id="geral-store-error" role="alert" hidden></p>
 <div class="dialog-actions"><button type="button" class="btn-outline" id="geral-store-cancel">Cancelar</button><button type="submit" class="primary">Cadastrar loja</button></div>
 </form></dialog>`;
 $('#geral-admin-new').onclick=()=>navigate('admins-geral');
 $('#geral-change-pin').onclick=abrirMeuPin;
 $('#geral-store-new').onclick=()=>{
   if(!isGeral())return toast('Acesso exclusivo do Administrador Geral.',true);
   const dlg=$('#geral-store-dialog'),form=$('#geral-store-form');
   form.reset();$('#geral-store-error').hidden=true;dlg.showModal();form.elements.codigo.focus();
 };
 $('#geral-store-cancel').onclick=()=>$('#geral-store-dialog').close();
 $('#geral-store-form').onsubmit=async event=>{
   event.preventDefault();
   if(!isGeral())return toast('Acesso exclusivo do Administrador Geral.',true);
   const form=event.currentTarget,save=form.querySelector('[type=submit]'),error=$('#geral-store-error');
   error.hidden=true;save.disabled=true;
   try{
     const codigo=form.elements.codigo.value.trim(),nome=form.elements.nome.value.trim();
     if(!/^\d{1,12}$/.test(codigo))throw new Error('O código deve ter de 1 a 12 números.');
     if(nome.length<2||nome.length>120)throw new Error('Informe um nome de 2 a 120 caracteres.');
     await request('/geral/lojas',{method:'POST',body:{codigo,nome}});
     $('#geral-store-dialog').close();toast(`Loja ${codigo} cadastrada.`);
     await renderRoute('painel-geral'); // atualiza lista e total; novo cadastro aparece no select dos administradores
   }catch(err){error.textContent=err.message;error.hidden=false;}finally{save.disabled=false;}
 };

}
function abrirMeuPin(){
 if(!isGeral())return toast('Acesso exclusivo do Administrador Geral.',true);
 const dialog=$('#meu-pin-dialog'),form=$('#meu-pin-form'),error=$('#meu-pin-error');
 form.reset();error.hidden=true;dialog.showModal();
 form.elements.pinAtual.focus();
}
function configurarMinhaSenha(){
 const dialog=$('#meu-pin-dialog'),form=$('#meu-pin-form'),error=$('#meu-pin-error');
 if(!dialog || !form)return; // A página dedicada de Lançamentos não contém o modal do Painel Geral.
 $('#meu-pin-cancel').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{form.reset();error.hidden=true;});
 form.onsubmit=async e=>{
  e.preventDefault();error.hidden=true;
  if(!isGeral()){error.textContent='Acesso restrito ao Administrador Geral.';error.hidden=false;return;}
  const pinAtual=form.elements.pinAtual.value,pinNovo=form.elements.pinNovo.value,confirmacao=form.elements.confirmacao.value;
  if(pinNovo!==confirmacao){error.textContent='Os PINs novos não coincidem.';error.hidden=false;return;}
  if(!/^\d{6,12}$/.test(pinNovo)){error.textContent='O novo PIN deve conter de 6 a 12 dígitos.';error.hidden=false;return;}
  if(pinAtual===pinNovo){error.textContent='Informe um PIN diferente do atual.';error.hidden=false;return;}
  const submit=form.querySelector('[type="submit"]');submit.disabled=true;
  try{const res=await request('/conta/pin',{method:'POST',body:{pinAtual,pinNovo,confirmacao},retries:0,timeout:50000});
   dialog.close();toast(res.mensagem||'PIN atualizado.');
  }catch(err){error.textContent=err.message;error.hidden=false;}
  finally{submit.disabled=false;}
 };
}
async function administradoresGeral(){
 if(!isGeral())throw new Error('Acesso exclusivo do Administrador Geral.');
 const [u,r]=await Promise.all([request('/usuarios'),request('/geral')]);const admins=(u.usuarios||[]).filter(x=>x.perfil==='admin'),lojas=r.lojas||[];
 $('#content').innerHTML=header('Administradores de loja','Cadastre e gerencie os responsáveis por cada unidade. Administradores de loja não podem acessar outras lojas.')+
 `<section class="card card-pad"><div class="filter-row"><input class="wide" id="admin-search" placeholder="Nome ou loja"></div><div id="admin-table"></div></section>
 <section class="card card-pad secondary-card"><h2>Cadastrar administrador de loja</h2><form id="admin-new-form" class="form-grid"><label>Nome<input name="nome" maxlength="120" required></label><label>Loja<select name="loja" required>${lojas.map(l=>`<option value="${H(l.id)}">${H(l.id)} — ${H(l.nome)}</option>`).join('')}</select></label><label>PIN provisório (6 a 12 dígitos)<input name="pin" type="password" autocomplete="new-password" inputmode="numeric" pattern="[0-9]{6,12}" required></label><div class="form-actions"><button class="primary" type="submit">Cadastrar administrador</button></div></form></section>`;
 const render=()=>$('#admin-table').innerHTML=table(['Nome','Loja','Ativo','Ações'],admins.filter(x=>[x.nome,x.loja_id].join(' ').toLowerCase().includes($('#admin-search').value.toLowerCase())).map(x=>`<tr><td>${H(x.nome)}</td><td>${H(x.loja_id)}</td><td>${pill(x.ativo?'Ativo':'Inativo',x.ativo?'green':'red')}</td><td><button class="action-link" data-admin-pin="${H(x.id)}">Redefinir PIN</button> <button class="action-link" data-admin-toggle="${H(x.id)}">${x.ativo?'Inativar':'Ativar'}</button></td></tr>`));
 $('#admin-search').oninput=render;render();
 $('#admin-table').onclick=async e=>{const pin=e.target.closest('[data-admin-pin]'),tog=e.target.closest('[data-admin-toggle]');if(pin){const target=admins.find(x=>x.id===pin.dataset.adminPin);if(target)openPinReset(target);return;}
  if(tog){const target=admins.find(x=>x.id===tog.dataset.adminToggle);if(!target)return;if(!await confirmDialog('Alterar acesso',`${target.ativo?'Inativar':'Ativar'} ${target.nome}?`))return;try{await request('/usuarios',{method:'PATCH',body:{id:target.id,ativo:!target.ativo}});toast('Acesso atualizado.');renderRoute(state.route);}catch(err){toast(err.message,true);}}};
 $('#admin-new-form').onsubmit=async e=>{e.preventDefault();const f=e.target,body={...Object.fromEntries(new FormData(f)),perfil:'admin'};try{await request('/usuarios',{method:'POST',body});toast('Administrador cadastrado.');f.reset();renderRoute(state.route);}catch(err){toast(err.message,true);}};
}
function openPinReset(person){
 if(!canManage())return;
 const dlg=$('#pin-dialog'),form=$('#pin-form');form.reset();form.elements.id.value=person.id;$('#pin-target').textContent=`Funcionário: ${person.nome} · Loja ${person.loja_id}`;$('#pin-error').hidden=true;
 $('#pin-cancel').onclick=()=>dlg.close();
 form.onsubmit=async e=>{e.preventDefault();const pin=form.elements.pin.value,confirmar=form.elements.confirmar.value;if(pin!==confirmar){$('#pin-error').textContent='Os PINs digitados são diferentes.';$('#pin-error').hidden=false;return;}
  if(!await confirmDialog('Redefinir PIN',`Redefinir o PIN de ${person.nome}? Todas as sessões existentes serão encerradas.`))return;
  const btn=form.querySelector('[type="submit"]');btn.disabled=true;
  try{await request('/usuarios',{method:'PATCH',body:{id:person.id,pin}});dlg.close();toast('PIN redefinido. Informe o novo código ao funcionário por canal privado.');renderRoute(state.route);}catch(err){$('#pin-error').textContent=err.message;$('#pin-error').hidden=false;}finally{btn.disabled=false;}
 };dlg.showModal();
}
async function usuarios(){
 if(!isAdmin())throw new Error('Funcionários podem ser gerenciados somente por administradores de loja.');
 const [resp,mapasAtivos]=await Promise.all([request('/usuarios'),getMaps()]);
 const usuarios=(resp.usuarios||[]).filter(u=>u.perfil==='funcionario');
 const ativos=usuarios.filter(u=>u.ativo);
 const counts=new Map();
 for(const m of mapasAtivos){if(m.tipo_mapa!=='funcionario')continue;
   const k=m.funcionario_id||`nome:${String(m.mapa_nome||'').toLowerCase()}`;
   counts.set(k,(counts.get(k)||0)+1);
 }
 const quantidadeUsuario=u=>(counts.get(u.id)||0)+(counts.get(`nome:${u.nome.toLowerCase()}`)||0);
 const semResponsavel=mapasAtivos.filter(x=>x.tipo_mapa==='funcionario'&&!x.funcionario_id&&x.mapa_nome==='Sem responsável').length;
 const opUsuario=u=>`<option value="${H(u.id)}">${H(u.nome)}${u.ativo?'':' (inativo)'}</option>`;
 $('#content').innerHTML=header('Funcionários','Edite nomes, transfira lançamentos de qualquer mês e organize as seções sem alterar mapas operacionais.',
 '<button class="primary" id="staff-move-open" type="button">Transferir lançamentos</button>')+
 `<section class="card card-pad"><div class="filter-row"><input id="staff-search" class="wide" placeholder="Buscar funcionário"><select id="staff-filter"><option value="">Todos</option><option value="ativo">Ativos</option><option value="inativo">Inativos</option><option value="com">Com lançamentos</option><option value="sem">Sem lançamentos</option></select><button class="btn-outline" id="staff-print" type="button">Imprimir</button></div>
 <p id="staff-total" class="footer-hint"></p><div class="notice" style="margin-bottom:14px"><strong>Lançamentos sem responsável:</strong> ${semResponsavel}. Utilize <strong>Transferir lançamentos</strong> para atribuí-los a um novo funcionário.</div><div id="staff-list"></div></section>
 <section class="card card-pad secondary-card"><h2>Adicionar funcionário</h2><form id="user-form" class="form-grid"><label>Nome<input name="nome" maxlength="120" required></label><label>PIN inicial<input required type="password" name="pin" inputmode="numeric" pattern="[0-9]{6,12}" autocomplete="new-password"></label><div class="form-actions"><button class="primary">Cadastrar funcionário</button></div></form></section>
 <dialog id="staff-rename-dialog" class="dialog operational-dialog"><form id="staff-rename-form" class="dialog-inner"><h2>Editar nome do funcionário</h2><p class="footer-hint">Todos os lançamentos ativos do mapa acompanharão o novo nome, sem alterar os registros históricos de auditoria.</p><label>Novo nome<input name="nome" maxlength="120" minlength="2" required></label><p role="alert" id="staff-rename-error" class="error-note" hidden></p><div class="dialog-actions"><button class="btn-outline" type="button" data-close-staff>Cancelar</button><button class="primary" type="submit">Salvar nome</button></div></form></dialog>
 <dialog id="staff-delete-dialog" class="dialog operational-dialog"><form id="staff-delete-form" class="dialog-inner"><h2>Excluir funcionário</h2><p id="staff-delete-description" class="notice warn"></p><p class="footer-hint">A conta será desativada e o PIN deixará de funcionar. Nenhum lançamento será apagado. O histórico conservará o nome original.</p>
 <label>O que fazer com os lançamentos?<select name="modo" id="staff-delete-mode"><option value="flutuar">Deixar sem responsável (flutuando)</option><option value="transferir">Transferir todos para outro funcionário</option></select></label>
 <label id="staff-delete-destination-wrap" hidden>Funcionário de destino<select name="destino_id" id="staff-delete-destination"><option value="">Escolha um funcionário</option></select></label>
 <p id="staff-delete-error" role="alert" class="error-note" hidden></p><div class="dialog-actions"><button type="button" class="btn-outline" data-close-staff>Cancelar</button><button type="submit" class="btn-outline danger">Confirmar exclusão</button></div></form></dialog>
 <dialog id="staff-move-dialog" class="dialog operational-dialog staff-move-dialog"><div class="dialog-inner"><h2>Transferir lançamentos</h2><p class="footer-hint">O mês é opcional: deixe em branco para selecionar lançamentos de todos os meses. A seção e a escolha dos itens continuam disponíveis. Escolha um destino ou deixe sem responsável.</p>
 <div class="form-grid"><label>Origem<select id="staff-move-source"><option value="">Escolha um responsável</option>${usuarios.map(opUsuario).join('')}<option value="flutuando">Sem responsável (flutuando)</option></select></label>
 <label>Destino<select id="staff-move-target"><option value="">Escolha um destino</option>${ativos.map(opUsuario).join('')}<option value="flutuando">Sem responsável (flutuando)</option></select></label>
 <label>Mês do lançamento (opcional)<input type="month" id="staff-move-month" aria-describedby="staff-move-month-hint"><small id="staff-move-month-hint">Deixe vazio para considerar todos os meses.</small></label>
 <label>Seção<select id="staff-move-section"><option value="">Todas as seções</option></select></label></div>
 <div class="filter-row" style="margin-top:12px"><button class="btn-outline" id="staff-move-reload" type="button">Consultar lançamentos</button></div>
 <p id="staff-move-summary" class="footer-hint" role="status">Selecione a origem; o mês é opcional.</p>
 <label class="checkbox-label"><input id="staff-move-all" type="checkbox">Transferir <strong>todos</strong> os lançamentos filtrados por mês/seção (mesmo os que não aparecem na prévia)</label>
 <div class="staff-move-items" id="staff-move-items"></div>
 <p id="staff-move-error" role="alert" class="error-note" hidden></p>
 <div class="dialog-actions"><button class="btn-outline" type="button" data-close-staff>Cancelar</button><button class="primary" id="staff-move-confirm" type="button">Transferir selecionados</button></div></div></dialog>`;
 const render=()=>{const q=$('#staff-search').value.toLowerCase().trim(),f=$('#staff-filter').value;
  const filtrados=usuarios.filter(u=>u.nome.toLowerCase().includes(q)&&(f==='ativo'?u.ativo:f==='inativo'?!u.ativo:f==='com'?quantidadeUsuario(u)>0:f==='sem'?quantidadeUsuario(u)===0:true));
  $('#staff-total').textContent=`${filtrados.length} funcionário(s) · ${usuarios.length} conta(s) cadastrada(s) nesta loja.`;
  $('#staff-list').innerHTML=table(['Funcionário','Loja','Lançamentos','Situação','Celular próprio','Ações'],filtrados.map(u=>`<tr><td>${H(u.nome)}</td><td>${H(u.loja_id)}</td><td>${quantidadeUsuario(u)}</td><td>${pill(u.ativo?'Ativo':'Inativo',u.ativo?'green':'red')}</td><td>${H(u.celular_proprio?'Sim':'Não')}</td><td class="row-actions"><button class="action-link" data-staff-rename="${H(u.id)}">Editar nome</button><button class="action-link" data-staff-move="${H(u.id)}">Transferir lançamentos</button><button class="action-link danger-text" data-staff-delete="${H(u.id)}">Excluir</button><button class="action-link" data-user="${H(u.id)}" data-flag="ativo">${u.ativo?'Inativar':'Ativar'}</button><button class="action-link" data-user="${H(u.id)}" data-flag="celular_proprio">${u.celular_proprio?'Bloquear':'Permitir'} celular</button><button class="action-link" data-pin="${H(u.id)}">Redefinir PIN</button></td></tr>`));};
 $('#staff-search').oninput=render;$('#staff-filter').onchange=render;render();
 $('#staff-print').onclick=()=>printableTable('#staff-list',()=>$('#staff-list').innerHTML);
 document.querySelectorAll('[data-close-staff]').forEach(x=>x.onclick=()=>x.closest('dialog').close());
 const renomearDlg=$('#staff-rename-dialog'),renomearForm=$('#staff-rename-form');let renameId='';
 function abrirRenomear(user){renameId=user.id;renomearForm.reset();renomearForm.elements.nome.value=user.nome;$('#staff-rename-error').hidden=true;renomearDlg.showModal();renomearForm.elements.nome.focus();}
 renomearForm.onsubmit=async e=>{e.preventDefault();const novo=renomearForm.elements.nome.value.trim(),btn=renomearForm.querySelector('[type="submit"]');btn.disabled=true;
  try{const r=await request('/usuarios',{method:'PATCH',body:{id:renameId,nome:novo}});renomearDlg.close();toast(`${r.quantidade??0} lançamento(s) atualizado(s) com o novo nome.`);await renderRoute('usuarios');}
  catch(err){$('#staff-rename-error').textContent=err.message;$('#staff-rename-error').hidden=false;}finally{btn.disabled=false;}
 };
 const excluirDlg=$('#staff-delete-dialog'),excluirForm=$('#staff-delete-form');let deleteId='';
 function abrirExcluir(user){deleteId=user.id;excluirForm.reset();$('#staff-delete-error').hidden=true;
  $('#staff-delete-description').textContent=`Excluir a conta ${user.nome}? Os ${quantidadeUsuario(user)} lançamento(s) ativos do seu mapa precisam de um destino.`;
  $('#staff-delete-destination').innerHTML='<option value="">Escolha um funcionário</option>'+ativos.filter(x=>x.id!==user.id).map(opUsuario).join('');
  $('#staff-delete-mode').onchange=()=>{const transf=$('#staff-delete-mode').value==='transferir';$('#staff-delete-destination-wrap').hidden=!transf;$('#staff-delete-destination').required=transf;};
  $('#staff-delete-mode').dispatchEvent(new Event('change'));excluirDlg.showModal();
 }
 excluirForm.onsubmit=async e=>{e.preventDefault();const modo=$('#staff-delete-mode').value,destino=$('#staff-delete-destination').value;
  if(modo==='transferir'&&!destino){$('#staff-delete-error').textContent='Selecione um funcionário ativo.';$('#staff-delete-error').hidden=false;return;}
  const resumo=modo==='flutuar'?'sem responsável':`para ${ativos.find(u=>u.id===destino)?.nome||'outro funcionário'}`;
  if(!await confirmDialog('Confirmar exclusão',`Desativar a conta e mover todos os seus lançamentos ${resumo}? Esta operação será auditada.`))return;
  const btn=excluirForm.querySelector('[type="submit"]');btn.disabled=true;
  try{const r=await request('/usuarios',{method:'DELETE',body:{id:deleteId,modo,destino_id:modo==='transferir'?destino:null}});excluirDlg.close();toast(`Funcionário excluído. ${r.quantidade??0} lançamento(s) preservados e movidos.`);await renderRoute('usuarios');}
  catch(err){$('#staff-delete-error').textContent=err.message;$('#staff-delete-error').hidden=false;}finally{btn.disabled=false;}
 };
 let todosOsItens=[];let selecionados=new Set();let cacheOrigem='';let cacheMes='';
 const moveDlg=$('#staff-move-dialog'),selectOrigem=$('#staff-move-source'),selectDestino=$('#staff-move-target'),selectMes=$('#staff-move-month'),selectSecao=$('#staff-move-section');
 function abrirMover(usuario=null){selectOrigem.value=usuario?.id||'';selectDestino.value='';selectMes.value='';selectSecao.innerHTML='<option value="">Todas as seções</option>';
  $('#staff-move-all').checked=false;$('#staff-move-error').hidden=true;$('#staff-move-summary').textContent='Escolha a origem. Se desejar, filtre por mês ou seção.';$('#staff-move-items').innerHTML='';todosOsItens=[];selecionados.clear();cacheOrigem='';cacheMes='';moveDlg.showModal();if(usuario)void consultarItens();}
 async function consultarItens(){const origem=selectOrigem.value,mes=selectMes.value;
  if(!origem||(mes&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes))){$('#staff-move-summary').textContent='Selecione uma origem e, se informado, um mês válido.';return;}
  const btn=$('#staff-move-reload');btn.disabled=true;$('#staff-move-summary').textContent='Consultando lançamentos…';$('#staff-move-error').hidden=true;
  try{const r=await request('/usuarios/lancamentos?origem='+encodeURIComponent(origem)+(mes?'&mes='+encodeURIComponent(mes):''));
   todosOsItens=r.registros||[];selecionados.clear();cacheOrigem=origem;cacheMes=mes;
   const anterior=selectSecao.value;selectSecao.innerHTML='<option value="">Todas as seções</option>'+(r.secoes||[]).map(sec=>`<option value="${H(sec)}">${H(sec)}</option>`).join('');
   if([...selectSecao.options].some(o=>o.value===anterior))selectSecao.value=anterior;$('#staff-move-all').checked=false;desenharItens();
  }catch(err){todosOsItens=[];selecionados.clear();$('#staff-move-summary').textContent='Consulta indisponível.';$('#staff-move-error').textContent=err.message;$('#staff-move-error').hidden=false;}
  finally{btn.disabled=false;}
 }
 function itensFiltrados(){return todosOsItens.filter(x=>!selectSecao.value||x.secao.toLowerCase().trim()===selectSecao.value.toLowerCase().trim());}
 function desenharItens(){const filtrados=itensFiltrados(),todos=$('#staff-move-all').checked;
  $('#staff-move-summary').textContent=`${filtrados.length} lançamento(s) · ${selecionados.size} selecionado(s) · ${cacheMes?'mês '+cacheMes:'todos os meses'}. ${filtrados.length>150?'Mostrando os primeiros 150; use “todos os filtrados” para incluir os demais.':''}`;
  $('#staff-move-items').innerHTML=filtrados.length?filtrados.slice(0,150).map(x=>`<label class="staff-move-item"><input type="checkbox" data-transfer-item="${H(x.id)}" ${selecionados.has(x.id)?'checked':''} ${todos?'disabled':''}><span><strong>${H(x.descricao||x.ean)}</strong><small>${H(x.secao||'Sem seção')} · EAN ${H(x.ean)} · Lote ${H(x.lote)} · Val. ${dataBR(x.validade)} · ${H(x.quantidade)} un.</small></span></label>`).join(''):empty('Nenhum lançamento encontrado para os filtros escolhidos.');
  $('#staff-move-confirm').textContent=todos?`Transferir todos (${filtrados.length})`:`Transferir selecionados (${selecionados.size})`;
 }
 $('#staff-move-items').onchange=e=>{const box=e.target.closest('[data-transfer-item]');if(!box)return;if(box.checked)selecionados.add(box.dataset.transferItem);else selecionados.delete(box.dataset.transferItem);desenharItens();};
 $('#staff-move-all').onchange=()=>{selecionados.clear();desenharItens();};
 selectSecao.onchange=()=>{selecionados.clear();$('#staff-move-all').checked=false;desenharItens();};
 selectOrigem.onchange=()=>{cacheOrigem='';void consultarItens();};selectMes.onchange=()=>{cacheMes='';void consultarItens();};
 $('#staff-move-reload').onclick=consultarItens;
 $('#staff-move-open').onclick=()=>abrirMover();
 $('#staff-move-confirm').onclick=async()=>{
  const origem=selectOrigem.value,destino=selectDestino.value,mes=selectMes.value,secao=selectSecao.value,todos=$('#staff-move-all').checked;
  if(!origem||!destino||origem===destino){$('#staff-move-error').textContent='Escolha origem e destino diferentes.';$('#staff-move-error').hidden=false;return;}
  if(cacheOrigem!==origem||cacheMes!==mes){$('#staff-move-error').textContent='Atualize a consulta antes de transferir.';$('#staff-move-error').hidden=false;return;}
  const filtrados=itensFiltrados();const ids=filtrados.filter(x=>selecionados.has(x.id)).map(x=>x.id);
  if(!(todos?filtrados.length:ids.length)){$('#staff-move-error').textContent='Selecione pelo menos um produto ou todos os filtrados.';$('#staff-move-error').hidden=false;return;}
  const descricaoDestino=destino==='flutuando'?'Sem responsável':usuarios.find(u=>u.id===destino)?.nome;
  const total=todos?filtrados.length:ids.length;
  if(!await confirmDialog('Transferir lançamentos',`Transferir ${total} lançamento(s) de ${mes?'mês '+mes:'todos os meses'}, seção ${secao||'todas'}, para ${descricaoDestino}?`))return;
  const btn=$('#staff-move-confirm');btn.disabled=true;$('#staff-move-error').hidden=true;
  try{const r=await request('/usuarios/transferir',{method:'POST',body:{origem,destino,mes,secao,todos,ids:todos?[]:ids}});
   moveDlg.close();toast(`${r.quantidade??0} lançamento(s) transferido(s).`);await renderRoute('usuarios');
  }catch(err){$('#staff-move-error').textContent=err.message;$('#staff-move-error').hidden=false;}
  finally{btn.disabled=false;}
 };
 $('#staff-list').onclick=async e=>{
  const rn=e.target.closest('[data-staff-rename]'),del=e.target.closest('[data-staff-delete]'),move=e.target.closest('[data-staff-move]');
  if(rn){const u=usuarios.find(x=>x.id===rn.dataset.staffRename);if(u)abrirRenomear(u);return;}
  if(del){const u=usuarios.find(x=>x.id===del.dataset.staffDelete);if(u)abrirExcluir(u);return;}
  if(move){const u=usuarios.find(x=>x.id===move.dataset.staffMove);if(u)abrirMover(u);return;}
  const pin=e.target.closest('[data-pin]');if(pin){const u=usuarios.find(x=>x.id===pin.dataset.pin);if(u)openPinReset(u);return;}
  const b=e.target.closest('[data-user]');if(!b)return;const u=usuarios.find(x=>x.id===b.dataset.user);if(!u)return;const flag=b.dataset.flag;
  if(!await confirmDialog('Alterar funcionário',`Confirmar alteração de ${flag==='ativo'?'situação':'autorização de celular'} de ${u.nome}?`))return;
  try{await request('/usuarios',{method:'PATCH',body:{id:u.id,[flag]:!u[flag]}});toast('Funcionário atualizado.');renderRoute(state.route);}catch(err){toast(err.message,true);}
 };
 $('#user-form').onsubmit=async e=>{e.preventDefault();const f=e.target;try{await request('/usuarios',{method:'POST',body:{...Object.fromEntries(new FormData(f)),perfil:'funcionario'}});toast('Funcionário cadastrado.');renderRoute(state.route);}catch(err){toast(err.message,true);}};
}
function diasVencimento(iso){const v=Date.parse(String(iso||'').slice(0,10)+'T12:00:00Z'),h=Date.parse(nowBrISO()+'T12:00:00Z');return Number.isFinite(v)?Math.round((v-h)/86400000):null;}
async function controleValidade(){
 const [rows,stock]=await Promise.all([getMaps(),request('/estoque').catch(()=>({registros:[]}))]);
 const vivos=rows.filter(x=>Number(x.quantidade)>0),saldos=(stock.registros||[]).filter(x=>Number(x.quantidade)>0),emap=new Set(vivos.map(x=>x.ean));
 const falta=saldos.filter(x=>x.ean&&!emap.has(x.ean));
 const vencidos=vivos.filter(x=>statusVal(x.validade,x.secao)[0]==='Vencido');
 const em7=vivos.filter(x=>{const d=diasVencimento(x.validade);return d!=null&&d>=0&&d<=7;});
 const elegiveis=vivos.filter(x=>elegivelTentativaVenda(x.validade,nowBrISO()));
 let page=0,choice='todos',filtered=[];
 $('#content').innerHTML=header('Controle de Validade','Situação por produto, meses e seções. Os saldos Procfit sem mapa são mostrados separadamente.',
 '<button class="btn-outline" id="ctrl-update" type="button">Atualizar controle</button>')+
 `<div class="stat-grid"><div class="card stat"><small>Dentro da validade</small><strong>${vivos.length-vencidos.length}</strong></div><div class="card stat warn"><small>Vencem em 7 dias</small><strong>${em7.length}</strong></div><div class="card stat danger"><small>Vencidos</small><strong>${vencidos.length}</strong></div><div class="card stat"><small>Saldo sem mapa</small><strong>${falta.length}</strong></div><div class="card stat"><small>Tentativa de Venda (3–9 meses)</small><strong>${elegiveis.length}</strong></div></div>
 <section class="card card-pad"><h2>Controle de vencimentos</h2><div class="filter-row"><input id="ctrl-search" class="wide" placeholder="Produto, EAN, código ou lote"><select id="ctrl-status"><option value="todos">Todas as situações</option><option value="vencido">Vencidos</option><option value="a-vencer">A vencer</option><option value="vendavel">Dentro da validade</option><option value="sete">Vencem em 7 dias</option><option value="elegiveis">Elegíveis de 3 a 9 meses</option></select><select id="ctrl-page-size"><option>15</option><option>25</option><option>50</option></select><button class="btn-outline" id="ctrl-export" type="button">Exportar CSV</button><button class="btn-outline" id="ctrl-print" type="button">Imprimir</button></div><p class="footer-hint" id="ctrl-count"></p><div id="ctrl-list"></div><div class="pager"><button id="ctrl-prev" class="btn-outline">Anterior</button><span id="ctrl-pages"></span><button id="ctrl-next" class="btn-outline">Próxima</button></div></section>
 <section class="card card-pad"><div class="page-head subsection-head"><div><h2>Elegíveis a Tentativa de Venda / Prevenção</h2><p>Validade entre 3 e 9 meses de calendário a partir de hoje (inclusive).</p></div><div class="toolbar"><button class="btn-outline" id="tv-export" type="button">Exportar CSV</button><button class="btn-outline" id="tv-print" type="button">Imprimir</button></div></div><div class="filter-row"><select id="tv-owner"><option value="">Todos os funcionários / abas</option>${[...new Set(elegiveis.map(r=>r.mapa_nome))].sort().map(nome=>`<option value="${H(nome)}">${H(nome)}</option>`).join('')}</select><input id="tv-search" class="wide" placeholder="Buscar código, descrição, lote ou funcionário"><label>Por página <select id="tv-size"><option>15</option><option>25</option><option>50</option></select></label></div><p id="tv-count" class="footer-hint"></p><div id="tv-list"></div><div class="pager"><button id="tv-prev" type="button" class="btn-outline">Anterior</button><span id="tv-pages"></span><button id="tv-next" type="button" class="btn-outline">Próxima</button></div></section>
 <section class="card card-pad secondary-card"><h2>Saldo Procfit ainda não mapeado</h2><p>Itens com quantidade em estoque, mas sem correspondência no Mapa de Validade. Não são registros de vencimento.</p>${table(['EAN','Descrição','Código interno','Saldo Procfit'],falta.slice(0,200).map(x=>`<tr><td>${H(x.ean)}</td><td>${H(x.descricao)}</td><td>${H(x.codigo_interno)}</td><td>${H(x.quantidade)}</td></tr>`))}</section>`;
 const makeTable=data=>table(['Produto / EAN','Mapa','Lote','Validade','Dias restantes','Quantidade','Status'],data.map(r=>`<tr><td><strong>${H(r.descricao||r.ean)}</strong><span class="second">${H(r.ean)}</span></td><td>${H(r.mapa_nome)}</td><td>${H(r.lote)}</td><td>${dataBR(r.validade)}</td><td>${H(diasVencimento(r.validade)??'—')}</td><td>${H(r.quantidade)}</td><td>${badgeValidade(r.validade,r.secao)}</td></tr>`));
 const render=()=>{const q=$('#ctrl-search').value.trim().toLowerCase(),st=$('#ctrl-status').value;
  filtered=vivos.filter(x=>(!q||[x.ean,x.descricao,x.lote,x.codigoInterno].join(' ').toLowerCase().includes(q))&&(st==='todos'||st==='vencido'&&statusVal(x.validade,x.secao)[0]==='Vencido'||st==='a-vencer'&&statusVal(x.validade,x.secao)[0]==='A vencer'||st==='vendavel'&&statusVal(x.validade,x.secao)[0]==='Vendável'||st==='sete'&&em7.includes(x)||st==='elegiveis'&&elegiveis.includes(x)));
  const sz=Number($('#ctrl-page-size').value),np=Math.max(1,Math.ceil(filtered.length/sz));page=Math.min(page,np-1);
  $('#ctrl-list').innerHTML=makeTable(filtered.slice(page*sz,(page+1)*sz));$('#ctrl-count').textContent=`${filtered.length} registros · ${filtered.reduce((n,x)=>n+Number(x.quantidade||0),0)} unidades`;
  $('#ctrl-pages').textContent=`Página ${page+1} de ${np}`;$('#ctrl-prev').disabled=page===0;$('#ctrl-next').disabled=page>=np-1;
 };
 $('#ctrl-search').oninput=()=>{page=0;render();};$('#ctrl-status').onchange=()=>{page=0;render();};$('#ctrl-page-size').onchange=()=>{page=0;render();};
 $('#ctrl-prev').onclick=()=>{page--;render();};$('#ctrl-next').onclick=()=>{page++;render();};
 $('#ctrl-export').onclick=()=>exportCsv('controle-validades-'+nowBrISO()+'.csv',['Mapa','EAN','Descricao','Lote','Validade','Quantidade','Dias','Status'],filtered.map(x=>[x.mapa_nome,x.ean,x.descricao,x.lote,x.validade,x.quantidade,diasVencimento(x.validade),statusVal(x.validade,x.secao)[0]]));
 const eligibleHeader=['Código/EAN','Descrição','Lote','Validade','Dias','Quantidade','Funcionário / Aba','Ações'];
 const tvTable=data=>table(eligibleHeader,data.map(r=>`<tr><td>${H(r.codigoInterno||r.ean)}</td><td>${H(r.descricao||'Sem descrição')}</td><td>${H(r.lote)}</td><td>${dataBR(r.validade)}</td><td>${H(diasVencimento(r.validade))}</td><td>${H(r.quantidade)}</td><td>${H(r.mapa_nome)}</td><td>${isAdmin()?`<button type="button" class="action-link danger-text" data-tv-retirar="${H(r.id)}" title="Retirar da Loja (registrado no histórico)">Retirar da Loja</button>`:'—'}</td></tr>`));
 let tvPagina=0,tvFiltrados=[];
 const tvRender=()=>{
  const busca=$('#tv-search').value.toLocaleLowerCase('pt-BR').trim(),owner=$('#tv-owner').value;
  tvFiltrados=elegiveis.filter(r=>(!owner||r.mapa_nome===owner)&&(!busca||[r.ean,r.codigoInterno,r.descricao,r.lote,r.mapa_nome].join(' ').toLocaleLowerCase('pt-BR').includes(busca)));
  const size=Number($('#tv-size').value),pages=Math.max(1,Math.ceil(tvFiltrados.length/size));tvPagina=Math.min(tvPagina,pages-1);
  $('#tv-list').innerHTML=tvTable(tvFiltrados.slice(tvPagina*size,(tvPagina+1)*size));
  $('#tv-count').textContent=`${tvFiltrados.length} produtos elegíveis · ${tvFiltrados.reduce((n,r)=>n+Number(r.quantidade||0),0)} unidades`;
  $('#tv-pages').textContent=`Página ${tvPagina+1} de ${pages}`;$('#tv-prev').disabled=tvPagina===0;$('#tv-next').disabled=tvPagina>=pages-1;
 };
 $('#tv-search').oninput=$('#tv-owner').onchange=$('#tv-size').onchange=()=>{tvPagina=0;tvRender();};
 $('#tv-prev').onclick=()=>{tvPagina--;tvRender();};$('#tv-next').onclick=()=>{tvPagina++;tvRender();};
 $('#tv-export').onclick=()=>exportCsv('tentativa-de-venda-'+nowBrISO()+'.csv',eligibleHeader.slice(0,7),tvFiltrados.map(r=>[r.codigoInterno||r.ean,r.descricao,r.lote,r.validade,diasVencimento(r.validade),r.quantidade,r.mapa_nome]));
 $('#tv-print').onclick=()=>printableTable('#tv-list',()=>tvTable(tvFiltrados));
 $('#tv-list').onclick=async e=>{
  const btn=e.target.closest('[data-tv-retirar]');if(!btn||!isAdmin())return;
  const reg=elegiveis.find(x=>x.id===btn.dataset.tvRetirar);if(!reg)return;
  if(!await confirmDialog('Retirar da Loja',`Remover ${reg.descricao||reg.ean} (lote ${reg.lote}) da lista de produtos da loja? O registro será preservado para auditoria.`))return;
  btn.disabled=true;
  try{await request('/mapas/retirar-loja',{method:'POST',body:{id:reg.id}});toast('Registro retirado da loja e auditado.');await renderRoute(state.route);}
  catch(err){toast(err.message,true);btn.disabled=false;}
 };
 tvRender();
 $('#ctrl-print').onclick=()=>printableTable('#ctrl-list',()=>makeTable(filtered));$('#ctrl-update').onclick=()=>renderRoute(state.route);render();
}
async function notificacoes(){
 const d=await request(isGeral()?'/notificacoes/dispositivos':urlWithLoja('/notificacoes/dispositivos'));
 const devices=d.dispositivos||[];
 const own=devices.filter(x=>x.usuario_id===state.user.id);
 const enabled=escolhaPush(state.user)==='sim';
 const isManager=canManage();
 $('#content').innerHTML=header('Notificações','Avisos de validade para todos os usuários que aceitarem receber.')+
 `<section class="card card-pad"><h2>Notificações neste aparelho</h2>
 <p class="footer-hint">Você escolhe receber ou não. Não é necessário marcar Celular próprio ou solicitar aprovação. Os avisos são enviados a cada 8 horas quando há vencimentos que precisam de atenção na loja.</p>
 <div class="form-actions"><button class="primary" id="push-ativar" type="button">${enabled?'Reativar notificações':'Permitir notificações'}</button><button class="btn-outline" id="push-desativar" type="button">Não receber neste aparelho</button><button class="btn-outline" id="push-atualizar" type="button">Atualizar lista</button><button class="btn-outline" id="push-diagnosticar" type="button">Diagnosticar OneSignal</button></div>
 <p class="footer-hint" id="push-status" role="status">Preferência neste aparelho: ${enabled?'Permitir':'Não receber ou ainda não definida'}.</p></section>`+
 (isManager?`<section class="card card-pad"><h2>Aparelhos inscritos</h2><p class="footer-hint">A assinatura é voluntária e individual. O administrador pode enviar um teste, mas não autoriza outros aparelhos.</p>
 <div class="table-wrap"><table><thead><tr><th>Usuário</th><th>Dispositivo</th><th>Estado</th><th>Ações</th></tr></thead><tbody>${devices.map(v=>`<tr><td>${H(v.funcionario)}</td><td>${H(v.nome_dispositivo||'Navegador')}</td><td>${v.ativo&&v.consentimento_em?pill('Recebendo','green'):pill('Desativado','amber')}</td><td>${v.ativo&&v.consentimento_em?`<button type="button" class="btn-outline" data-push-test="${H(v.id)}">Testar</button>`:'—'}</td></tr>`).join('')||'<tr><td colspan="4">Nenhum aparelho cadastrado nesta loja.</td></tr>'}</tbody></table></div></section>`:
 `<section class="card card-pad"><h2>Meus aparelhos</h2><p class="footer-hint">${own.length?own.map(v=>(v.ativo&&v.consentimento_em?'Recebendo':'Desativado')+' · '+H(v.nome_dispositivo)).join('<br>'):'Nenhum aparelho vinculado à sua conta.'}</p></section>`);
 $('#push-ativar').onclick=async()=>{
   const btn=$('#push-ativar'),status=$('#push-status');btn.disabled=true;status.textContent='Solicitando permissão ao navegador…';
   try{const r=await ativarPush(state.user,request);status.textContent=r.detalhe||'Notificações ativadas.';toast(status.textContent);}
   catch(e){status.textContent=e.message;toast(e.message,true);}finally{btn.disabled=false;}
 };
 $('#push-desativar').onclick=async()=>{const btn=$('#push-desativar');btn.disabled=true;try{await recusarPush(state.user,request);toast('Notificações desativadas neste aparelho.');await renderRoute('notificacoes');}catch(e){toast(e.message,true);btn.disabled=false;}};
 $('#push-atualizar').onclick=()=>renderRoute('notificacoes');
 $('#push-diagnosticar').onclick=async()=>{
   const btn=$('#push-diagnosticar'),status=$('#push-status');btn.disabled=true;status.textContent='Verificando Site URL e Service Worker…';
   try{const d=await diagnosticarPush();status.textContent=`Origem: ${d.origem} · HTTPS: ${d.https?'sim':'não'} · Permissão: ${d.navegador} · SDK: ${d.sdk} · Worker: ${d.worker} · Assinatura: ${d.assinatura} · Push: ${d.canalPush}. Se usar Brave, confira também os serviços de mensagens push nas configurações de privacidade.`;}
   catch(err){status.textContent='Diagnóstico indisponível: '+err.message;}
   finally{btn.disabled=false;}
 };
 document.querySelectorAll('[data-push-test]').forEach(b=>b.onclick=async()=>{
   b.disabled=true;try{const r=await request('/notificacoes/teste',{method:'POST',body:{id:b.dataset.pushTest,...(isGeral()&&state.loja?{loja:state.loja}:{})}});toast(r.detalhe||'Mensagem aceita pelo OneSignal.');}catch(e){toast(e.message,true);}finally{b.disabled=false;}
 });
}

async function generic(pathname,title){
 const d=await request(urlWithLoja('/'+pathname)),rows=d.registros||[];
 const isQueima=pathname==='queima',isVenc=pathname==='vencidos',isAudit=pathname==='auditoria',isSinal=pathname==='sinalizacoes',isTrans=pathname==='transferencias';
 let filtered=[],page=0;
 $('#content').innerHTML=header(title,isVenc?'Ocorrências registradas, independentes do filtro mensal do mapa.':'Histórico e operações por loja.',
 '<button class="btn-outline" id="gen-print" type="button">Imprimir</button><button class="btn-outline" id="gen-export" type="button">Exportar CSV</button>')+
 `<section class="card card-pad"><div class="filter-row"><input id="gen-search" class="wide" placeholder="Buscar produto, EAN, lote, usuário ou evento"><select id="gen-status"><option value="">Todas as situações</option>
 ${isQueima?'<option value="pendente">Pendente</option><option value="aprovado">Aprovado</option><option value="relancado">Relançado</option>':isSinal?'<option value="aberto">Em aberto</option><option value="resolvido">Resolvido</option><option value="negado">Negado</option>':''}</select><label>Desde <input id="gen-since" type="date"></label><label>Por página <select id="gen-size"><option>15</option><option>25</option><option>50</option></select></label><button class="btn-outline" id="gen-refresh" type="button">Atualizar</button></div><p id="gen-counter" class="footer-hint"></p><div id="gen-list"></div><div class="pager"><button id="gen-prev" class="btn-outline">Anterior</button><span id="gen-pages"></span><button id="gen-next" class="btn-outline">Próxima</button></div></section>`+
 (!isAudit?`<section class="card card-pad secondary-card"><h2>${isQueima?'Cadastrar produto na Queima':isSinal?'Registrar sinalização':isVenc?'Registrar retirada':'Registrar transferência'}</h2>
 <form id="generic-form" class="form-grid"><label>EAN<input name="ean" inputmode="numeric" pattern="[0-9]{8,14}" ${isVenc?'':'required'}></label>
 ${isVenc?'<label>Código interno (opcional)<input name="codigo_interno"></label><label class="full">Descrição original<input name="descricao_original"></label>':''}
 ${isSinal?'<label class="full">Motivo / observação<input name="observacao" required maxlength="600"></label>':`<label>Lote<input name="lote" maxlength="100"></label><label>Validade<input type="date" name="validade"></label><label>Quantidade<input type="number" min="1" value="1" name="quantidade" required></label>`}
 ${isTrans?`<label>Loja de origem<input name="loja_origem" inputmode="numeric" pattern="[0-9]{1,12}" required></label><label>Romaneio<input name="romaneio" maxlength="100" required></label><div class="notice full">Loja destino: ${H(state.user.loja)} (automática, não editável).</div>`:''}
 ${isVenc?'<label>Motivo<select name="motivo"><option value="vencido">Vencido</option><option value="danificado">Danificado</option></select></label>':''}
 <div class="form-actions"><button class="primary">Registrar</button></div></form></section>`:'');
 const cols=isAudit?['Data / hora','Usuário','Evento','Descrição']:isQueima?['Data','EAN','Descrição','Lote','Validade','Quantidade','Motivo','Situação','Ações']:isVenc?['Data','EAN','Descrição','Lote','Validade','Quantidade','Motivo']:isTrans?['Data','EAN','Descrição','Lote','Validade','Quantidade','Loja origem','Loja destino','Romaneio']:['Data','EAN','Descrição','Observação','Situação','Ações'];
 const td=(v)=>`<td>${H(v??'—')}</td>`;
 const renderTable=data=>table(cols,data.map(r=>{
  const ean=r.ean_resolvido||r.ean||'Não informado',desc=r.descricao||r.descricao_original||'Sem descrição cadastrada';
  if(isAudit){const obj=r.dados&&typeof r.dados==='object'?r.dados:{},orig=r.usuarios?.nome||obj.autor_original||obj.nome_usuario||null;
   return `<tr><td>${dtBR(r.criado_em)}</td><td>${H(orig||'Usuário não identificado')}</td><td>${H(r.acao)}</td><td>${H(obj.descricao||[obj.mapa,obj.ean,obj.lote,obj.destino].filter(Boolean).join(' · ')||'Evento registrado')}</td></tr>`;
  }
  if(isQueima){
    const lastMonth=mesBrasil(r.criado_em)!==nowBrISO().slice(0,7),pendente=r.estado==='pendente';
    const primary=pendente?(lastMonth?`<button class="action-link" data-relaunch="${H(r.id)}">Relançar</button>`:`<button class="action-link" data-approve="${H(r.id)}">Aprovar</button>`):`<button type="button" class="action-link" disabled title="Registro não pode ser aprovado novamente">${r.estado==='aprovado'?'Aprovado':'Relançado'}</button>`;
    const apagar=pendente?` <button class="action-link danger-text" data-delete-burn="${H(r.id)}">Excluir</button>`:'';
    return `<tr><td>${dtBR(r.criado_em)}</td>${td(ean)}${td(desc)}${td(r.lote)}<td>${dataBR(r.validade)}</td>${td(r.quantidade)}${td(r.motivo)}<td>${pill(r.estado,r.estado==='aprovado'?'green':pendente?'amber':'')}</td><td class="row-actions">${primary}${apagar}</td></tr>`;
  }
  if(isVenc)return `<tr><td>${dtBR(r.criado_em)}</td>${td(ean)}${td(desc)}${td(r.lote)}<td>${dataBR(r.validade)}</td>${td(r.quantidade)}${td(r.motivo)}</tr>`;
  if(isTrans)return `<tr><td>${dtBR(r.criado_em)}</td>${td(ean)}${td(desc)}${td(r.lote)}<td>${dataBR(r.validade)}</td>${td(r.quantidade)}${td(r.loja_origem)}${td(r.loja_destino)}${td(r.romaneio)}</tr>`;
  return `<tr><td>${dtBR(r.criado_em)}</td>${td(ean)}${td(desc)}${td(r.observacao)}<td>${pill(r.situacao||'aberto',r.situacao==='resolvido'?'green':r.situacao==='negado'?'red':'amber')}</td><td>${!r.situacao||r.situacao==='aberto'?`<button class="action-link" data-sinal="${H(r.id)}" data-status="resolvido">Resolver</button> <button class="action-link" data-sinal="${H(r.id)}" data-status="negado">Negar</button>`:'—'}</td></tr>`;
 }));
 const apply=()=>{const q=$('#gen-search').value.toLowerCase(),status=$('#gen-status').value,from=$('#gen-since').value;
  filtered=rows.filter(x=>[x.ean,x.ean_resolvido,x.descricao,x.descricao_original,x.lote,x.acao,x.observacao,JSON.stringify(x.dados||{}),x.romaneio].join(' ').toLowerCase().includes(q)&&(!status||String(x.estado||x.situacao)==status)&&(!from||String(x.criado_em||'').slice(0,10)>=from));
  page=0;draw();};
 const draw=()=>{const sz=Number($('#gen-size').value),np=Math.max(1,Math.ceil(filtered.length/sz));page=Math.max(0,Math.min(np-1,page));$('#gen-list').innerHTML=renderTable(filtered.slice(page*sz,(page+1)*sz));$('#gen-counter').textContent=`${filtered.length} registro(s)`;$('#gen-pages').textContent=`Página ${page+1} de ${np}`;$('#gen-prev').disabled=page===0;$('#gen-next').disabled=page>=np-1;};
 for(const id of ['gen-search','gen-status','gen-since'])$('#'+id).addEventListener('input',apply);$('#gen-size').onchange=apply;$('#gen-prev').onclick=()=>{page--;draw();};$('#gen-next').onclick=()=>{page++;draw();};
 $('#gen-refresh').onclick=()=>renderRoute(state.route);$('#gen-print').onclick=()=>printableTable('#gen-list',()=>renderTable(filtered));
 $('#gen-export').onclick=()=>exportCsv(`${pathname}-${nowBrISO()}.csv`,cols,filtered.map(x=>cols.map(k=>{
  const match={'Data':x.criado_em,'Data / hora':x.criado_em,'Usuário':x.usuarios?.nome||x.dados?.autor_original||'Não identificado','Evento':x.acao,'Descrição':x.descricao||x.descricao_original||x.dados?.descricao,'EAN':x.ean_resolvido||x.ean||'','Lote':x.lote,'Validade':x.validade,'Quantidade':x.quantidade,'Motivo':x.motivo,'Situação':x.estado||x.situacao,'Observação':x.observacao,'Loja origem':x.loja_origem,'Loja destino':x.loja_destino,'Romaneio':x.romaneio};return match[k]||'';
 })));
 $('#gen-list').onclick=async e=>{
  const appr=e.target.closest('[data-approve]'),rel=e.target.closest('[data-relaunch]'),sin=e.target.closest('[data-sinal]'),del=e.target.closest('[data-delete-burn]');if(!appr&&!rel&&!sin&&!del)return;
  const id=appr?.dataset.approve||rel?.dataset.relaunch||sin?.dataset.sinal||del?.dataset.deleteBurn,old=rows.find(x=>x.id===id);if(!old)return;
  const action=appr?'aprovar':rel?'relançar':del?'excluir':'alterar sinalização para '+sin.dataset.status;
  if(!await confirmDialog('Confirmar operação',`Deseja ${action} este registro?`))return;
  try{if(appr)await request('/queima',{method:'PATCH',body:{id,estado:'aprovado'}});
   else if(rel)await request('/queima/relancar',{method:'POST',body:{id}});
   else if(del)await request('/queima',{method:'DELETE',body:{id}});
   else await request('/sinalizacoes',{method:'PATCH',body:{id,situacao:sin.dataset.status}});
   toast('Operação registrada.');renderRoute(state.route);
  }catch(err){toast(err.message,true);}
 };
 const form=$('#generic-form');if(form)form.onsubmit=async e=>{e.preventDefault();const btn=form.querySelector('[type="submit"]'),body=Object.fromEntries(new FormData(form));
  for(const key of Object.keys(body))if(body[key]==='')delete body[key];if(body.quantidade)body.quantidade=Number(body.quantidade);if(isTrans){body.requestId=form.dataset.requestId||newId();form.dataset.requestId=body.requestId;}if(isQueima){body.motivo='4';body.estado='pendente';}
  if(isVenc&&!body.ean&&!body.codigo_interno)return toast('Informe EAN ou código interno.',true);
  btn.disabled=true;try{await request('/'+pathname,{method:'POST',body});toast('Registro incluído.');if(isTrans)delete form.dataset.requestId;renderRoute(state.route);}catch(err){toast(err.message,true);}finally{btn.disabled=false;}
 };
 apply();
}
async function transferenciasPainel(){
 if(!isAdmin())throw new Error('Somente o Administrador de Loja acessa Transferências.');
 const response=await request('/transferencias');const registros=response.registros||[];
 let page=0,filtered=[];
 $('#content').innerHTML=header('Transferências','Transferências recebidas pela sua loja; todos os movimentos são auditados.',
 '<button class="primary" id="transfer-new" type="button">Registrar Transferência</button><button class="btn-outline" id="transfer-print" type="button">Imprimir</button><button class="btn-outline" id="transfer-csv" type="button">Exportar CSV</button>')+
 `<section class="card card-pad"><div class="filter-row"><input class="wide" id="transfer-search" placeholder="EAN, descrição, lote, romaneio ou origem"><label>Por página <select id="transfer-size"><option>15</option><option>25</option><option>50</option></select></label><button type="button" id="transfer-refresh" class="btn-outline">Atualizar</button></div><p id="transfer-count" class="footer-hint"></p><div id="transfer-list"></div><div class="pager"><button type="button" id="transfer-prev" class="btn-outline">Anterior</button><span id="transfer-pages"></span><button type="button" id="transfer-next" class="btn-outline">Próxima</button></div></section>
 <dialog id="transfer-dialog" class="dialog operational-dialog"><form id="transfer-form" class="dialog-inner"><h2 id="transfer-title">Registrar Transferência</h2><p class="footer-hint">A loja de destino é definida pela sua sessão e não pode ser modificada.</p><div class="form-grid">
 <label>EAN<input name="ean" inputmode="numeric" pattern="[0-9]{8,14}" maxlength="14" required></label><label>Lote<input name="lote" maxlength="100" required></label>
 <label>Validade<input name="validade" type="date" required></label><label>Quantidade<input name="quantidade" type="number" min="1" max="999999" step="1" required></label>
 <label>Loja de origem<input name="loja_origem" pattern="[0-9]{1,12}" inputmode="numeric" maxlength="12" required></label><label>Romaneio<input name="romaneio" maxlength="100" required></label>
 <div class="notice full">Loja de destino: ${H(state.user.loja)} (automaticamente)</div></div>
 <div class="dialog-actions"><button type="button" id="transfer-cancel" class="btn-outline">Cancelar</button><button type="submit" class="primary" id="transfer-save">Salvar Transferência</button></div><p id="transfer-error" role="alert" class="error-note" hidden></p></form></dialog>`;
 const form=$('#transfer-form'),dlg=$('#transfer-dialog');let editId='',requestId='';
 const renderRows=records=>table(['Data','Produto / EAN','Lote','Validade','Qtd.','Origem','Destino','Romaneio','Ações'],records.map(r=>`<tr><td>${dtBR(r.criado_em)}</td><td><strong>${H(r.descricao||'Sem descrição')}</strong><span class="second">${H(r.ean_resolvido||r.ean)}</span></td><td>${H(r.lote)}</td><td>${dataBR(r.validade)}</td><td>${H(r.quantidade)}</td><td>${H(r.loja_origem)}</td><td>${H(r.loja_destino)}</td><td>${H(r.romaneio)}</td><td class="row-actions"><button type="button" class="action-link" data-transfer-edit="${H(r.id)}">Editar</button><button type="button" class="action-link danger-text" data-transfer-delete="${H(r.id)}">Excluir</button></td></tr>`));
 const draw=()=>{const size=Number($('#transfer-size').value),total=Math.max(1,Math.ceil(filtered.length/size));page=Math.min(page,total-1);$('#transfer-list').innerHTML=renderRows(filtered.slice(page*size,(page+1)*size));$('#transfer-count').textContent=`${filtered.length} transferência(s)`;$('#transfer-pages').textContent=`Página ${page+1} de ${total}`;$('#transfer-prev').disabled=page===0;$('#transfer-next').disabled=page===total-1;};
 const apply=()=>{const q=$('#transfer-search').value.toLowerCase().trim();filtered=registros.filter(r=>[r.ean,r.ean_resolvido,r.descricao,r.lote,r.loja_origem,r.romaneio].join(' ').toLowerCase().includes(q));page=0;draw();};
 const abrir=registro=>{form.reset();editId=registro?.id||'';requestId=editId?'':newId();$('#transfer-title').textContent=editId?'Editar Transferência':'Registrar Transferência';$('#transfer-error').hidden=true;
  if(registro)for(const key of ['ean','lote','validade','quantidade','loja_origem','romaneio'])form.elements[key].value=key==='validade'?String(registro[key]||'').slice(0,10):registro[key]??'';
  dlg.showModal();form.elements.ean.focus();};
 $('#transfer-new').onclick=()=>abrir(null);$('#transfer-cancel').onclick=()=>dlg.close();$('#transfer-refresh').onclick=()=>renderRoute(state.route);
 $('#transfer-search').oninput=apply;$('#transfer-size').onchange=apply;$('#transfer-prev').onclick=()=>{page--;draw();};$('#transfer-next').onclick=()=>{page++;draw();};
 $('#transfer-print').onclick=()=>printableTable('#transfer-list',()=>renderRows(filtered));
 $('#transfer-csv').onclick=()=>exportCsv('transferencias-'+nowBrISO()+'.csv',['Data','EAN','Descrição','Lote','Validade','Quantidade','Origem','Destino','Romaneio'],filtered.map(r=>[r.criado_em,r.ean,r.descricao,r.lote,r.validade,r.quantidade,r.loja_origem,r.loja_destino,r.romaneio]));
 $('#transfer-list').onclick=async e=>{
  const edit=e.target.closest('[data-transfer-edit]'),del=e.target.closest('[data-transfer-delete]');if(!edit&&!del)return;
  const id=edit?.dataset.transferEdit||del?.dataset.transferDelete,reg=registros.find(r=>r.id===id);if(!reg)return;
  if(edit){abrir(reg);return;}
  if(!await confirmDialog('Excluir Transferência',`Excluir a transferência ${reg.romaneio||reg.ean} da listagem? Os dados originais permanecerão na auditoria.`))return;
  del.disabled=true;try{await request('/transferencias',{method:'DELETE',body:{id:reg.id}});toast('Transferência excluída e auditada.');await renderRoute(state.route);}catch(err){toast(err.message,true);del.disabled=false;}
 };
 form.onsubmit=async e=>{e.preventDefault();if(!form.reportValidity())return;
  const data={...Object.fromEntries(new FormData(form)),quantidade:Number(form.elements.quantidade.value)};
  if(data.loja_origem===String(state.user.loja))return toast('A loja de origem deve ser diferente da loja de destino.',true);
  if(!editId)data.requestId=requestId;
  const btn=$('#transfer-save');btn.disabled=true;$('#transfer-error').hidden=true;
  try{await request('/transferencias',{method:editId?'PATCH':'POST',body:editId?{...data,id:editId}:data});dlg.close();requestId='';toast(editId?'Transferência atualizada.':'Transferência registrada.');await renderRoute(state.route);}
  catch(err){$('#transfer-error').textContent=err.message;$('#transfer-error').hidden=false;}
  finally{btn.disabled=false;}
 };apply();
}

async function perdas(){
 const [v,m]=await Promise.all([request('/vencidos'),getMaps()]),items=v.registros||[],salon=m.filter(x=>statusVal(x.validade,x.secao)[0]==='Vencido'&&Number(x.quantidade)>0);
 let tab='retirados',q='';const retirados=items.filter(x=>x.motivo!=='danificado'),danificados=items.filter(x=>x.motivo==='danificado');
 const showEan=x=>x.ean_resolvido||x.ean||'Não informado';
 $('#content').innerHTML=header('Perdas e retiradas','Registros de produtos vencidos, danificados e produtos vencidos ainda em mapas.',
 '<button class="btn-outline" id="loss-print" type="button">Imprimir</button>')+
 `<div class="stat-grid"><div class="card stat"><small>Retirados / Vencidos</small><strong>${retirados.length}</strong></div><div class="card stat"><small>Danificados</small><strong>${danificados.length}</strong></div><div class="card stat warn"><small>Vencidos nos mapas</small><strong>${salon.length}</strong></div><div class="card stat"><small>Unidades registradas</small><strong>${items.reduce((a,x)=>a+Number(x.quantidade||0),0)}</strong></div></div>
 <section class="card card-pad"><div class="page-subnav"><button class="btn-outline" data-loss-tab="retirados" aria-pressed="true">Retirados</button><button class="btn-outline" data-loss-tab="danificados" aria-pressed="false">Danificados</button><button class="btn-outline" data-loss-tab="salao" aria-pressed="false">Vencidos no mapa</button></div>
 <div class="filter-row"><input id="loss-search" class="wide" placeholder="Buscar EAN, descrição ou lote"><button id="loss-new" class="primary" type="button">Adicionar danificado</button></div><p id="loss-total" class="footer-hint"></p><div id="loss-list"></div></section>
 <dialog id="loss-edit-dialog" class="dialog operational-dialog"><form id="loss-edit-form" class="dialog-inner"><h2>Editar registro de Perdas</h2><div class="form-grid"><label>EAN<input name="ean" inputmode="numeric" maxlength="14"></label><label>Código interno<input name="codigo_interno"></label><label class="full">Descrição<input name="descricao_original"></label><label>Lote<input name="lote" maxlength="100"></label><label>Validade<input name="validade" type="date"></label><label>Quantidade<input name="quantidade" type="number" min="1" max="999999" step="1" required></label><label>Motivo<select name="motivo"><option value="vencido">Vencido</option><option value="danificado">Danificado</option><option value="retirado">Retirado</option></select></label></div><p id="loss-edit-error" class="error-note" role="alert" hidden></p><div class="dialog-actions"><button type="button" id="loss-edit-cancel" class="btn-outline">Cancelar</button><button class="primary" type="submit" id="loss-edit-save">Salvar alterações</button></div></form></dialog>
 <section class="card card-pad secondary-card" id="loss-form-card" hidden><h2>Registrar produto danificado</h2><form id="loss-form" class="form-grid"><label>EAN<input name="ean" inputmode="numeric" pattern="[0-9]{8,14}"></label><label>Código interno<input name="codigo_interno"></label><label class="full">Descrição<input name="descricao_original" required></label><label>Lote<input name="lote"></label><label>Validade<input name="validade" type="date" required></label><label>Quantidade<input name="quantidade" type="number" min="1" required></label><div class="form-actions"><button class="primary">Salvar danificado</button></div></form></section>`;
 const draw=()=>{const list=tab==='danificados'?danificados:tab==='salao'?salon:retirados,found=list.filter(x=>[x.ean,x.ean_resolvido,x.descricao,x.descricao_original,x.lote].join(' ').toLowerCase().includes(q));
 $('#loss-total').textContent=`${found.length} registro(s)`;
 $('#loss-list').innerHTML=table(['EAN','Descrição','Lote','Validade','Quantidade','Registrado em',...(tab==='salao'?[]:['Ações'])],found.map(x=>`<tr><td>${H(showEan(x))}</td><td>${H(x.descricao||x.descricao_original||'Sem descrição')}</td><td>${H(x.lote)}</td><td>${dataBR(x.validade)}</td><td>${H(x.quantidade)}</td><td>${tab==='salao'?H(x.mapa_nome):dtBR(x.criado_em)}</td>${tab!=='salao'?`<td class="row-actions"><button type="button" class="action-link" data-loss-edit="${H(x.id)}">Editar</button><button type="button" class="action-link danger-text" data-loss-delete="${H(x.id)}">Excluir</button>${tab==='danificados'?(x.retirado_em?pill('Retirado','green'):`<button type="button" class="action-link" data-remove-damaged="${H(x.id)}">Confirmar retirada</button>`):''}</td>`:''}</tr>`));};
 for(const b of document.querySelectorAll('[data-loss-tab]'))b.onclick=()=>{tab=b.dataset.lossTab;document.querySelectorAll('[data-loss-tab]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));draw();};
 $('#loss-search').oninput=e=>{q=e.target.value.toLowerCase();draw();};$('#loss-new').onclick=()=>{$('#loss-form-card').hidden=!$('#loss-form-card').hidden;};
 $('#loss-print').onclick=()=>printableTable('#loss-list',()=>$('#loss-list').innerHTML);
 const editDlg=$('#loss-edit-dialog'),editForm=$('#loss-edit-form');let editId='';$('#loss-edit-cancel').onclick=()=>editDlg.close();
 $('#loss-list').onclick=async e=>{
  const editar=e.target.closest('[data-loss-edit]'),excluir=e.target.closest('[data-loss-delete]'),retirar=e.target.closest('[data-remove-damaged]');
  if(!editar&&!excluir&&!retirar)return;
  const id=editar?.dataset.lossEdit||excluir?.dataset.lossDelete||retirar?.dataset.removeDamaged,item=items.find(x=>x.id===id);if(!item)return;
  if(editar){editId=id;editForm.reset();for(const key of ['ean','codigo_interno','descricao_original','lote','validade','quantidade','motivo'])editForm.elements[key].value=key==='validade'?String(item[key]||'').slice(0,10):(item[key]??'');$('#loss-edit-error').hidden=true;editDlg.showModal();return;}
  if(excluir){if(!await confirmDialog('Excluir registro de Perdas',`Excluir ${item.ean||item.codigo_interno} (lote ${item.lote||'—'}) da listagem? Os dados serão preservados para auditoria.`))return;
   excluir.disabled=true;try{await request('/vencidos',{method:'DELETE',body:{id}});toast('Registro de Perdas excluído.');await renderRoute(state.route);}catch(err){toast(err.message,true);excluir.disabled=false;}return;}
  if(!await confirmDialog('Confirmar retirada','Confirmar que o danificado foi retirado da loja? O registro será preservado no histórico.'))return;
  try{await request('/vencidos/retirar',{method:'POST',body:{id}});toast('Retirada confirmada.');await renderRoute(state.route);}catch(err){toast(err.message,true);}
 };
 editForm.onsubmit=async e=>{e.preventDefault();if(!editForm.reportValidity())return;const btn=$('#loss-edit-save');btn.disabled=true;$('#loss-edit-error').hidden=true;
  const data={...Object.fromEntries(new FormData(editForm)),id:editId,quantidade:Number(editForm.elements.quantidade.value)};
  try{await request('/vencidos',{method:'PATCH',body:data});editDlg.close();toast('Perdas atualizadas.');await renderRoute(state.route);}
  catch(err){$('#loss-edit-error').textContent=err.message;$('#loss-edit-error').hidden=false;}finally{btn.disabled=false;}
 };
 $('#loss-form').onsubmit=async e=>{e.preventDefault();const form=e.target,body={...Object.fromEntries(new FormData(form)),motivo:'danificado',quantidade:Number(form.elements.quantidade.value)};
  if(!body.ean&&!body.codigo_interno)return toast('Informe EAN ou código interno.',true);
  try{await request('/vencidos',{method:'POST',body});toast('Danificado registrado.');renderRoute(state.route);}catch(err){toast(err.message,true);}
 };draw();
}

async function restoreSession(){
 if(!state.token)return showLogin();
 // Ponte válida SOMENTE no redirecionamento imediato após um /login confirmado.
 // Não reutiliza a credencial após F5; APIs de mapas e lançamentos validam
 // a sessão no servidor a cada requisição.
 const autenticado=consumirPonteDeLogin();
 if(autenticado){state.user=autenticado;showApp();return;}
 const retry=$('#btn-revalidar-sessao');if(retry){retry.disabled=true;retry.textContent='Confirmando sessão…';}
 try{
   const d=await request('/sessao',{retries:3,timeout:18000});
   if(!d?.usuario?.id)throw new Error('O servidor não retornou os dados da sessão.');
   state.user=d.usuario;showApp();
 }catch(e){
   if(e.code===401||e.code===403){await logout(false);showLogin('Sessão expirada. Entre novamente.');}
   else showLogin((navigator.onLine===false?'Sem conexão com a internet. ': 'Não foi possível confirmar a sessão. ')+(e.message||'Verifique a conexão.')+' Sua sessão foi preservada: use Tentar confirmar sessão novamente, sem redigitar a senha.');
 }finally{if(retry){retry.disabled=false;retry.textContent='Tentar confirmar sessão novamente';}}
}
let aguardandoRetornoRede=false;
window.addEventListener('online',()=>{
 if(aguardandoRetornoRede||!state.token||state.user||!$('#login-screen')||$('#login-screen').hidden)return;
 aguardandoRetornoRede=true;
 void restoreSession().finally(()=>{aguardandoRetornoRede=false;});
});
// Salva a loja na primeira digitação (sem armazenar usuário/PIN) e permite limpá-la com ×.
function setupRememberedStore(){
 const input=$('#login-loja'),clear=$('#login-loja-clear'),saved=localStorage.getItem(STORE_KEY)||'';
 const valid=/^\d{1,12}$/.test(saved);
 input.value=valid?saved:'';input.readOnly=valid;clear.hidden=!valid;
 input.title=valid?'Clique no X para trocar de loja':'';
 const save=()=>{const clean=input.value.replace(/\D/g,'').slice(0,12);input.value=clean;
   if(!input.readOnly&&clean)localStorage.setItem(STORE_KEY,clean);
   if(!input.readOnly&&!clean)localStorage.removeItem(STORE_KEY);
 };
 input.addEventListener('input',save);
 input.addEventListener('blur',()=>{save();if(input.value){input.readOnly=true;clear.hidden=false;input.title='Clique no X para trocar de loja';}});
 clear.onclick=()=>{input.readOnly=false;input.value='';localStorage.removeItem(STORE_KEY);clear.hidden=true;input.title='';input.focus();};
}
setupRememberedStore();
configurarMinhaSenha();
configurarAcessoDuplo();
prepararPush();
// Primeiro acesso em qualquer página: pergunta clara antes de pedir permissão nativa.
// Não exige aceitar para usar o sistema e não insiste após uma escolha no dispositivo.
const consentDialog=$('#push-consent-dialog');
function exibirConsentimento(){if(!escolhaPush(state.user)&&!consentDialog.open)consentDialog.showModal();}
$('#push-consent-yes').onclick=async()=>{
 const b=$('#push-consent-yes'),msg=$('#push-consent-feedback');b.disabled=true;msg.textContent='Solicitando permissão ao navegador…';
 try{const r=await ativarPush(state.user, state.user?request:null);msg.textContent=r.detalhe||'Permissão registrada.';consentDialog.close();toast(r.detalhe||'Notificações ativadas.');}
 catch(err){msg.textContent=err.message;b.disabled=false;}
};
$('#push-consent-no').onclick=async()=>{
 consentDialog.close();
 // Não bloqueia login e não chama a API caso não tenha uma sessão.
 void recusarPush(state.user,state.user?request:null);
 toast('Você pode ativar notificações depois no menu Notificações.');
};
// Oferecer após login: a autorização é vinculada à conta, nunca a uma conta desconhecida.

$('#btn-revalidar-sessao').onclick=()=>restoreSession();
$('#form-login').onsubmit=async e=>{e.preventDefault();const f=e.target,btn=$('#btn-login');btn.disabled=true;const txt=btn.innerHTML;btn.textContent='Verificando acesso…';$('#login-erro').hidden=true;try{const d=await request('/login',{method:'POST',body:{nome:f.elements.nome.value,loja:f.elements.loja.value,pin:f.elements.pin.value,manterConectado:$('#login-manter').checked},retries:1,timeout:50000});state.token=d.token;state.user=d.usuario;const store=$('#login-manter').checked?localStorage:sessionStorage;store.setItem(TOKEN_KEY,d.token);if(!$('#login-manter').checked)localStorage.removeItem(TOKEN_KEY);else sessionStorage.removeItem(TOKEN_KEY);if(d.usuario.loja)state.loja=String(d.usuario.loja);if(f.elements.loja.value) localStorage.setItem(STORE_KEY,f.elements.loja.value);f.elements.pin.value='';showApp(true);}catch(x){$('#login-erro').textContent=x.message;$('#login-erro').hidden=false;}finally{btn.disabled=false;btn.innerHTML=txt;}};
$('#btn-logout').onclick=()=>logout();$('#sidebar-collapse').onclick=()=>{if(window.matchMedia('(max-width:900px)').matches){mobileClose();return;}const el=$('#app-shell');const collapsed=el.classList.toggle('sidebar-collapsed');localStorage.setItem(SIDEBAR_KEY,collapsed?'1':'0');$('#sidebar-collapse').textContent='◈';$('#sidebar-collapse').setAttribute('aria-expanded',String(!collapsed));$('#sidebar-collapse').setAttribute('aria-label',collapsed?'Expandir menu':'Recolher menu');$('#sidebar-collapse').title=collapsed?'Expandir menu':'Recolher menu';};
$('#stock-descent-cancel').onclick=()=>$('#stock-descent-dialog').close();$('#ean-scanner-close').onclick=()=>{void fecharScanner();};$('#ean-scanner-cancel').onclick=()=>{void fecharScanner();};document.addEventListener('visibilitychange',()=>{if(document.hidden)void fecharScanner();});window.addEventListener('pagehide',()=>{void fecharScanner();});$('#launch-close').onclick=()=>$('#launch-dialog').close();$('#launch-to-panel').onclick=()=>{$('#launch-dialog').close();if(isAdmin())navigate('dashboard');};$('#launch-dialog').addEventListener('close',()=>{void fecharScanner();if(state.user&&!isGeral()&&state.route==='mapas')renderRoute('mapas');});$('#menu-toggle').onclick=()=>{$('#sidebar').classList.toggle('open');$('#menu-backdrop').hidden=!$('#sidebar').classList.contains('open');};$('#menu-backdrop').onclick=mobileClose;document.addEventListener('keydown',e=>{if(e.key==='Escape')mobileClose();});window.addEventListener('hashchange',()=>{if(state.user){const h=location.hash.slice(1);if(h!==state.route)navigate(h);}});const network=()=>{$('#net-pill').textContent=navigator.onLine?'● Conectado':'● Sem rede';$('#net-pill').classList.toggle('offline',!navigator.onLine);};window.addEventListener('online',network);window.addEventListener('offline',network);network();instalarIconesDeAcao();$('#today-label').textContent=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'full'}).format(new Date());restoreSession();
