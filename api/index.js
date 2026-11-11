import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { tratarNotificacoes } from './notificacoes.js';
import { elegivelTentativaVenda } from '../public/assets/tentativa.js';
import { chaveSecao, secaoPadraoIgnorada, secaoNaoVisivel, filtrarSecoes } from './secoes.js';

const urlBase = () => String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const secret = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const bad = (message, status=400) => Object.assign(new Error(message), { status });
const norm = value => String(value ?? '').trim();
export const normalizarNome = s => norm(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');
export const eanValido = ean => /^\d{8,14}$/.test(String(ean ?? ''));
export const dataValida = iso => { if(!/^\d{4}-\d\d-\d\d$/.test(String(iso)))return false; const dt = new Date(iso+'T00:00:00Z'); return !isNaN(dt) && dt.toISOString().slice(0,10)===iso; };
export function hashPin(pin,salt=randomBytes(24).toString('hex')) {
  if(!/^\d{6,12}$/.test(String(pin))) throw bad('O novo PIN deve ter 6 a 12 dígitos.');
  return `scrypt$${salt}$${scryptSync(String(pin), salt, 64).toString('hex')}`;
}
export function validarPin(pin,hash) {
  if (!hash || typeof hash!=='string') return false;
  const [kind,salt,hex] = hash.split('$');
  if(kind!=='scrypt' || !/^[a-f\d]{48}$/.test(salt||'') || !/^[a-f\d]{128}$/.test(hex||''))return false;
  const calculado=scryptSync(String(pin),salt,64); return timingSafeEqual(calculado,Buffer.from(hex,'hex'));
}
const sha=s=>createHash('sha256').update(s).digest('hex');
const encoder=v=>encodeURIComponent(v);
const cleanProduct=p=>({ean:norm(p.ean),codigo_interno:norm(p.codigo_interno)||null,descricao:norm(p.descricao),secao:norm(p.secao),...('grupo' in p?{grupo:norm(p.grupo)}:{}),atualizado_em:new Date().toISOString()});
const specials=['Estoque','Termolabil','Psicotropicos','Antibioticos'];
const getTipo=nome=>specials.includes(nome)?nome:'funcionario';
const json=(res,status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(data));};
function queryString(obj={}) {let p=new URLSearchParams(); for(const [k,v] of Object.entries(obj)) if(v!==undefined&&v!==null)p.set(k,String(v));return p.toString();}
async function db(table,{method='GET',params={},body,prefer,range}={}) {
  if(!urlBase() || !secret()) throw bad('Supabase não configurado no servidor.',503);
  const endpoint=`${urlBase()}/rest/v1/${table}${Object.keys(params).length?'?'+queryString(params):''}`;
  const headers={'apikey':secret(),'Content-Type':'application/json','Accept':'application/json'};
  if (secret().split('.').length===3) headers.Authorization=`Bearer ${secret()}`;
  if(prefer) headers.Prefer=prefer;
  if(range) headers.Range=range;
  const resp=await fetch(endpoint,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(26000)});
  const raw=await resp.text();let data;
  try {data=raw?JSON.parse(raw):null;}catch {data=raw;}
  if(!resp.ok) {const e=bad(data?.message||`Erro do banco (${resp.status})`, resp.status>=500?502:resp.status); if(process.env.NODE_ENV==='development')console.error('Supabase:',table,e.message);throw e;}
  return data;
}
async function rows(table,params={},size=1000,maxPages=25) {
  const out=[];
  for(let page=0;page<maxPages;page++){
    const chunk=await db(table,{params:{...params,limit:size,offset:page*size}});
    if(!Array.isArray(chunk))throw bad('Consulta inválida no banco.',502);
    out.push(...chunk);if(chunk.length<size)return out;
  }
  throw bad('Muitos registros para esta consulta. Utilize filtros.',413);
}
async function one(table,params={}) {const d=await db(table,{params:{...params,limit:1}});return d?.[0]||null;}
// Seções fixas ignoradas em toda a aplicação e seções excluídas pelo gestor da própria loja.
async function secoesExcluidas(loja){
 const removidas=new Set();
 if(loja){
  const configuradas=await rows('organizacao_secoes',{
   loja_id:`eq.${loja}`,excluida_das_listas:'eq.true',select:'secao_chave'
  },250,4);
  for(const row of configuradas)removidas.add(chaveSecao(row.secao_chave));
 }
 return removidas;
}
async function gruposExcluidos(loja){
 const excluidos=new Set();
 if(loja){
  const linhas=await rows('organizacao_grupos',{loja_id:`eq.${loja}`,excluida_das_listas:'eq.true',select:'grupo_chave'},250,5);
  for(const item of linhas)excluidos.add(chaveSecao(item.grupo_chave));
 }
 return excluidos;
}
async function exclusoesDaLoja(loja){
 const [secoes,grupos]=await Promise.all([secoesExcluidas(loja),gruposExcluidos(loja)]);
 return {secoes,grupos};
}
function produtoOculto(p,exclusoes){return secaoNaoVisivel(p?.secao,exclusoes.secoes)||exclusoes.grupos.has(chaveSecao(p?.grupo));}
async function verificarProdutoVisivel(ean,loja){
 const produto=await one('produtos',{ean:`eq.${ean}`,select:'secao,grupo'});
 if(produto&&produtoOculto(produto,await exclusoesDaLoja(loja)))
   throw bad('A seção ou grupo deste produto está excluído das operações desta loja.',409);
}
// Resolve EAN em registros legados sem relacionamento com produtos, antes de ocultá-los.
async function filtrarRegistrosSecao(registros,loja){
 if(!registros?.length)return [];
 const excluidas=await exclusoesDaLoja(loja);
 const desconhecidos=[...new Set(registros.filter(r=>!(r.secao||r.produtos?.secao||r.catalogo?.secao||r.grupo||r.produtos?.grupo||r.catalogo?.grupo)&&eanValido(r.ean)).map(r=>r.ean))];
 const mapa=new Map();
 for(let i=0;i<desconhecidos.length;i+=70){
  const achados=await rows('produtos',{ean:`in.(${desconhecidos.slice(i,i+70).join(',')})`,select:'ean,secao,grupo'},100,2);
  for(const p of achados)mapa.set(p.ean,p);
 }
 return registros.filter(r=>!produtoOculto({secao:r.secao||r.produtos?.secao||r.catalogo?.secao||mapa.get(r.ean)?.secao,grupo:r.grupo||r.produtos?.grupo||r.catalogo?.grupo||mapa.get(r.ean)?.grupo},excluidas));
}
const cleanUser=u=>({id:u.id,nome:u.nome,loja:u.loja_id,perfil:u.perfil,perfilBase:u.perfilBase||u.perfil,acessoGeral:u.titular_painel_geral===true&&(u.perfil==='geral'||u.acesso_geral===true),administrador:u.perfil!=='funcionario',administradorGeral:u.perfil==='geral',especial:u.especial,ativo:u.ativo,celularProprio:u.celular_proprio});
function requestBody(req){if(req.body&&typeof req.body==='object')return req.body;try{return JSON.parse(req.body||'{}');}catch{throw bad('Corpo JSON inválido.');}}
function actorLoja(actor,requested){
  if(actor.perfil==='geral'){
    if(!requested)throw bad('Informe uma loja para esta operação.');
    if(!/^\d{1,12}$/.test(String(requested)))throw bad('Loja inválida.');
    return String(requested);
  }
  return actor.loja_id;
}
function admin(actor){if(actor.perfil==='funcionario')throw bad('Acesso restrito ao administrador.',403);}
function geral(actor){if(actor.perfil!=='geral'||actor.titular_painel_geral!==true)throw bad('Painel Geral exclusivo da conta titular.',403);}
function podeMapa(actor,mapa){if(actor.perfil==='funcionario'&&normalizarNome(mapa)!==actor.nome_normalizado)throw bad('Você só pode acessar seu próprio mapa.',403);}
async function audit(actor,acao,dados={}) {try {await db('auditoria',{method:'POST',body:{loja_id:actor.loja_id,usuario_id:actor.id,acao,dados},prefer:'return=minimal'});}catch(e){console.error('Auditoria indisponível:',e.message);}}
async function authenticate(req){
  const bearer=String(req.headers.authorization||'').match(/^Bearer ([a-f\d]{64})$/i)?.[1];
  if(!bearer)throw bad('Sessão não encontrada. Faça login.',401);
  const sessao=await one('sessoes',{token_hash:`eq.${sha(bearer)}`,select:'*'});
  if(!sessao)throw bad('Sessão inválida. Faça login.',401);
  const hora=Date.now();if(Date.parse(sessao.expira_em)<hora || (!sessao.manter_conectado && hora-Date.parse(sessao.ultima_atividade)>30*60*1000)) {
    await db('sessoes',{method:'DELETE',params:{token_hash:`eq.${sessao.token_hash}`}});
    throw bad('Sessão expirada. Faça login novamente.',401);
  }
  const user=await one('usuarios',{id:`eq.${sessao.usuario_id}`,select:'*'});
  if(!user?.ativo||user.excluido_em)throw bad('Usuário inativo ou inexistente.',403);
  if(user.perfil==='geral'&&user.titular_painel_geral!==true)throw bad('Painel Geral exclusivo da conta titular.',403);
  if(hora-Date.parse(sessao.ultima_atividade)>60*1000) {
    // Falha transitória ao atualizar a atividade não invalida uma sessão lida
    // e conferida com sucesso. Evita erro de login após redirecionamento.
    try{await db('sessoes',{method:'PATCH',params:{token_hash:`eq.${sessao.token_hash}`},body:{ultima_atividade:new Date().toISOString()}});}
    catch(err){console.warn('Atualização de atividade não concluída:',err.name);}
  }
  // Perfil é resolvido NO SERVIDOR a cada chamada, nunca pelo campo perfil da requisição.
  // O acesso Geral temporário só vale para uma sessão autorizada com o PIN da própria conta.
  const geralAtivo=user.perfil==='admin' && user.titular_painel_geral===true && user.acesso_geral===true &&
    sessao.modo_acesso==='geral' && Date.parse(sessao.modo_expira_em)>hora;
  const actor={...user,perfilBase:user.perfil,perfil:geralAtivo?'geral':user.perfil};
  return {actor, sessao};
}
async function login(body) {
  const nome=normalizarNome(body.nome), pin=String(body.pin??'');
  if(nome.length<2||nome.length>120||!/^\d{4,12}$/.test(pin))throw bad('Credenciais inválidas.',401);
  let candidatos=await rows('usuarios',{nome_normalizado:`eq.${nome}`,ativo:'eq.true',select:'*'},100);
  if(body.loja) {const sameStore=candidatos.filter(u=>u.loja_id===String(body.loja));candidatos=sameStore.length?sameStore:candidatos.filter(u=>u.perfil==='geral'&&u.loja_id===null);}
  if(candidatos.length>1)throw bad('Há nomes iguais em mais de uma loja. Informe o número da loja.',409);
  const user=candidatos[0];
  if(!user||user.excluido_em||(user.perfil==='geral'&&user.titular_painel_geral!==true))throw bad('Credenciais inválidas.',401);
  if(user.bloqueado_ate&&Date.parse(user.bloqueado_ate)>Date.now())throw bad('Login temporariamente bloqueado. Aguarde 15 minutos.',429);
  if(!validarPin(pin,user.pin_hash)){
    const tentativas=(user.tentativas||0)+1;
    await db('usuarios',{method:'PATCH',params:{id:`eq.${user.id}`},body:{tentativas:tentativas>=5?0:tentativas,bloqueado_ate:tentativas>=5?new Date(Date.now()+15*60000).toISOString():null}});
    throw bad('Credenciais inválidas.',401);
  }
  const manter=body.manterConectado===true;
  const token=randomBytes(32).toString('hex');
  await db('usuarios',{method:'PATCH',params:{id:`eq.${user.id}`},body:{tentativas:0,bloqueado_ate:null}});
  await db('sessoes',{method:'POST',body:{token_hash:sha(token),usuario_id:user.id,expira_em:new Date(Date.now()+(manter?30*24:8)*3600000).toISOString(),manter_conectado:manter},prefer:'return=minimal'});
  return {sucesso:true,token,usuario:cleanUser(user)};
}
// Alternar perfis na mesma conta: confirma o PIN atual para elevar uma sessão a Geral.
// O navegador jamais determina qual ID ou loja ganha permissão.
async function alternarModo(actor,sessao,body){
  if(actor.perfilBase!=='admin'||actor.acesso_geral!==true||actor.titular_painel_geral!==true)
    throw bad('Esta conta não possui acesso duplo habilitado.',403);
  const modo=norm(body.modo);
  if(!['admin','geral'].includes(modo))throw bad('Modo de acesso inválido.',422);
  if(modo==='geral'){
    if(actor.bloqueado_ate && Date.parse(actor.bloqueado_ate)>Date.now())
      throw bad('PIN temporariamente bloqueado. Tente novamente mais tarde.',429);
    const pin=String(body.pin??'');
    if(!/^\d{6,12}$/.test(pin)||!validarPin(pin,actor.pin_hash)){
      const tentativas=(Number(actor.tentativas)||0)+1;
      await db('usuarios',{method:'PATCH',params:{id:`eq.${actor.id}`},body:{
        tentativas:tentativas>=5?0:tentativas,
        bloqueado_ate:tentativas>=5?new Date(Date.now()+15*60000).toISOString():null
      }});
      throw bad(tentativas>=5?'Muitas tentativas. Aguarde 15 minutos.':'PIN incorreto.',tentativas>=5?429:401);
    }
    // Elevação limitada a 30 minutos; ao expirar, a sessão retorna a Administrador.
    await db('sessoes',{method:'PATCH',params:{token_hash:`eq.${sessao.token_hash}`,usuario_id:`eq.${actor.id}`},body:{
      modo_acesso:'geral',modo_expira_em:new Date(Date.now()+30*60*1000).toISOString()
    }});
    await db('usuarios',{method:'PATCH',params:{id:`eq.${actor.id}`},body:{tentativas:0,bloqueado_ate:null}});
    await audit(actor,'alternar_perfil',{de:'admin',para:'geral'});
    return {sucesso:true,usuario:cleanUser({...actor,perfil:'geral'})};
  }
  await db('sessoes',{method:'PATCH',params:{token_hash:`eq.${sessao.token_hash}`,usuario_id:`eq.${actor.id}`},body:{modo_acesso:'admin',modo_expira_em:null}});
  await audit(actor,'alternar_perfil',{de:'geral',para:'admin'});
  return {sucesso:true,usuario:cleanUser({...actor,perfil:'admin'})};
}
// Troca de PIN do próprio Administrador Geral. Nunca aceita ID fornecido pelo navegador.
async function alterarMeuPinGeral(actor,sessao,body){
  geral(actor);
  const atual=String(body.pinAtual??''),novo=String(body.pinNovo??''),confirmacao=String(body.confirmacao??'');
  if(!/^\d{6,12}$/.test(novo))throw bad('O novo PIN deve conter de 6 a 12 dígitos.',422);
  if(novo!==confirmacao)throw bad('A confirmação não corresponde ao novo PIN.',422);
  if(novo===atual)throw bad('Escolha um PIN diferente do atual.',422);
  if(actor.bloqueado_ate&&Date.parse(actor.bloqueado_ate)>Date.now())throw bad('Aguarde o fim do bloqueio temporário antes de alterar o PIN.',429);
  if(!validarPin(atual,actor.pin_hash)){
    const n=(Number(actor.tentativas)||0)+1;
    await db('usuarios',{method:'PATCH',params:{id:`eq.${actor.id}`},body:{tentativas:n>=5?0:n,bloqueado_ate:n>=5?new Date(Date.now()+15*60000).toISOString():null}});
    throw bad(n>=5?'Muitas tentativas incorretas. Aguarde 15 minutos.':'PIN atual incorreto.',n>=5?429:422);
  }
  // RPC transacional: altera apenas a própria conta e invalida outras sessões.
  const ok=await db('rpc/alterar_pin_geral',{method:'POST',body:{p_usuario:actor.id,p_sessao_hash:sessao.token_hash,p_pin_hash:hashPin(novo)}});
  if(ok!==true)throw bad('Não foi possível alterar seu PIN. Atualize a página e tente novamente.',409);
  await audit(actor,'alterar_proprio_pin',{outras_sessoes_encerradas:true});
  return {sucesso:true,mensagem:'Seu PIN foi atualizado e as demais sessões foram encerradas.'};
}
async function produtos(req,actor,pathname,body,query){
 if(req.method==='GET'&&pathname==='/produtos/secoes'){
   const sec=await db('rpc/listar_secoes_catalogo',{method:'POST',body:{}});
   const {secoes}=await exclusoesDaLoja(actor.loja_id);
   return {sucesso:true,secoes:(sec||[]).filter(x=>!secaoNaoVisivel(x,secoes))};
 }
 if(req.method==='GET'){
   const filtro=norm(query.get('q'));if(filtro.length>100)throw bad('Pesquisa muito longa.');
   let params={select:'id,ean,codigo_interno,descricao,secao,grupo',order:'descricao.asc'};
   if(filtro)params.or=`(ean.eq.${filtro.replace(/[^\d]/g,'')||'000'},codigo_interno.eq.${filtro.replace(/[^\d]/g,'')||'000'},descricao.ilike.*${filtro.replace(/[%,()]/g,'')}*,grupo.ilike.*${filtro.replace(/[%,()]/g,'')}*)`;
   const exclusoes=await exclusoesDaLoja(actor.loja_id);
   const limite=Math.max(1,Math.min(Number(query.get('limite'))||80,200));
   const encontrados=[];
   for(let pagina=0;pagina<20&&encontrados.length<limite;pagina++){
     const lote=await db('produtos',{params:{...params,limit:250,offset:pagina*250}});
     if(!Array.isArray(lote))throw bad('Resposta inválida do catálogo.',502);
     encontrados.push(...lote.filter(p=>!produtoOculto(p,exclusoes)));
     if(lote.length<250)break;
   }
   return {sucesso:true,produtos:encontrados.slice(0,limite)};
 }
 admin(actor);
 if(pathname==='/produtos/importar'){
   if(!Array.isArray(body.produtos)||body.produtos.length>500)throw bad('Envie um lote de até 500 produtos.');
   const lista=body.produtos.map(cleanProduct);
   if(lista.some(x=>!eanValido(x.ean)))throw bad('Há EANs inválidos no lote.');
   await db('produtos',{method:'POST',body:lista,params:{on_conflict:'ean'},prefer:'resolution=merge-duplicates,return=minimal'});
   await audit(actor,'importar_produtos',{quantidade:lista.length});return {sucesso:true,importados:lista.length};
 }
 const p=cleanProduct(body);
 if(!eanValido(p.ean)||!p.descricao||p.descricao.length>350||p.secao.length>120||(p.grupo&&p.grupo.length>120))throw bad('Confira EAN, descrição, seção e Grupo.',422);
 if(req.method==='POST'&&pathname==='/produtos'){
   if(await one('produtos',{ean:`eq.${p.ean}`,select:'id'}))throw bad('EAN já cadastrado. Use Editar produto.',409);
   const item=await db('produtos',{method:'POST',body:p,prefer:'return=representation'});
   await audit(actor,'cadastrar_produto',{id:item[0]?.id,ean:p.ean});return {sucesso:true,produto:item[0]};
 }
 if(req.method==='PATCH'&&pathname==='/produtos'){
   const id=norm(body.id);if(!/^[a-f\d-]{36}$/i.test(id))throw bad('Identificador inválido.',422);
   const anterior=await one('produtos',{id:`eq.${id}`,select:'id,ean,codigo_interno,descricao,secao,grupo'});
   if(!anterior)throw bad('Produto não encontrado.',404);
   const similar=await one('produtos',{ean:`eq.${p.ean}`,select:'id'});
   if(similar&&similar.id!==id)throw bad('Esse EAN pertence a outro produto.',409);
   const patch={ean:p.ean,codigo_interno:p.codigo_interno,descricao:p.descricao,secao:p.secao,atualizado_em:p.atualizado_em};
   // Grupo só é alterado em edição manual explícita ou pela atualização segura do ODS.
   if('grupo' in p)patch.grupo=p.grupo;
   await db('produtos',{method:'PATCH',params:{id:`eq.${id}`},body:patch,prefer:'return=minimal'});
   await audit(actor,'editar_produto',{id,ean_anterior:anterior.ean,ean_novo:p.ean});return {sucesso:true,produto:{...anterior,...patch}};
 }
 throw bad('Método não permitido.',405);
}
async function mapas(req,actor,pathname,body,query){
  const loja=actorLoja(actor,body.loja||query.get('loja'));
  if(req.method==='GET'){
    const nome=norm(query.get('mapa'));
    if(nome)podeMapa(actor,nome);
    const params={loja_id:`eq.${loja}`,excluido_em:'is.null',select:'*,produtos(codigo_interno,descricao,secao,grupo)',order:'validade.asc'};
    if(actor.perfil==='funcionario')params.mapa_nome=`eq.${actor.nome}`;
    else if(nome)params.mapa_nome=`eq.${nome}`;
    const registros=await filtrarRegistrosSecao(await rows('mapa_lancamentos',params,800,20),loja);
    return {sucesso:true,registros:registros.map(r=>({...r,codigoInterno:r.produtos?.codigo_interno||'',descricao:r.produtos?.descricao||'',secao:r.produtos?.secao||'',grupo:r.produtos?.grupo||''}))};
  }
  if(pathname==='/mapas/retirar-loja'){
    if(req.method!=='POST')throw bad('Método não permitido.',405);
    if(actor.perfil!=='admin')throw bad('Somente o Administrador de Loja pode retirar registros.',403);
    const id=norm(body.id),item=await one('mapa_lancamentos',{id:`eq.${id}`,loja_id:`eq.${loja}`,excluido_em:'is.null'});
    if(!item)throw bad('Registro não encontrado ou já retirado.',404);
    const hoje=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'America/Sao_Paulo'}).format(new Date());
    // A regra corresponde à Tentativa de Venda do painel legado (meses de calendário).
    if(!elegivelTentativaVenda(item.validade,hoje)||Number(item.quantidade)<=0)throw bad('Este registro não está elegível a Tentativa de Venda.',409);
    await db('mapa_lancamentos',{method:'PATCH',params:{id:`eq.${id}`,loja_id:`eq.${loja}`,excluido_em:'is.null'},body:{excluido_em:new Date().toISOString(),excluido_por:actor.id,retirada_loja_em:new Date().toISOString(),retirada_loja_por:actor.id},prefer:'return=minimal'});
    await audit(actor,'retirar_da_loja_tentativa_venda',{id,ean:item.ean,lote:item.lote,validade:item.validade,quantidade:item.quantidade,mapa:item.mapa_nome});
    return {sucesso:true};
  }
  if(pathname.endsWith('/descer')){
    admin(actor);const destino=norm(body.destino);if(!destino||destino==='Estoque')throw bad('Destino inválido.');
    const origem=await one('mapa_lancamentos',{id:`eq.${body.id}`,loja_id:`eq.${loja}`,tipo_mapa:'eq.Estoque',excluido_em:'is.null'});
    if(!origem)throw bad('Registro não localizado no Estoque.',404);
    // Somente mapa do funcionário da loja ou uma categoria especial é permitido.
    if(!specials.includes(destino)){
      const pessoa=await one('usuarios',{loja_id:`eq.${loja}`,nome_normalizado:`eq.${normalizarNome(destino)}`,ativo:'eq.true'});
      if(!pessoa||pessoa.perfil==='geral')throw bad('Funcionário de destino inválido.',403);
    }
    const resultado=await db('rpc/descer_estoque',{method:'POST',body:{p_request_id:norm(body.requestId),p_origem_id:origem.id,p_destino:destino,p_quantidade:Number(body.quantidade),p_usuario_id:actor.id,p_loja_id:loja}});
    await audit(actor,'descer_estoque',{origem:origem.id,destino,quantidade:body.quantidade});return resultado;
  }
  if(req.method==='POST'){
    const mapa=actor.perfil==='funcionario'?actor.nome:norm(body.mapa||actor.nome);
    podeMapa(actor,mapa);
    const tipo=getTipo(mapa),ean=norm(body.ean),lote=norm(body.lote).toUpperCase(),validade=norm(body.validade),quantidade=Number(body.quantidade);
    if(!eanValido(ean)||!dataValida(validade)||lote.length<1||lote.length>100||!Number.isInteger(quantidade)||quantidade<1||quantidade>999999)throw bad('EAN, lote, validade ou quantidade inválidos.');
    await verificarProdutoVisivel(ean,loja);
    if(tipo==='Estoque'&&new Date(validade)<new Date(new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}))){} // Não alterar regra de validade dos mapas especiais.
    if(tipo!=='funcionario')admin(actor);
    if(actor.perfil==='admin' && tipo==='funcionario')throw bad('Administradores só podem lançar nas abas especiais. O mapa de funcionário pertence ao próprio login.',403);
    if(actor.perfil==='geral')throw bad('Administrador Geral não realiza lançamentos no Painel Conferente.',403);
    const registro=await db('rpc/gravar_lancamento',{method:'POST',body:{p_request_id:norm(body.requestId),p_usuario_id:actor.id,p_loja_id:loja,p_mapa_nome:mapa,p_tipo_mapa:tipo,p_ean:ean,p_lote:lote,p_validade:validade,p_quantidade:quantidade,p_confirmar_duplicado:body.confirmarDuplicado===true}});
    if(registro.status==='saved'){
      await audit(actor,'lancamento',{id:registro.id,mapa,ean});
      // A trigger SQL 016 abre a pendência atomicamente com o lançamento.
      // Consulta após o RPC para avisar o operador sem exigir outra ação.
      const pendencia=await one('lancamento_pendencias',{lancamento_id:`eq.${registro.id}`,status:'eq.pendente',select:'id'});
      registro.pendenciaEan=!!pendencia;
    }
    return {sucesso:registro.status==='saved',...registro};
  }
  const id=norm(body.id);if(!/^[a-f0-9-]{36}$/.test(id))throw bad('Identificador inválido.');
  const existente=await one('mapa_lancamentos',{id:`eq.${id}`,loja_id:`eq.${loja}`,excluido_em:'is.null'});if(!existente)throw bad('Registro não encontrado.',404);
  if(actor.perfil==='funcionario'){
    // Um funcionário só edita/exclui o seu próprio mapa da loja. Confia na sessão,
    // nunca em mapa, nome, loja ou funcionário informados pelo navegador.
    if(existente.tipo_mapa!=='funcionario'||normalizarNome(existente.mapa_nome)!==(actor.nome_normalizado||normalizarNome(actor.nome))||
       (existente.funcionario_id&&existente.funcionario_id!==actor.id))
      throw bad('Você só pode alterar lançamentos vinculados ao seu login.',403);
  }else if(actor.perfil!=='admin')throw bad('Essa operação pertence ao Painel Conferente.',403);
  if(req.method==='PATCH'){
    const patch={};
    if(body.ean!==undefined){if(!eanValido(norm(body.ean)))throw bad('EAN deve ter de 8 a 14 dígitos.');await verificarProdutoVisivel(norm(body.ean),loja);patch.ean=norm(body.ean);const produto=await one('produtos',{ean:`eq.${patch.ean}`,select:'id'});patch.produto_id=produto?.id||null;}
    if(body.quantidade!==undefined){if(!Number.isInteger(Number(body.quantidade))||Number(body.quantidade)<0||Number(body.quantidade)>999999)throw bad('Quantidade inválida.');patch.quantidade=Number(body.quantidade);}
    if(body.lote!==undefined){if(!norm(body.lote)||norm(body.lote).length>100)throw bad('Lote obrigatório, com no máximo 100 caracteres.');patch.lote=norm(body.lote).toUpperCase();}
    if(body.validade!==undefined){if(!dataValida(body.validade))throw bad('Data inválida.');patch.validade=body.validade;}
    if(!Object.keys(patch).length)throw bad('Nenhum campo válido.');
    await db('mapa_lancamentos',{method:'PATCH',params:{id:`eq.${id}`,loja_id:`eq.${loja}`},body:{...patch,atualizado_em:new Date().toISOString()}});
    await audit(actor,'editar_mapa',{id,mapa:existente.mapa_nome,antes:{ean:existente.ean,lote:existente.lote,validade:existente.validade,quantidade:existente.quantidade},alterado:patch});return {sucesso:true};
  }
  if(req.method==='DELETE'){
    await db('mapa_lancamentos',{method:'PATCH',params:{id:`eq.${id}`,loja_id:`eq.${loja}`,excluido_em:'is.null'},body:{excluido_em:new Date().toISOString(),excluido_por:actor.id}});
    await audit(actor,'excluir_mapa',{id,modo:'exclusao_logica',anterior:{ean:existente.ean,lote:existente.lote,validade:existente.validade,quantidade:existente.quantidade}});return {sucesso:true};
  }
  throw bad('Método não permitido.',405);
}
// Visualização independente: leitura de histórico, retiradas e sinalizações.
// Tudo filtrado no servidor, inclusive para usuários que tentem manipular a URL.
async function visualizacao(req,actor,pathname,body,query){
 const loja=actorLoja(actor,query.get('loja'));
 if(actor.perfil==='geral')throw bad('O Administrador Geral utiliza o Painel Geral.',403);
 const employee=actor.perfil==='funcionario';
 // Mesmo fluxo de visualização; o funcionário vê somente o próprio mapa,
 // enquanto o admin de loja vê somente Estoque, Termolabil, Psicotropicos e Antibioticos.
 const allowed=x=>x&&x.loja_id===loja&&(employee?
   (x.tipo_mapa==='funcionario'&&normalizarNome(x.mapa_nome)===(actor.nome_normalizado||normalizarNome(actor.nome))&&
    (!x.funcionario_id||x.funcionario_id===actor.id)):
   specials.includes(x.tipo_mapa)&&x.mapa_nome===x.tipo_mapa);
 const allowedRows=async()=>rows('mapa_lancamentos',employee?{
   loja_id:`eq.${loja}`,mapa_nome:`eq.${actor.nome}`,tipo_mapa:'eq.funcionario',
   select:'id,loja_id,tipo_mapa,mapa_nome,funcionario_id,ean,produtos(secao,grupo)'
  }:{
   loja_id:`eq.${loja}`,tipo_mapa:`in.(${specials.join(',')})`,
   select:'id,loja_id,tipo_mapa,mapa_nome,funcionario_id,ean,produtos(secao,grupo)'
  },500,20);
 const getRecord=async id=>{
   if(!/^[0-9a-f-]{36}$/i.test(norm(id)))throw bad('Registro inválido.',422);
   const r=await one('mapa_lancamentos',{id:`eq.${id}`,loja_id:`eq.${loja}`});
   if(!r)throw bad('Registro não encontrado.',404);
   if(!allowed(r))throw bad(employee?'Este registro não pertence ao seu mapa.':'A Visualização do administrador permite somente as abas especiais.',403);
   const permitted=await filtrarRegistrosSecao([r],loja);
   if(!permitted.length)throw bad('Seção excluída das listagens operacionais.',404);
   return r;
 };
 if(pathname==='/visualizacao/mapas'&&req.method==='GET'){
   const mapa=norm(query.get('mapa'));
   if(mapa&&(employee?normalizarNome(mapa)!==(actor.nome_normalizado||normalizarNome(actor.nome)):!specials.includes(mapa)))
     throw bad('Mapa não autorizado para esta conta.',403);
   const params={loja_id:`eq.${loja}`,excluido_em:'is.null',select:'*,produtos(codigo_interno,descricao,secao,grupo)',order:'validade.asc'};
   if(employee){params.tipo_mapa='eq.funcionario';params.mapa_nome=`eq.${actor.nome}`;}
   else{params.tipo_mapa=`in.(${specials.join(',')})`;if(mapa)params.mapa_nome=`eq.${mapa}`;}
   const lista=(await filtrarRegistrosSecao(await rows('mapa_lancamentos',params,800,20),loja)).filter(allowed);
   return {sucesso:true,registros:lista.map(r=>({...r,codigoInterno:r.produtos?.codigo_interno||'',descricao:r.produtos?.descricao||'',secao:r.produtos?.secao||'',grupo:r.produtos?.grupo||''})),
     abasPermitidas:employee?[actor.nome]:specials};
 }
 if(pathname==='/visualizacao/vencidos'&&req.method==='GET'){
   // Retiradas legadas podem não ter lancamento_id: mapa_origem pode identificá-las.
   // O resultado é filtrado antes de qualquer resposta ao navegador.
   const [regs,owners]=await Promise.all([
     rows('vencidos',{loja_id:`eq.${loja}`,excluido_em:'is.null',select:'*',order:'criado_em.desc'},500,20),
     allowedRows()
   ]);
   const ids=new Set((await filtrarRegistrosSecao(owners.filter(allowed),loja)).map(x=>x.id));
   // Registros antigos podem não possuir ID original. Nesse caso, validar a origem nominal.
   const permitted=regs.filter(x=>ids.has(x.lancamento_id)||(!x.lancamento_id&&
     (employee?normalizarNome(x.mapa_origem)===(actor.nome_normalizado||normalizarNome(actor.nome)):
       specials.includes(x.mapa_origem))));
   return {sucesso:true,registros:await filtrarRegistrosSecao(await enriquecerRegistros(permitted,'vencidos'),loja)};
 }
 if(pathname==='/visualizacao/sinalizacoes'&&req.method==='GET'){
   const [regs,owners]=await Promise.all([
     rows('sinalizacoes',{loja_id:`eq.${loja}`,select:'id,lancamento_id,ean,observacao,situacao,criado_em,atualizado_por',order:'criado_em.desc'},500,20),
     allowedRows()
   ]);
   const ids=new Set((await filtrarRegistrosSecao(owners.filter(allowed),loja)).map(x=>x.id));
   return {sucesso:true,registros:regs.filter(x=>ids.has(x.lancamento_id))};
 }
 if(pathname==='/visualizacao/queima'&&req.method==='GET'){
   const item=await getRecord(query.get('id'));
   const lista=await rows('queima',{loja_id:`eq.${loja}`,lancamento_id:`eq.${item.id}`,
      select:'id,criado_em,atualizado_em,ean,lote,validade,quantidade,motivo,estado,origem_mapa',order:'criado_em.desc'},100,5);
   return {sucesso:true,registros:lista};
 }
 if(pathname==='/visualizacao/sinalizar'&&req.method==='POST'){
   const item=await getRecord(body.id);
   if(item.excluido_em)throw bad('O lançamento foi retirado do mapa.',409);
   const motivo=norm(body.motivo);
   if(!['Não Entrou na Queima','Muita Quantidade','Outras'].includes(motivo))throw bad('Escolha um motivo válido.',422);
   const obs=norm(body.observacao);
   if(motivo==='Outras'&&(!obs||obs.length>500))throw bad('Descreva o motivo (até 500 caracteres).',422);
   const texto=motivo==='Outras'?`Outras: ${obs}`:motivo;
   const created=await db('sinalizacoes',{method:'POST',body:{
      loja_id:loja,lancamento_id:item.id,ean:item.ean,observacao:texto,
      atualizado_por:actor.id,situacao:'aberto'
   },prefer:'return=representation'});
   await audit(actor,'sinalizar_lancamento',{id:item.id,sinalizacao_id:created[0]?.id,motivo:texto});
   return {sucesso:true};
 }
 if(pathname==='/visualizacao/retirar'&&req.method==='POST'){
   const item=await getRecord(body.id);
   if(item.excluido_em)throw bad('O registro já foi excluído.',409);
   const resultado=await db('rpc/retirar_vencido_visualizacao',{method:'POST',body:{p_loja:loja,p_usuario:actor.id,p_lancamento:item.id}});
   await audit(actor,'encaminhar_vencidos_visualizacao',{id:item.id,quantidade:item.quantidade});
   return {sucesso:true,resultado};
 }
 throw bad('Rota de visualização inválida.',404);
}
async function stock(req,actor,pathname,body,query){
  const loja=actorLoja(actor,body.loja||query.get('loja'));
  if(req.method==='GET'){
    const r=await rows('estoque_saldos',{loja_id:`eq.${loja}`,select:'quantidade,atualizado_em,produtos(ean,codigo_interno,descricao,secao,grupo)',order:'atualizado_em.desc'},800,20);
    return {sucesso:true,registros:await filtrarRegistrosSecao(r.map(x=>({...x,...x.produtos,produtos:undefined})),loja)};
  }
  admin(actor);
  if(!Array.isArray(body.itens)||body.itens.length>300)throw bad('Envie até 300 linhas por lote.');
  const codigos=[...new Set(body.itens.map(x=>norm(x.codigo_interno)).filter(x=>/^\d{1,40}$/.test(x)))];
  const catalogo=new Map();
  for(let i=0;i<codigos.length;i+=65){
    const encontrados=await rows('produtos',{codigo_interno:`in.(${codigos.slice(i,i+65).join(',')})`,select:'ean,codigo_interno,descricao,secao,grupo'},250,6);
    for(const p of encontrados){
      const codigo=norm(p.codigo_interno);
      if(!catalogo.has(codigo))catalogo.set(codigo,p);
      else if(catalogo.get(codigo)?.ean!==p.ean)catalogo.set(codigo,null);
    }
  }
  const validos=new Map(),ignorados=[];let recuperados=0,duplicados=0;
  for(const [i,x] of body.itens.entries()){
    let ean=norm(x.ean),codigo=norm(x.codigo_interno),qtd=Number(x.quantidade);
    const existente=catalogo.get(codigo);
    // Não inventa EAN, só recupera o valor exato de uma correspondência única do cadastro.
    if(existente&&(!eanValido(ean)|| (ean!==existente.ean&&existente.ean.endsWith(ean)&&/^0+$/.test(existente.ean.slice(0,-ean.length))))) {
      ean=existente.ean;recuperados++;
    }
    if(existente&&eanValido(ean)&&ean!==existente.ean){
      if(ignorados.length<30)ignorados.push({linha:i+1,ean,codigo_interno:codigo,motivo:'EAN não coincide com Código Interno'});
      continue;
    }
    if(!eanValido(ean)||!Number.isFinite(qtd)||qtd<0){
      if(ignorados.length<30)ignorados.push({linha:i+1,ean:norm(x.ean),codigo_interno:codigo,motivo:'EAN não localizado ou saldo inválido'});
      continue;
    }
    if(secaoPadraoIgnorada(x.secao))continue;
    const item={ean,codigo_interno:codigo||null,descricao:norm(x.descricao),secao:norm(x.secao),quantidade:qtd};
    if(validos.has(ean))duplicados++;
    validos.set(ean,item);
  }
  const itens=[...validos.values()];
  if(!itens.length)return {sucesso:true,importados:0,recuperados,duplicados,ignorados,ignoradosTotal:body.itens.length};
  // Preserva o Grupo existente: estoque não deve reconfigurar responsáveis.
  const produtos=itens.map(x=>({ean:x.ean,codigo_interno:x.codigo_interno,descricao:x.descricao,secao:x.secao,atualizado_em:new Date().toISOString()}));
  await db('produtos',{method:'POST',params:{on_conflict:'ean'},body:produtos,prefer:'resolution=merge-duplicates,return=minimal'});
  const existentes=await rows('produtos',{ean:`in.(${itens.map(p=>'"'+p.ean+'"').join(',')})`,select:'id,ean'},500,2);
  const ids=new Map(existentes.map(p=>[p.ean,p.id]));
  const saldos=itens.filter(x=>ids.has(x.ean)).map(x=>({loja_id:loja,produto_id:ids.get(x.ean),quantidade:x.quantidade,origem:'procfit',atualizado_em:new Date().toISOString()}));
  await db('estoque_saldos',{method:'POST',params:{on_conflict:'loja_id,produto_id'},body:saldos,prefer:'resolution=merge-duplicates,return=minimal'});
  await audit(actor,'importar_estoque',{quantidade:saldos.length,recuperados,duplicados,ignorados:body.itens.length-saldos.length});
  return {sucesso:true,importados:saldos.length,recuperados,duplicados,ignorados,ignoradosTotal:body.itens.length-saldos.length};
}
async function staff(req,actor,body,query){
  admin(actor);const loja=actor.perfil==='geral'?norm(body.loja||query.get('loja')):actor.loja_id;
  if(req.method==='GET'){
    const params={select:'id,nome,loja_id,perfil,especial,ativo,celular_proprio',excluido_em:'is.null',order:'nome.asc'};
    if(actor.perfil!=='geral'||loja)params.loja_id=`eq.${loja}`;
    return {sucesso:true,usuarios:await rows('usuarios',params,200)};
  }
  const nome=norm(body.nome);
  if(req.method==='POST'){
    if(nome.length<2||nome.length>120)throw bad('Nome inválido.');
    if(specials.some(x=>normalizarNome(x)===normalizarNome(nome))||normalizarNome(nome)==='sem responsavel')throw bad('Nome reservado para mapa especial ou pendências.');
    const perfil=body.perfil||'funcionario';
    if(!['funcionario','admin'].includes(perfil))throw bad('O perfil Geral é exclusivo e não pode ser criado por este painel.',403);
    if(actor.perfil==='admin'&&perfil!=='funcionario')throw bad('Somente o Geral pode criar administradores.',403);
    if(perfil==='admin')geral(actor);
    if(!loja)throw bad('Loja obrigatória.');
    const data={nome,nome_normalizado:normalizarNome(nome),loja_id:loja,perfil,ativo:true,especial:body.especial===true,pin_hash:hashPin(body.pin)};
    const u=await db('usuarios',{method:'POST',body:data,prefer:'return=representation'});
    await audit(actor,'cadastrar_usuario',{id:u[0].id,nome});return {sucesso:true,usuario:cleanUser(u[0])};
  }
  const id=norm(body.id);if(!/^[a-f0-9-]{36}$/i.test(id))throw bad('Identificador inválido.',422);const user=await one('usuarios',{id:`eq.${id}`});if(!user)throw bad('Usuário não encontrado.',404);
  if(user.excluido_em)throw bad('Conta excluída. O histórico foi preservado.',410);
  if(actor.perfil!=='geral'&&(user.loja_id!==actor.loja_id||user.perfil!=='funcionario'))throw bad('Somente o Administrador Geral gerencia contas administrativas.',403);
  if(req.method==='PATCH'){
    const patch={};
    if(body.ativo!==undefined)patch.ativo=!!body.ativo;
    if(body.especial!==undefined)patch.especial=!!body.especial;
    if(body.celular_proprio!==undefined)patch.celular_proprio=!!body.celular_proprio;
    if(body.pin!==undefined){patch.pin_hash=hashPin(body.pin);patch.tentativas=0;patch.bloqueado_ate=null;}
    if(body.nome!==undefined){
      if(user.perfil!=='funcionario'||actor.perfil!=='admin')throw bad('A renomeação de funcionários deve ser realizada pela loja.',403);
      if(Object.keys(body).some(k=>!['id','nome'].includes(k)))throw bad('Altere o nome separadamente dos demais campos.',422);
      const novo=norm(body.nome),normalizado=normalizarNome(novo);
      if(novo.length<2||novo.length>120||specials.some(x=>normalizarNome(x)===normalizado)||normalizado==='sem responsavel')throw bad('Nome inválido ou reservado.',422);
      const resultado=await db('rpc/renomear_funcionario_v12',{method:'POST',body:{p_administrador:actor.id,p_loja:actor.loja_id,p_funcionario:user.id,p_nome:novo,p_nome_normalizado:normalizado}});
      return resultado;
    }
    if(body.perfil!==undefined){if(!['funcionario','admin'].includes(body.perfil))throw bad('O perfil Geral é exclusivo e não pode ser atribuído por este painel.',403);if(actor.perfil!=='geral'&&body.perfil!=='funcionario')throw bad('Somente o Administrador Geral define administradores.',403);if(body.perfil!==user.perfil&&actor.perfil!=='geral')throw bad('Alteração de perfil restrita ao Administrador Geral.',403);patch.perfil=body.perfil;}
    if(!Object.keys(patch).length)throw bad('Nenhuma alteração.');
    await db('usuarios',{method:'PATCH',params:{id:`eq.${id}`},body:patch});
    if(body.ativo===false||body.pin!==undefined)await db('sessoes',{method:'DELETE',params:{usuario_id:`eq.${id}`}});
    await audit(actor,body.pin!==undefined?'redefinir_pin':'editar_usuario',{id,campos:Object.keys(patch).filter(x=>x!=='pin_hash')});return {sucesso:true};
  }
  if(req.method==='DELETE'){
    if(actor.perfil!=='admin'||user.perfil!=='funcionario'||user.excluido_em)throw bad('Só funcionários da própria loja podem ser excluídos.',403);
    const modo=norm(body.modo),destino=norm(body.destino_id);
    if(!['transferir','flutuar'].includes(modo))throw bad('Escolha como distribuir os lançamentos.',422);
    if(modo==='transferir'&&!/^[a-f0-9-]{36}$/i.test(destino))throw bad('Selecione um funcionário de destino.',422);
    if(modo==='flutuar'&&destino)throw bad('A opção sem responsável não permite destinatário.',422);
    return db('rpc/excluir_funcionario_v12',{method:'POST',body:{p_administrador:actor.id,p_loja:actor.loja_id,p_funcionario:user.id,p_destino:modo==='transferir'?destino:null,p_modo:modo}});
  }
  throw bad('Método não permitido.',405);
}
function validarMesTitularidade(mes){const valor=norm(mes);if(!valor)return null;if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(valor))throw bad('Mês inválido: informe AAAA-MM ou deixe em branco para todos os meses.',422);return valor+'-01';}
async function listarLancamentosTitularidade(actor,query){
  if(actor.perfil!=='admin')throw bad('Somente o administrador da loja pode transferir lançamentos.',403);
  const origem=norm(query.get('origem')),mes=validarMesTitularidade(query.get('mes'));
  if(!origem)throw bad('Escolha um funcionário ou itens sem responsável.',422);
  const base={loja_id:`eq.${actor.loja_id}`,tipo_mapa:'eq.funcionario',excluido_em:'is.null',...(mes?{mes_lancamento:`eq.${mes}`} : {}),select:'id,funcionario_id,mapa_nome,ean,lote,validade,quantidade,mes_lancamento,produtos(descricao,secao,grupo)',order:'validade.asc'};
  let lista=[];
  if(origem==='flutuando')lista=await rows('mapa_lancamentos',{...base,funcionario_id:'is.null',mapa_nome:'eq.Sem responsável'},500,10);
  else {
    if(!/^[a-f0-9-]{36}$/i.test(origem))throw bad('Funcionário de origem inválido.',422);
    const u=await one('usuarios',{id:`eq.${origem}`,loja_id:`eq.${actor.loja_id}`,perfil:'eq.funcionario',excluido_em:'is.null'});
    if(!u)throw bad('Funcionário de origem não encontrado nesta loja.',404);
    const [ativos,legados]=await Promise.all([
      rows('mapa_lancamentos',{...base,funcionario_id:`eq.${origem}`},500,10),
      rows('mapa_lancamentos',{...base,funcionario_id:'is.null',mapa_nome:`eq.${u.nome}`},500,10)
    ]);
    lista=[...ativos,...legados];
  }
  const vistos=new Set();lista=lista.filter(x=>{if(vistos.has(x.id))return false;vistos.add(x.id);return true;});
  // Lançamentos legados podem não ter produto_id. Resolvemos a seção pelo EAN
  // para que os filtros por seção funcionem também nesses registros importados.
  const semProduto=[...new Set(lista.filter(x=>!x.produtos&&eanValido(x.ean)).map(x=>x.ean))];
  const catalogo=new Map();
  for(let i=0;i<semProduto.length;i+=70){
    for(const p of await rows('produtos',{ean:`in.(${semProduto.slice(i,i+70).join(',')})`,select:'ean,secao,grupo,descricao'},100,2))catalogo.set(p.ean,p);
  }
  const dados=await filtrarRegistrosSecao(lista.map(x=>({...x,catalogo:x.produtos||catalogo.get(x.ean)||{}})),actor.loja_id);
  return {sucesso:true,quantidade:dados.length,secoes:[...new Set(dados.map(x=>norm(x.catalogo?.secao)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR')),
    registros:dados.map(x=>({id:x.id,ean:x.ean,lote:x.lote,validade:x.validade,quantidade:x.quantidade,mes_lancamento:x.mes_lancamento,
      mapa_nome:x.mapa_nome,secao:norm(x.catalogo?.secao),descricao:norm(x.catalogo?.descricao)}))};
}
async function transferirTitularidade(actor,body){
  if(actor.perfil!=='admin')throw bad('Somente o administrador da loja pode transferir lançamentos.',403);
  const origem=norm(body.origem),destino=norm(body.destino),mes=validarMesTitularidade(body.mes),secao=norm(body.secao);
  const uid=/^[a-f0-9-]{36}$/i;
  if(origem!=='flutuando'&&!uid.test(origem))throw bad('Origem inválida.',422);
  if(destino!=='flutuando'&&!uid.test(destino))throw bad('Destino inválido.',422);
  if(origem===destino)throw bad('Origem e destino devem ser diferentes.',422);
  if(secao.length>150)throw bad('Seção inválida.',422);
  const todos=body.todos===true,ids=body.ids||[];
  if(!Array.isArray(ids)||(!todos&&(ids.length<1||ids.length>1000))||ids.some(x=>!uid.test(x)))throw bad('Selecione itens válidos ou todos os filtrados.',422);
  return db('rpc/transferir_lancamentos_v12',{method:'POST',body:{p_administrador:actor.id,p_loja:actor.loja_id,
    p_origem:origem==='flutuando'?null:origem,p_destino:destino==='flutuando'?null:destino,
    p_mes:mes,p_secao:secao||null,p_ids:todos?[]:ids,p_todos:todos}});
}
async function enriquecerRegistros(registros, table) {
  if (!['queima','vencidos','transferencias'].includes(table) || !registros.length) return registros;
  const eans=[...new Set(registros.map(x=>norm(x.ean)).filter(eanValido))];
  const internos=[...new Set(registros.filter(x=>!eanValido(x.ean)).map(x=>norm(x.codigo_interno)).filter(Boolean))];
  let produtos=[];
  for(let i=0;i<eans.length;i+=70){
    const grupo=eans.slice(i,i+70);
    const encontrados=await rows('produtos',{ean:`in.(${grupo.join(',')})`,select:'ean,descricao,codigo_interno,secao,grupo'},100,2);
    produtos.push(...encontrados);
  }
  for(let i=0;i<internos.length;i+=70){
    const grupo=internos.slice(i,i+70).filter(x=>/^\d{1,20}$/.test(x));
    if(grupo.length)produtos.push(...await rows('produtos',{codigo_interno:`in.(${grupo.join(',')})`,select:'ean,descricao,codigo_interno,secao,grupo'},100,2));
  }
  const porEan=new Map(produtos.map(x=>[x.ean,x]));
  const porInterno=new Map();
  for(const x of produtos){const codigo=norm(x.codigo_interno);if(!codigo)continue;if(!porInterno.has(codigo))porInterno.set(codigo,x);else porInterno.set(codigo,null);}
  return registros.map(x=>{const encontrado=porEan.get(norm(x.ean))||porInterno.get(norm(x.codigo_interno));return {...x,descricao:encontrado?.descricao||norm(x.descricao_original)||null,secao:encontrado?.secao||null,grupo:encontrado?.grupo||null,ean_resolvido:eanValido(x.ean)?x.ean:encontrado?.ean||null};});
}

async function genericRecords(req,actor,body,query,table,extras={}) {
  const loja=actorLoja(actor,body.loja||query.get('loja'));
  if(req.method==='GET') {
    admin(actor);
    const regs=await rows(table,{[extras.lojaCol||'loja_id']:`eq.${loja}`,...(['vencidos','transferencias'].includes(table)?{excluido_em:'is.null'}:{}),select:'*',order:'criado_em.desc'},700,10);return {sucesso:true,registros:await filtrarRegistrosSecao(await enriquecerRegistros(regs,table),loja)};
  }
  admin(actor);
  if(req.method==='POST'){
    const payload={...body};delete payload.loja;delete payload.sessao;
    const allowed=extras.allowed||['ean','lote','validade','quantidade','motivo','observacao','romaneio','loja_origem','loja_destino','lancamento_id','estado','origem_mapa','codigo_interno','descricao_original','mapa_origem'];
    const data=Object.fromEntries(Object.entries(payload).filter(([k])=>allowed.includes(k)));
    data[extras.lojaCol||'loja_id']=loja;
    if(extras.usuarioCol!==false)data[extras.usuarioCol||'usuario_id']=actor.id;
    if(data.ean&&!eanValido(data.ean))throw bad('EAN inválido.');
    if(table==='queima'&&!eanValido(data.ean))throw bad('EAN obrigatório na Queima.');
    if(table==='vencidos'&&!data.ean&&!data.codigo_interno)throw bad('Informe EAN ou código interno para a retirada.');
    if(table==='queima')data.motivo='4';
    if(table==='transferencias'){
      if(actor.perfil!=='admin')throw bad('Somente o administrador da loja pode registrar transferências.',403);
      if(!/^\d{1,12}$/.test(norm(data.loja_origem)))throw bad('Informe a loja de origem numérica.',422);
      if(norm(data.loja_origem)===norm(loja))throw bad('A loja de origem deve ser diferente da loja de destino.',422);
      if(!norm(data.romaneio)||norm(data.romaneio).length>100)throw bad('Informe o romaneio com até 100 caracteres.',422);
      if(!dataValida(data.validade)||!norm(data.lote)||norm(data.lote).length>100)throw bad('Confira lote e validade.',422);
      if(!/^[a-zA-Z0-9-]{16,100}$/.test(norm(body.requestId)))throw bad('Identificador único da transferência ausente.',422);
      data.request_id=norm(body.requestId);
      // O Procfit pode informar uma loja de origem ainda ausente do cadastro local.
      await db('lojas',{method:'POST',params:{on_conflict:'id'},body:{id:norm(data.loja_origem),nome:`Loja ${norm(data.loja_origem)}`},prefer:'resolution=ignore-duplicates,return=minimal'});
    }
    if(data.quantidade!==undefined&&(!Number.isInteger(Number(data.quantidade))||Number(data.quantidade)<1))throw bad('Quantidade inválida.');
    const r=await db(table,{method:'POST',body:data,...(table==='transferencias'?{params:{on_conflict:'request_id'},prefer:'resolution=ignore-duplicates,return=representation'}:{prefer:'return=representation'})});
    if(table==='transferencias'&&!r?.length)return {sucesso:true,idempotente:true,status:'saved'};
    await audit(actor,'cadastrar_'+table,{id:r[0].id});return {sucesso:true,status:'saved',registro:r[0]};
  }
  if(req.method==='DELETE'&&table==='queima'){
    const atual=await one('queima',{id:`eq.${norm(body.id)}`,loja_id:`eq.${loja}`});
    if(!atual)throw bad('Registro de Queima não encontrado.',404);
    if(atual.estado!=='pendente')throw bad('Somente Queima pendente pode ser excluída. Registros aprovados devem ser preservados.',409);
    await db('queima',{method:'DELETE',params:{id:`eq.${atual.id}`,loja_id:`eq.${loja}`,estado:'eq.pendente'}});
    await audit(actor,'excluir_queima',{id:atual.id,registro:atual});return {sucesso:true};
  }
  if(req.method==='DELETE'&&['vencidos','transferencias'].includes(table)){
    const id=norm(body.id),key=extras.lojaCol||'loja_id';
    if(!/^[0-9a-f-]{36}$/i.test(id))throw bad('ID inválido.',422);
    const antigo=await one(table,{id:`eq.${id}`,[key]:`eq.${loja}`,excluido_em:'is.null'});
    if(!antigo)throw bad('Registro não encontrado ou excluído anteriormente.',404);
    await db(table,{method:'PATCH',params:{id:`eq.${id}`,[key]:`eq.${loja}`,excluido_em:'is.null'},body:{excluido_em:new Date().toISOString(),excluido_por:actor.id,atualizado_em:new Date().toISOString()},prefer:'return=minimal'});
    await audit(actor,'excluir_'+table,{id,antes:antigo});return {sucesso:true};
  }
  if(req.method==='PATCH'&&['vencidos','transferencias'].includes(table)){
    const id=norm(body.id),key=extras.lojaCol||'loja_id';
    if(!/^[0-9a-f-]{36}$/i.test(id))throw bad('ID inválido.',422);
    const antigo=await one(table,{id:`eq.${id}`,[key]:`eq.${loja}`,excluido_em:'is.null'});
    if(!antigo)throw bad('Registro não encontrado ou excluído anteriormente.',404);
    const campos=table==='vencidos'?['ean','codigo_interno','descricao_original','lote','validade','quantidade','motivo']:['ean','lote','validade','quantidade','loja_origem','romaneio'];
    const patch=Object.fromEntries(Object.entries(body).filter(([c])=>campos.includes(c)));
    if(!Object.keys(patch).length)throw bad('Informe os campos a alterar.',422);
    if(patch.ean!==undefined&&patch.ean!==''&&!eanValido(patch.ean))throw bad('EAN inválido.',422);
    if(table==='transferencias'){
      if(patch.ean!==undefined&&!eanValido(patch.ean))throw bad('EAN obrigatório.',422);
      if(patch.loja_origem!==undefined){const origem=norm(patch.loja_origem);if(!/^\d{1,12}$/.test(origem)||origem===loja)throw bad('Loja de origem inválida.',422);await db('lojas',{method:'POST',params:{on_conflict:'id'},body:{id:origem,nome:`Loja ${origem}`},prefer:'resolution=ignore-duplicates,return=minimal'});patch.loja_origem=origem;}
      if(patch.romaneio!==undefined&&(!norm(patch.romaneio)||norm(patch.romaneio).length>100))throw bad('Romaneio obrigatório (até 100 caracteres).',422);
    }else if(patch.motivo!==undefined&&!['danificado','vencido','retirado'].includes(norm(patch.motivo)))throw bad('Motivo inválido.',422);
    if(patch.validade!==undefined&&patch.validade!==null&&patch.validade!==''&&!dataValida(patch.validade))throw bad('Data de validade inválida.',422);
    if(table==='transferencias'&&patch.validade!==undefined&&!dataValida(patch.validade))throw bad('Validade obrigatória.',422);
    if(patch.quantidade!==undefined&&(!Number.isInteger(Number(patch.quantidade))||Number(patch.quantidade)<=0||Number(patch.quantidade)>999999))throw bad('Quantidade inválida.',422);
    if(patch.lote!==undefined&&norm(patch.lote).length>100)throw bad('Lote muito longo.',422);
    if(table==='vencidos'&&patch.ean==='')patch.ean=null;
    patch.atualizado_em=new Date().toISOString();
    await db(table,{method:'PATCH',params:{id:`eq.${id}`,[key]:`eq.${loja}`,excluido_em:'is.null'},body:patch,prefer:'return=minimal'});
    await audit(actor,'editar_'+table,{id,antes:antigo,campos:Object.keys(patch).filter(c=>c!=='atualizado_em')});return {sucesso:true};
  }
  if(req.method==='PATCH'){
    const atual=await one(table,{id:`eq.${body.id}`,[extras.lojaCol||'loja_id']:`eq.${loja}`});if(!atual)throw bad('Não encontrado.',404);
    const allowed=extras.patchAllowed||['estado','observacao','situacao'];const patch=Object.fromEntries(Object.entries(body).filter(([k])=>allowed.includes(k)));
    if(table==='queima'&&patch.estado&&!['pendente','aprovado'].includes(patch.estado))throw bad('Use a operação de relançar para preservar o histórico.');
    if(table==='queima'&&patch.estado==='aprovado'){
      if(atual.estado!=='pendente')throw bad('Somente uma Queima pendente pode ser aprovada.',409);
      // O front exige relançar o mês anterior; mesmo a chamada direta não pode aprovar.
      const [yy,mm]=String(atual.criado_em).slice(0,7).split('-');
      const nowParts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
      if(`${yy}-${mm}`!==`${nowParts.year}-${nowParts.month}`)throw bad('Queima de mês anterior: relance antes de aprovar.',409);
    }
    if(table==='sinalizacoes'&&patch.situacao&&!['aberto','resolvido','negado'].includes(patch.situacao))throw bad('Situação inválida.');
    if(!Object.keys(patch).length)throw bad('Nenhuma alteração válida.');
    await db(table,{method:'PATCH',params:{id:`eq.${atual.id}`},body:patch});await audit(actor,'atualizar_'+table,{id:atual.id});return {sucesso:true};
  }
  throw bad('Método não permitido.',405);
}
// Pendências históricas: original imutável; correções ficam em tabelas operacionais
// e o registro pendente recebe um marcador e um resumo auditável.
const lojaCorreta=v=>/^\d{1,12}$/.test(norm(v));
const dataMapMes=v=>/^\d{4}-(0[1-9]|1[0-2])-01$/.test(norm(v));
function validatePendingBasic(d,{quantidadeMin=0}={}){
  if(!lojaCorreta(d.loja_id))throw bad('Informe uma loja numérica válida.');
  if(d.ean&&!eanValido(d.ean))throw bad('EAN deve ter de 8 a 14 dígitos.');
  if(d.validade&&!dataValida(d.validade))throw bad('Validade inválida.');
  if(!Number.isInteger(Number(d.quantidade))||Number(d.quantidade)<quantidadeMin||Number(d.quantidade)>999999)throw bad('Quantidade inválida.');
}
function pendingVisible(actor,item){
  if(actor.perfil==='geral')return true;
  return String(item?.dados?.loja_id||'')===String(actor.loja_id||'');
}
async function pendencias(req,actor,body,query){
  admin(actor);
  if(req.method==='GET'){
    const [catalogo,migracao,lancamentos]=await Promise.all([
      rows('catalogo_pendencias',{status:'eq.pendente',select:'codigo_original,codigo_interno,descricao,secao,motivo,status',order:'importado_em.asc'},500,5),
      rows('migracao_pendencias',{status:'eq.pendente',select:'origem_migracao,tabela_origem,motivo,dados,status',order:'importado_em.asc'},500,5),
      rows('lancamento_pendencias',{status:'eq.pendente',...(actor.perfil==='geral'?{}:{loja_id:`eq.${actor.loja_id}`}),
        select:'id,lancamento_id,loja_id,ean,status,criado_em,mapa_lancamentos(mapa_nome,lote,validade,quantidade,mes_lancamento,excluido_em)',order:'criado_em.desc'},500,12)
    ]);
    const visiveis=migracao.filter(x=>pendingVisible(actor,x));
    const excluidas=await exclusoesDaLoja(actor.loja_id);
    const catalogoVisivel=catalogo.filter(x=>!produtoOculto(x,excluidas));
    const migracaoVisivel=visiveis.filter(x=>!produtoOculto(x.dados,excluidas));
    const pendenciasLancamento=lancamentos.filter(x=>!x.mapa_lancamentos?.excluido_em);
    return {sucesso:true,catalogo:catalogoVisivel,migracao:migracaoVisivel,lancamentos:pendenciasLancamento,
      totais:{catalogo:catalogoVisivel.length,migracao:migracaoVisivel.length,lancamentos:pendenciasLancamento.length}};
  }
  if(req.method==='POST'&&body.acao==='ignorar'){
    const tipo=norm(body.tipo),id=norm(body.id);
    if(!['catalogo','migracao','lancamento'].includes(tipo)||!id)throw bad('Pendência inválida.',422);
    if(tipo==='lancamento'){
      const item=await one('lancamento_pendencias',{id:`eq.${id}`,status:'eq.pendente',select:'*'});
      if(!item)throw bad('Pendência não encontrada ou já resolvida.',409);
      if(actor.perfil!=='geral'&&String(item.loja_id)!==String(actor.loja_id))throw bad('Pendência de outra loja.',403);
      await db('lancamento_pendencias',{method:'PATCH',params:{id:`eq.${id}`,status:'eq.pendente'},
        body:{status:'ignorada',ignorado_em:new Date().toISOString(),ignorado_por:actor.id,atualizado_em:new Date().toISOString()},prefer:'return=minimal'});
      await audit(actor,'ignorar_pendencia_ean',{id,lancamento_id:item.lancamento_id,ean:item.ean});
    }else{
      const table=tipo==='catalogo'?'catalogo_pendencias':'migracao_pendencias';
      const chave=tipo==='catalogo'?'codigo_original':'origem_migracao';
      const item=await one(table,{[chave]:`eq.${id}`,status:'eq.pendente',select:'*'});
      if(!item)throw bad('Pendência não encontrada ou já resolvida.',409);
      if(tipo==='migracao'&&!pendingVisible(actor,item))throw bad('Pendência de outra loja.',403);
      await db(table,{method:'PATCH',params:{[chave]:`eq.${id}`,status:'eq.pendente'},
        body:{status:'ignorado',corrigido_em:new Date().toISOString(),corrigido_por:actor.id,
          resultado:{acao:'ignorar',observacao:'Registro preservado para auditoria.'}},prefer:'return=minimal'});
      await audit(actor,'ignorar_pendencia',{tipo,id});
    }
    return {sucesso:true,detalhe:'Pendência ignorada. O lançamento não foi excluído.'};
  }
  if(req.method!=='PATCH')throw bad('Método não permitido.',405);
  const tipo=norm(body.tipo),id=norm(body.id),entrada=body.correcao;
  if(!['catalogo','migracao','lancamento'].includes(tipo)||!id||!entrada||typeof entrada!=='object'||Array.isArray(entrada))throw bad('Dados de correção inválidos.');
  if(tipo==='lancamento'){
    const pend=await one('lancamento_pendencias',{id:`eq.${id}`,status:'eq.pendente',select:'*'});
    if(!pend)throw bad('Pendência não encontrada ou já resolvida.',409);
    if(actor.perfil!=='geral'&&String(pend.loja_id)!==String(actor.loja_id))throw bad('Pendência de outra loja.',403);
    const ean=norm(entrada.ean),descricao=norm(entrada.descricao),secao=norm(entrada.secao);
    if(!eanValido(ean))throw bad('Informe um EAN válido.',422);
    let prod=await one('produtos',{ean:`eq.${ean}`,select:'id,ean'});
    if(!prod){
      if(!descricao||!secao)throw bad('Produto não cadastrado: informe descrição e seção.',422);
      await db('produtos',{method:'POST',body:{ean,descricao,secao,atualizado_em:new Date().toISOString()},
        params:{on_conflict:'ean'},prefer:'resolution=ignore-duplicates,return=minimal'});
      prod=await one('produtos',{ean:`eq.${ean}`,select:'id,ean'});
      if(!prod)throw bad('Não foi possível cadastrar o EAN.',409);
    }
    await db('mapa_lancamentos',{method:'PATCH',params:{id:`eq.${pend.lancamento_id}`,loja_id:`eq.${pend.loja_id}`,
      excluido_em:'is.null'},body:{ean,produto_id:prod.id,atualizado_em:new Date().toISOString()},prefer:'return=minimal'});
    // O gatilho do mapa resolve a pendência do lançamento sem apagar seu histórico.
    await db('lancamento_pendencias',{method:'PATCH',params:{id:`eq.${id}`,status:'eq.pendente'},
      body:{status:'resolvida',atualizado_em:new Date().toISOString()},prefer:'return=minimal'});
    await audit(actor,'resolver_pendencia_ean',{pendencia:id,lancamento_id:pend.lancamento_id,ean});
    return {sucesso:true,resultado:{ean,produto_id:prod.id}};
  }
  const table=tipo==='catalogo'?'catalogo_pendencias':'migracao_pendencias';
  const key=tipo==='catalogo'?'codigo_original':'origem_migracao';
  const pend=await one(table,{[key]:`eq.${id}`,status:'eq.pendente',select:'*'});
  if(!pend)throw bad('Pendência não encontrada ou já resolvida. Atualize a lista.',409);
  const store=norm(entrada.loja_id||pend.dados?.loja_id);
  if(tipo==='migracao'){
    if(!pendingVisible(actor,pend))throw bad('Pendência fora da sua loja.',403);
    if(actor.perfil!=='geral'&&store!==String(actor.loja_id))throw bad('Não é permitido transferir pendências para outra loja.',403);
  }
  let resultado;
  if(tipo==='catalogo'){
    const ean=norm(entrada.ean),descricao=norm(entrada.descricao??pend.descricao),secao=norm(entrada.secao??pend.secao),codigo=norm(entrada.codigo_interno??pend.codigo_interno)||null;
    if(!eanValido(ean)||!descricao)throw bad('Informe EAN válido e descrição.');
    const existing=await one('produtos',{ean:`eq.${ean}`,select:'id,ean,codigo_interno,descricao,secao'});
    if(existing&&(norm(existing.descricao)!==descricao || (codigo&&existing.codigo_interno&&norm(existing.codigo_interno)!==codigo) || (secao&&existing.secao&&norm(existing.secao)!==secao)))throw bad('Este EAN já existe com dados diferentes. Confira no cadastro de produtos antes de corrigir.',409);
    if(!existing)await db('produtos',{method:'POST',body:{ean,descricao,secao,codigo_interno:codigo},params:{on_conflict:'ean'},prefer:'resolution=ignore-duplicates,return=minimal'});
    resultado={ean,descricao,secao,codigo_interno:codigo,origem_codigo:pend.codigo_original};
  }else{
    const orig=pend.dados||{};const origem=pend.tabela_origem;
    const ean=norm(entrada.ean??orig.ean),lote=norm(entrada.lote??orig.lote),validade=norm(entrada.validade??orig.validade);
    const quantidade=Number(entrada.quantidade??orig.quantidade);
    const nova={...orig,loja_id:store,ean,lote,validade,quantidade};
    if(!['mapa_lancamentos','vencidos','queima'].includes(origem))throw bad('Este tipo de pendência exige revisão pelo administrador geral.',422);
    validatePendingBasic(nova,{quantidadeMin:origem==='mapa_lancamentos'?0:origem==='queima'?0:1});
    if(origem==='mapa_lancamentos'){
      if(!eanValido(ean)||!lote||lote.length>100||!dataValida(validade)||!dataMapMes(norm(orig.mes_lancamento)))throw bad('Confira EAN, lote (máximo 100 caracteres), validade e mês original do mapa.');
      const mapa=norm(orig.mapa_nome),tipoMapa=norm(orig.tipo_mapa);
      if(tipoMapa!=='funcionario'&&!specials.includes(tipoMapa))throw bad('Tipo de mapa desconhecido.');
      let usuario=null;
      if(tipoMapa==='funcionario'){
        usuario=await one('usuarios',{loja_id:`eq.${store}`,nome_normalizado:`eq.${normalizarNome(mapa)}`,select:'id'});
        if(!usuario)throw bad('Funcionário do mapa não está cadastrado na loja. Cadastre-o primeiro.',409);
      }
      const prod=await one('produtos',{ean:`eq.${ean}`,select:'id'});
      const item={origem_migracao:pend.origem_migracao,loja_id:store,mapa_nome:mapa,tipo_mapa:tipoMapa,funcionario_id:usuario?.id||null,produto_id:prod?.id||null,ean,lote:lote.toUpperCase(),validade,quantidade,mes_lancamento:orig.mes_lancamento,criado_em:orig.criado_em||new Date().toISOString()};
      await db('mapa_lancamentos',{method:'POST',body:item,params:{on_conflict:'origem_migracao'},prefer:'resolution=ignore-duplicates,return=minimal'});
      resultado={tabela:origem,loja_id:store,ean,lote:item.lote,validade,quantidade,mes_lancamento:item.mes_lancamento};
    } else if(origem==='vencidos'){
      if(!dataValida(validade))throw bad('Validade inválida.');
      const item={origem_migracao:pend.origem_migracao,loja_id:store,ean:eanValido(ean)?ean:null,codigo_interno:norm(orig.codigo_interno)||null,descricao_original:norm(orig.descricao_original),mapa_origem:norm(orig.mapa_origem),linha_original:norm(orig.linha_original),lote:lote||null,validade,quantidade,criado_em:orig.criado_em||new Date().toISOString()};
      await db('vencidos',{method:'POST',body:item,params:{on_conflict:'origem_migracao'},prefer:'resolution=ignore-duplicates,return=minimal'});
      resultado={tabela:origem,loja_id:store,ean:item.ean,lote,validade,quantidade};
    }else{
      if(!eanValido(ean)||!dataValida(validade))throw bad('EAN e validade obrigatórios para Queima.');
      const item={origem_migracao:pend.origem_migracao,loja_id:store,ean,lote:lote||null,validade,quantidade,estado:['pendente','aprovado','relancado'].includes(orig.estado)?orig.estado:'pendente',origem_mapa:norm(orig.origem_mapa)||null,criado_em:orig.criado_em||new Date().toISOString()};
      await db('queima',{method:'POST',body:item,params:{on_conflict:'origem_migracao'},prefer:'resolution=ignore-duplicates,return=minimal'});
      resultado={tabela:origem,loja_id:store,ean,lote,validade,quantidade};
    }
  }
  // Se a atualização do marcador falhar, o reenvio por origem_migracao é idempotente.
  await db(table,{method:'PATCH',params:{[key]:`eq.${id}`,status:'eq.pendente'},body:{status:'corrigido',corrigido_em:new Date().toISOString(),corrigido_por:actor.id,resultado}});
  await audit(actor,'corrigir_pendencia',{tipo,id,resultado});
  return {sucesso:true,resultado};
}

// Cadastro GLOBAL de lojas: não utiliza actor.loja_id nem aceita loja implícita (151).
async function cadastrarLojaGeral(actor,body){
  geral(actor); // exige sessão autenticada em modo Geral, inclusive no perfil duplo
  const id=norm(body.codigo??body.id),nome=norm(body.nome).replace(/\s+/g,' ');
  if(!/^\d{1,12}$/.test(id))throw bad('Informe um código de loja numérico de 1 a 12 dígitos.',422);
  if(nome.length<2||nome.length>120)throw bad('Informe o nome da loja com 2 a 120 caracteres.',422);
  if(await one('lojas',{id:`eq.${id}`,select:'id'}))throw bad(`A loja ${id} já está cadastrada.`,409);
  const inserted=await db('lojas',{
    method:'POST',params:{on_conflict:'id'},body:{id,nome},
    prefer:'resolution=ignore-duplicates,return=representation'
  });
  // Evita substituir uma loja existente mesmo em cadastros concorrentes.
  if(!Array.isArray(inserted)||inserted.length!==1)throw bad('Loja já cadastrada. Atualize a lista.',409);
  // Painel Geral não é de uma loja específica: auditoria de ação global tem loja_id null.
  try{await db('auditoria',{method:'POST',body:{loja_id:null,usuario_id:actor.id,acao:'cadastrar_loja_geral',dados:{codigo:id,nome}},prefer:'return=minimal'});}
  catch(err){console.error('Falha ao auditar cadastro global de loja:',err.message);}
  return {sucesso:true,loja:{id,nome}};
}

async function painelGeral(actor) {
  geral(actor);
  const [lojas,admins,usuarios]=await Promise.all([
    rows('lojas',{select:'id,nome',order:'id.asc'},500,5),
    rows('usuarios',{perfil:'eq.admin',select:'id,nome,loja_id,perfil,ativo',order:'loja_id.asc'},500,5),
    rows('usuarios',{select:'loja_id,perfil,ativo'},500,10)
  ]);
  return {sucesso:true,lojas,administradores:admins,totais:{lojas:lojas.length,administradores:admins.length,funcionarios:usuarios.filter(u=>u.perfil==='funcionario').length}};
}
async function encaminharMapa(req,actor,body){
  admin(actor);
  const loja=actorLoja(actor,body.loja);
  const ids=body.ids;
  if(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(id=>!/^[0-9a-f-]{36}$/i.test(norm(id))))throw bad('Selecione de 1 a 100 registros válidos.');
  if(!['queima','vencidos'].includes(body.destino))throw bad('Destino inválido.');
  const resultado=await db('rpc/encaminhar_mapa',{method:'POST',body:{p_loja_id:loja,p_usuario_id:actor.id,p_ids:ids,p_destino:body.destino}});
  await audit(actor,'encaminhar_mapa',{ids,destino:body.destino});
  return {sucesso:true,resultado};
}
async function relancarQueima(req,actor,body){
  admin(actor); const loja=actorLoja(actor,body.loja);
  if(!/^[0-9a-f-]{36}$/i.test(norm(body.id)))throw bad('Identificador inválido.');
  const result=await db('rpc/relancar_queima',{method:'POST',body:{p_loja_id:loja,p_usuario_id:actor.id,p_id:body.id}});
  await audit(actor,'relancar_queima',{id:body.id});return {sucesso:true,resultado:result};
}
async function retirarDanificado(req,actor,body){
  admin(actor);const loja=actorLoja(actor,body.loja);
  const registro=await one('vencidos',{id:`eq.${norm(body.id)}`,loja_id:`eq.${loja}`,motivo:'eq.danificado'});
  if(!registro)throw bad('Registro danificado não encontrado.',404);
  if(registro.retirado_em)return {sucesso:true,jaRetirado:true};
  await db('vencidos',{method:'PATCH',params:{id:`eq.${registro.id}`,loja_id:`eq.${loja}`},body:{retirado_em:new Date().toISOString(),retirado_por:actor.id}});
  await audit(actor,'retirar_danificado',{id:registro.id});return {sucesso:true};
}

// Organização visual das seções: nenhuma operação nesta rota altera registros de mapas.
async function organizarSecoes(req,actor,body){
 // A URL histórica é mantida, mas os cartões e responsáveis agora são por GRUPO.
 if(actor.perfil!=='admin'||!actor.loja_id)throw bad('Organização exclusiva do administrador da loja.',403);
 const loja=actor.loja_id;
 const carregar=()=>db('rpc/resumo_organizacao_grupos',{method:'POST',body:{p_loja:loja}});
 if(req.method==='GET'){
  const [resumo,atribuicoes,funcionarios]=await Promise.all([
   carregar(),
   rows('organizacao_grupos',{loja_id:`eq.${loja}`,select:'grupo_chave,grupo,responsavel_id,oculta_no_quadro,excluida_das_listas,atualizado_em',order:'grupo.asc'},250,5),
   rows('usuarios',{loja_id:`eq.${loja}`,perfil:'eq.funcionario',ativo:'eq.true',excluido_em:'is.null',select:'id,nome',order:'nome.asc'},250,5)
  ]);
  // Compatibilidade com o quadro existente: campos de apresentação são aliases, não seções reais.
  return {sucesso:true,loja,criterio:'grupo',secaoDisponiveis:resumo?.grupos||[],estatisticas:resumo?.estatisticas||[],semSecao:Number(resumo?.sem_grupo||0),semFuncionario:Number(resumo?.sem_funcionario||0),
   atribuicoes:atribuicoes.map(x=>({...x,secao_chave:x.grupo_chave,secao:x.grupo})),funcionarios};
 }
 if(req.method==='POST'){
   const alteracoes=body.alteracoes;
   if(!Array.isArray(alteracoes)||alteracoes.length<1||alteracoes.length>500)
     throw bad('Selecione de 1 a 500 grupos para salvar.',422);
   const resumo=await carregar(),validos=new Map((resumo?.grupos||[]).map(x=>[chaveSecao(x.chave),x]));
   const vistos=new Set(),ids=new Set(),itens=[];
   for(const item of alteracoes){
     const chave=chaveSecao(item?.grupo);
     if(!chave||vistos.has(chave)||!validos.has(chave)||secaoPadraoIgnorada(item?.grupo))
       throw bad('Grupo desconhecido, protegido ou repetido na organização.',422);
     vistos.add(chave);
     const id=item.responsavel_id==null||item.responsavel_id===''?null:norm(item.responsavel_id);
     if(id&&!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id))throw bad('Responsável inválido.',422);
     if(id)ids.add(id);
     itens.push({grupo:validos.get(chave).nome,responsavel_id:id});
   }
   // Validação de TODOS os responsáveis antes de enviar uma única transação SQL.
   if(ids.size){
     const pessoas=await rows('usuarios',{loja_id:`eq.${loja}`,perfil:'eq.funcionario',ativo:'eq.true',excluido_em:'is.null',select:'id'},250,10);
     const permitidos=new Set(pessoas.map(x=>x.id));
     if([...ids].some(id=>!permitidos.has(id)))throw bad('Um responsável não pertence à loja ou está inativo.',403);
   }
   const resultado=await db('rpc/salvar_organizacao_grupos',{method:'POST',body:{p_loja:loja,p_usuario:actor.id,p_itens:itens}});
   try{await audit(actor,'salvar_organizacao_grupos',{quantidade:itens.length,grupos:itens.map(x=>x.grupo),sem_movimentar_lancamentos:true});}
   catch(error){console.error('Registro de auditoria da organização indisponível:',error.message);}
   return {sucesso:true,alterados:Number(resultado?.alterados??itens.length)};
 }
 const grupo=norm(body.grupo||body.secao).replace(/\s+/g,' '),chave=grupo.toLocaleLowerCase('pt-BR');
 if(!grupo||grupo.length>120||secaoPadraoIgnorada(grupo))throw bad('Grupo protegido ou inválido.',422);
 const resumo=await carregar(),encontrado=(resumo?.grupos||[]).find(x=>chaveSecao(x.chave)===chaveSecao(grupo));
 if(!encontrado)throw bad('Grupo não localizado no catálogo.',404);
 if(req.method==='PUT'){
   const responsavelId=body.responsavel_id===null||body.responsavel_id===''||body.responsavel_id===undefined?null:norm(body.responsavel_id);
   if(responsavelId){
    if(!/^[a-f0-9-]{36}$/i.test(responsavelId))throw bad('Responsável inválido.',422);
    const pessoa=await one('usuarios',{id:`eq.${responsavelId}`,loja_id:`eq.${loja}`,perfil:'eq.funcionario',ativo:'eq.true',excluido_em:'is.null',select:'id'});
    if(!pessoa)throw bad('Responsável inválido ou de outra loja.',403);
   }
   await db('organizacao_grupos',{method:'POST',params:{on_conflict:'loja_id,grupo_chave'},body:{loja_id:loja,grupo_chave:chave,grupo:encontrado.nome,responsavel_id:responsavelId,atualizado_por:actor.id,atualizado_em:new Date().toISOString()},prefer:'resolution=merge-duplicates,return=minimal'});
   await audit(actor,'organizar_grupo',{grupo:encontrado.nome,responsavel_id:responsavelId,sem_movimentar_lancamentos:true});
   return {sucesso:true,grupo:encontrado.nome,responsavel_id:responsavelId};
 }
 if(req.method==='PATCH'){
   const acao=norm(body.acao);if(!['ocultar','excluir','restaurar'].includes(acao))throw bad('Ação inválida.',422);
   await db('organizacao_grupos',{method:'POST',params:{on_conflict:'loja_id,grupo_chave'},body:{loja_id:loja,grupo_chave:chave,grupo:encontrado.nome,oculta_no_quadro:acao==='ocultar',excluida_das_listas:acao==='excluir',atualizado_por:actor.id,atualizado_em:new Date().toISOString()},prefer:'resolution=merge-duplicates,return=minimal'});
   await audit(actor,'visibilidade_grupo',{grupo:encontrado.nome,acao,lancamentos_preservados:true});
   return {sucesso:true,grupo:encontrado.nome,acao};
 }
 throw bad('Método não permitido.',405);
}
async function handle(req){
  const origin=req.headers.origin,host=req.headers.host;
  if(origin){let same=false;try{same=new URL(origin).host===host;}catch{}if(!same)throw bad('Origem não autorizada.',403);}
  const url=new URL(req.url,`https://${host||'localhost'}`);
  const query=url.searchParams;
  const candidate=norm(query.get('route'));
  const pathname=candidate && /^[a-z/-]+$/i.test(candidate)?'/'+candidate:url.pathname.replace(/^\/api(?:\/index\.js)?/,'')||'/';
  if(req.method==='OPTIONS')return {sucesso:true};
  if(req.method!=='GET'&&Number(req.headers['content-length']||0)>2_000_000)throw bad('Solicitação muito grande.',413);
  const body=req.method==='GET'?{}:requestBody(req);
  if(pathname==='/health') {const configurado=!!(urlBase()&&secret());if(query.get('check')==='1'){if(!configurado)throw bad('Configuração Supabase ausente no Vercel.',503);await one('lojas',{select:'id'});return {sucesso:true,servico:'operacional',banco:'acessivel'};}return {sucesso:true,servico:'operacional',supabaseConfigurado:configurado};}
  if(pathname==='/login'&&req.method==='POST')return login(body);
  if(pathname.startsWith('/notificacoes/'))return tratarNotificacoes(req,{pathname,body,query,db,rows,one,authenticate,admin,actorLoja,audit});
  const {actor,sessao}=await authenticate(req);
  if(pathname==='/sessao'&&req.method==='GET')return {sucesso:true,usuario:cleanUser(actor)};
  if(pathname==='/conta/modo'&&req.method==='POST')return alternarModo(actor,sessao,body);
  if(pathname==='/conta/pin'&&req.method==='POST')return alterarMeuPinGeral(actor,sessao,body);
  if(pathname==='/logout'&&req.method==='POST'){
    await db('sessoes',{method:'DELETE',params:{token_hash:`eq.${sessao.token_hash}`}});return {sucesso:true};
  }
  if(pathname==='/organizacao-secoes')return organizarSecoes(req,actor,body);
  if(pathname.startsWith('/produtos'))return produtos(req,actor,pathname,body,query);
  if(pathname==='/geral'&&req.method==='GET')return painelGeral(actor);
  if(pathname==='/geral/lojas'&&req.method==='POST')return cadastrarLojaGeral(actor,body);
  if(pathname==='/mapas/encaminhar'&&req.method==='POST')return encaminharMapa(req,actor,body);
  if(pathname==='/queima/relancar'&&req.method==='POST')return relancarQueima(req,actor,body);
  if(pathname==='/vencidos/retirar'&&req.method==='POST')return retirarDanificado(req,actor,body);
  if(pathname.startsWith('/mapas'))return mapas(req,actor,pathname,body,query);
  if(pathname.startsWith('/visualizacao/'))return visualizacao(req,actor,pathname,body,query);
  if(pathname.startsWith('/estoque'))return stock(req,actor,pathname,body,query);
  if(pathname==='/usuarios/lancamentos'&&req.method==='GET')return listarLancamentosTitularidade(actor,query);
  if(pathname==='/usuarios/transferir'&&req.method==='POST')return transferirTitularidade(actor,body);
  if(pathname.startsWith('/usuarios'))return staff(req,actor,body,query);
  if(pathname==='/pendencias')return pendencias(req,actor,body,query);
  if(pathname==='/vencidos')return genericRecords(req,actor,body,query,'vencidos');
  if(pathname==='/queima')return genericRecords(req,actor,body,query,'queima',{patchAllowed:['estado','motivo']});
  if(pathname==='/sinalizacoes')return genericRecords(req,actor,body,query,'sinalizacoes',{usuarioCol:'atualizado_por'});
  if(pathname==='/transferencias')return genericRecords(req,actor,body,query,'transferencias',{lojaCol:'loja_destino',allowed:['ean','lote','validade','quantidade','romaneio','loja_origem']});
  if(pathname==='/auditoria'&&req.method==='GET'){
    admin(actor);const loja=actorLoja(actor,query.get('loja'));return {sucesso:true,registros:await rows('auditoria',{loja_id:`eq.${loja}`,select:'id,acao,dados,criado_em,usuario_id,usuarios(nome)',order:'criado_em.desc'},500,2)};
  }
  throw bad('Rota não implementada.',404);
}
export default async function handler(req,res){
  try {const result=await handle(req);json(res,200,result);}
  catch(e){
    const code=e.status&&e.status>=400&&e.status<600?e.status:500;
    const referencia=randomBytes(4).toString('hex').toUpperCase();
    if(code>=500){
      console.error(`[API ${referencia}] ${req.method} ${String(req.url).split('?')[0]} - ${e.name}: ${e.message}`);
    }
    const mensagem=code===503?'Serviço indisponível: confira as variáveis de ambiente no Vercel.':
      code===502?'Falha na comunicação com o Supabase. Verifique a conexão e tente novamente.':
      code>=500?'Erro interno no servidor. Consulte os logs do Vercel com a referência informada.':e.message;
    json(res,code,{sucesso:false,mensagem,...(code>=500?{referencia}:{})});
  }
}
