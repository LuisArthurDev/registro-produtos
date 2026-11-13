/* Persistência por usuário, loja e aba: não guarda conteúdo de formulários de
 * edição/lançamento, senhas ou credenciais. Mantém os filtros após atualizar,
 * editar, excluir, navegar entre abas e pressionar F5. */
const PREFIXO='rv_filtros_v35_';
const CONTROLES='.filter-row input[id],.filter-row select[id],.filter-row textarea[id],.view-controls select[id],.pager select[id],.table-toolbar input[id],.table-toolbar select[id],.search-box input[id],input[data-save-filter],select[data-save-filter]';
const ABAS='[data-view-tab],[data-view-mode],[data-loss-tab],#map-tab-compare,#map-tab-list,#stock-all,#stock-expired';
const normalizar=s=>String(s||'').replace(/[^a-zA-Z0-9_-]/g,'_');
export function chaveFiltros(user,loja,route){return PREFIXO+[normalizar(user),normalizar(loja),normalizar(route)].join('__');}
export function lerFiltros(storage,key){try{const d=JSON.parse(storage.getItem(key)||'null');return d&&typeof d==='object'&&!Array.isArray(d)?d:null;}catch{return null;}}
export function capturarFiltros(root,{storage,key}={}){
 if(!root||!storage||!key)return null;
 const controls={};
 for(const el of root.querySelectorAll(CONTROLES)){
  if(!el.id||el.disabled||['password','file','hidden','radio'].includes(el.type))continue;
  controls[el.id]=el.type==='checkbox'?{tipo:'checkbox',checked:!!el.checked}:{tipo:el.tagName?.toLowerCase()==='select'?'select':'input',value:String(el.value??'')};
 }
 const abas={};
 for(const el of root.querySelectorAll(ABAS)){
  if(el.id)abas[el.id]=el.getAttribute('aria-selected')==='true'||el.getAttribute('aria-pressed')==='true';
  else if(el.dataset.viewTab||el.dataset.viewMode||el.dataset.lossTab){
   const grupo=el.dataset.viewTab?'viewTab':el.dataset.viewMode?'viewMode':'lossTab';
   if(el.classList.contains('active')||el.getAttribute('aria-pressed')==='true')abas[grupo]=el.dataset[grupo];
  }
 }
 const paginas={};
 for(const id of ['map-page-label','compare-page','ctrl-pages','tv-pages','gen-pages','transfer-pages','view-page-label']){
  const label=root.querySelector('#'+id),m=/P[aá]gina\s+(\d+)\s+de/i.exec(label?.textContent||'');
  if(m)paginas[id]=Number(m[1]);
 }
 const data={controls,abas,paginas};
 try{storage.setItem(key,JSON.stringify(data));}catch{};
 return data;
}
export async function restaurarFiltros(root,{storage,key,EventCtor=globalThis.Event}={}){
 const saved=lerFiltros(storage,key);if(!root||!saved)return false;
 const alterados=[];
 for(const [id,data] of Object.entries(saved.controls||{})){
  const el=root.querySelector('#'+id);if(!el||el.disabled||!data||!('value' in el))continue;
  if(data.tipo==='checkbox'){if(el.type!=='checkbox')continue;if(el.checked!==data.checked){el.checked=!!data.checked;alterados.push(el);}continue;}
  if(el.tagName==='SELECT'&&![...el.options].some(o=>o.value===data.value))continue;
  if(el.value!==data.value){el.value=String(data.value);alterados.push(el);}
 }
 // Aplica todos os valores primeiro; só depois dispara os filtros vinculados.
 for(const el of alterados){
  if(typeof EventCtor!=='function')break;
  el.dispatchEvent(new EventCtor('input',{bubbles:true}));
  el.dispatchEvent(new EventCtor('change',{bubbles:true}));
 }
 const tabs=saved.abas||{};
 const escolher=(selector)=>{const el=root.querySelector(selector);if(el&&typeof el.click==='function')el.click();};
 if(tabs.viewTab)escolher('[data-view-tab="'+tabs.viewTab+'"]');
 if(tabs.viewMode)escolher('[data-view-mode="'+tabs.viewMode+'"]');
 if(tabs.lossTab)escolher('[data-loss-tab="'+tabs.lossTab+'"]');
 if(tabs['stock-expired']===true)escolher('#stock-expired');
 if(tabs['map-tab-compare']===true)escolher('#map-tab-compare');
 for(const target of ['#map-main-card','#map-compare-section','#ctrl-list','#tv-list','#gen-list','#transfer-list','#view-results']){
   const node=root.querySelector(target);
   if(node)node.dispatchEvent(new CustomEvent('rv:filtros-restaurados',{detail:{paginas:saved.paginas||{}},bubbles:false}));
 }
 if(root.querySelector('#product-go')&&saved.controls?.['product-search']?.value){escolher('#product-go');}
 return true;
}
export function iniciarPersistenciaFiltros(root, contexto){
 if(!root?.addEventListener)return ()=>{};
 const registrar=()=>{
  const {user,loja,route}=contexto();
  if(!user||!route)return;
  const dataRoute=root.dataset.filtrosRota;
  if(!dataRoute||dataRoute!==route||root.dataset.restaurandoFiltros==='1')return;
  capturarFiltros(root,{storage:globalThis.localStorage,key:chaveFiltros(user,loja,route)});
 };
 const clicar=()=>queueMicrotask(registrar);
 root.addEventListener('input',registrar);
 root.addEventListener('change',registrar);
 root.addEventListener('click',clicar);
 return registrar;
}
