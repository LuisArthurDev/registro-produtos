import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

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
const cleanProduct=p=>({ean:norm(p.ean),codigo_interno:norm(p.codigo_interno)||null,descricao:norm(p.descricao),secao:norm(p.secao),atualizado_em:new Date().toISOString()});
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
const cleanUser=u=>({id:u.id,nome:u.nome,loja:u.loja_id,perfil:u.perfil,administrador:u.perfil!=='funcionario',administradorGeral:u.perfil==='geral',especial:u.especial,ativo:u.ativo,celularProprio:u.celular_proprio});
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
function geral(actor){if(actor.perfil!=='geral')throw bad('Acesso restrito ao administrador geral.',403);}
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
  if(!user?.ativo)throw bad('Usuário inativo ou inexistente.',403);
  if(hora-Date.parse(sessao.ultima_atividade)>60*1000) {
    await db('sessoes',{method:'PATCH',params:{token_hash:`eq.${sessao.token_hash}`},body:{ultima_atividade:new Date().toISOString()}});
  }
  return {actor:user, sessao};
}
async function login(body) {
  const nome=normalizarNome(body.nome), pin=String(body.pin??'');
  if(nome.length<2||nome.length>120||!/^\d{4,12}$/.test(pin))throw bad('Credenciais inválidas.',401);
  let candidatos=await rows('usuarios',{nome_normalizado:`eq.${nome}`,ativo:'eq.true',select:'*'},100);
  if(body.loja) {const sameStore=candidatos.filter(u=>u.loja_id===String(body.loja));candidatos=sameStore.length?sameStore:candidatos.filter(u=>u.perfil==='geral'&&u.loja_id===null);}
  if(candidatos.length>1)throw bad('Há nomes iguais em mais de uma loja. Informe o número da loja.',409);
  const user=candidatos[0];
  if(!user)throw bad('Credenciais inválidas.',401);
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
async function produtos(req,actor,pathname,body,query){
  if(req.method==='GET'){
    const filtro=norm(query.get('q')); if(filtro.length>100)throw bad('Pesquisa muito longa.');
    let params={select:'id,ean,codigo_interno,descricao,secao',order:'descricao.asc'};
    if(filtro) params.or=`(ean.eq.${filtro.replace(/[^\d]/g,'')||'000'},codigo_interno.eq.${filtro.replace(/[^\d]/g,'')||'000'},descricao.ilike.*${filtro.replace(/[%,()]/g,'')}*)`;
    return {sucesso:true,produtos:await db('produtos',{params:{...params,limit:Math.min(Number(query.get('limite'))||80,200)}})};
  }
  admin(actor);
  if(pathname.endsWith('/importar')){
    if(!Array.isArray(body.produtos)||body.produtos.length>500)throw bad('Envie um lote de até 500 produtos.');
    const lista=body.produtos.map(cleanProduct);
    if(lista.some(x=>!eanValido(x.ean)))throw bad('Há EANs inválidos no lote.');
    const result=await db('produtos',{method:'POST',body:lista,params:{on_conflict:'ean'},prefer:'resolution=merge-duplicates,return=minimal'});
    await audit(actor,'importar_produtos',{quantidade:lista.length});return {sucesso:true,importados:lista.length};
  }
  const p=cleanProduct(body);if(!eanValido(p.ean))throw bad('EAN deve conter 8 a 14 dígitos.');
  await db('produtos',{method:'POST',body:p,params:{on_conflict:'ean'},prefer:'resolution=merge-duplicates,return=minimal'});
  await audit(actor,'salvar_produto',{ean:p.ean});return {sucesso:true,produto:p};
}
async function mapas(req,actor,pathname,body,query){
  const loja=actorLoja(actor,body.loja||query.get('loja'));
  if(req.method==='GET'){
    const nome=norm(query.get('mapa'));
    if(nome)podeMapa(actor,nome);
    const params={loja_id:`eq.${loja}`,select:'*,produtos(codigo_interno,descricao,secao)',order:'validade.asc'};
    if(actor.perfil==='funcionario')params.mapa_nome=`eq.${actor.nome}`;
    else if(nome)params.mapa_nome=`eq.${nome}`;
    const registros=await rows('mapa_lancamentos',params,800,20);
    return {sucesso:true,registros:registros.map(r=>({...r,codigoInterno:r.produtos?.codigo_interno||'',descricao:r.produtos?.descricao||'',secao:r.produtos?.secao||''}))};
  }
  if(pathname.endsWith('/descer')){
    admin(actor);const destino=norm(body.destino);if(!destino||destino==='Estoque')throw bad('Destino inválido.');
    const origem=await one('mapa_lancamentos',{id:`eq.${body.id}`,loja_id:`eq.${loja}`,tipo_mapa:'eq.Estoque'});
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
    if(tipo==='Estoque'&&new Date(validade)<new Date(new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}))){} // Não alterar regra de validade dos mapas especiais.
    if(tipo!=='funcionario')admin(actor);
    if(actor.perfil!=='funcionario' && tipo==='funcionario'){
      const pessoa=await one('usuarios',{loja_id:`eq.${loja}`,nome_normalizado:`eq.${normalizarNome(mapa)}`,ativo:'eq.true'});
      if(!pessoa || pessoa.perfil==='geral')throw bad('Mapa de funcionário inexistente ou inativo.',403);
    }
    const registro=await db('rpc/gravar_lancamento',{method:'POST',body:{p_request_id:norm(body.requestId),p_usuario_id:actor.id,p_loja_id:loja,p_mapa_nome:mapa,p_tipo_mapa:tipo,p_ean:ean,p_lote:lote,p_validade:validade,p_quantidade:quantidade,p_confirmar_duplicado:body.confirmarDuplicado===true}});
    if(registro.status==='saved')await audit(actor,'lancamento',{id:registro.id,mapa,ean});
    return {sucesso:registro.status==='saved',...registro};
  }
  admin(actor);
  const id=norm(body.id);if(!/^[a-f0-9-]{36}$/.test(id))throw bad('Identificador inválido.');
  const existente=await one('mapa_lancamentos',{id:`eq.${id}`,loja_id:`eq.${loja}`});if(!existente)throw bad('Registro não encontrado.',404);
  if(req.method==='PATCH'){
    const patch={};
    if(body.ean!==undefined){if(!eanValido(norm(body.ean)))throw bad('EAN deve ter de 8 a 14 dígitos.');patch.ean=norm(body.ean);const produto=await one('produtos',{ean:`eq.${patch.ean}`,select:'id'});patch.produto_id=produto?.id||null;}
    if(body.quantidade!==undefined){if(!Number.isInteger(Number(body.quantidade))||Number(body.quantidade)<0||Number(body.quantidade)>999999)throw bad('Quantidade inválida.');patch.quantidade=Number(body.quantidade);}
    if(body.lote!==undefined){if(!norm(body.lote)||norm(body.lote).length>100)throw bad('Lote obrigatório, com no máximo 100 caracteres.');patch.lote=norm(body.lote).toUpperCase();}
    if(body.validade!==undefined){if(!dataValida(body.validade))throw bad('Data inválida.');patch.validade=body.validade;}
    if(!Object.keys(patch).length)throw bad('Nenhum campo válido.');
    await db('mapa_lancamentos',{method:'PATCH',params:{id:`eq.${id}`,loja_id:`eq.${loja}`},body:{...patch,atualizado_em:new Date().toISOString()}});
    await audit(actor,'editar_mapa',{id,mapa:existente.mapa_nome,antes:{ean:existente.ean,lote:existente.lote,validade:existente.validade,quantidade:existente.quantidade},alterado:patch});return {sucesso:true};
  }
  if(req.method==='DELETE'){
    await db('mapa_lancamentos',{method:'DELETE',params:{id:`eq.${id}`,loja_id:`eq.${loja}`}});
    await audit(actor,'excluir_mapa',{id});return {sucesso:true};
  }
  throw bad('Método não permitido.',405);
}
async function stock(req,actor,pathname,body,query){
  const loja=actorLoja(actor,body.loja||query.get('loja'));
  if(req.method==='GET'){
    const r=await rows('estoque_saldos',{loja_id:`eq.${loja}`,select:'quantidade,atualizado_em,produtos(ean,codigo_interno,descricao,secao)',order:'atualizado_em.desc'},800,20);
    return {sucesso:true,registros:r.map(x=>({...x,...x.produtos,produtos:undefined}))};
  }
  admin(actor);
  if(!Array.isArray(body.itens)||body.itens.length>300)throw bad('Envie até 300 linhas por lote.');
  const produtos=body.itens.map(x=>({ean:norm(x.ean),codigo_interno:norm(x.codigo_interno)||null,descricao:norm(x.descricao),secao:norm(x.secao),atualizado_em:new Date().toISOString()}));
  if(produtos.some(x=>!eanValido(x.ean)))throw bad('EAN inválido no arquivo.');
  if(new Set(produtos.map(x=>x.ean)).size!==produtos.length)throw bad('O mesmo EAN aparece mais de uma vez neste lote. Corrija o arquivo.');
  // A importação atualiza somente os itens informados. Para zerar ausentes, utilizar conciliação explícita.
  await db('produtos',{method:'POST',params:{on_conflict:'ean'},body:produtos,prefer:'resolution=merge-duplicates,return=minimal'});
  const inEan=produtos.map(p=>`"${p.ean}"`).join(',');
  const existentes=await rows('produtos',{ean:`in.(${inEan})`,select:'id,ean'},500);
  const ids=new Map(existentes.map(p=>[p.ean,p.id]));
  const saldo=body.itens.map(x=>({loja_id:loja,produto_id:ids.get(norm(x.ean)),quantidade:Number(x.quantidade),origem:'procfit',atualizado_em:new Date().toISOString()}));
  if(saldo.some(x=>!Number.isFinite(x.quantidade)||x.quantidade<0||!x.produto_id))throw bad('Quantidade de estoque inválida.');
  await db('estoque_saldos',{method:'POST',params:{on_conflict:'loja_id,produto_id'},body:saldo,prefer:'resolution=merge-duplicates,return=minimal'});
  await audit(actor,'importar_estoque',{quantidade:saldo.length});return {sucesso:true,importados:saldo.length};
}
async function staff(req,actor,body,query){
  admin(actor);const loja=actor.perfil==='geral'?norm(body.loja||query.get('loja')):actor.loja_id;
  if(req.method==='GET'){
    const params={select:'id,nome,loja_id,perfil,especial,ativo,celular_proprio',order:'nome.asc'};
    if(actor.perfil!=='geral'||loja)params.loja_id=`eq.${loja}`;
    return {sucesso:true,usuarios:await rows('usuarios',params,200)};
  }
  const nome=norm(body.nome);
  if(req.method==='POST'){
    if(nome.length<2||nome.length>120)throw bad('Nome inválido.');
    if(specials.some(x=>normalizarNome(x)===normalizarNome(nome)))throw bad('Nome reservado para mapa especial.');
    const perfil=body.perfil||'funcionario';
    if(!['funcionario','admin','geral'].includes(perfil))throw bad('Perfil inválido.');
    if(perfil==='geral')geral(actor);
    else if(!loja)throw bad('Loja obrigatória.');
    const data={nome,nome_normalizado:normalizarNome(nome),loja_id:perfil==='geral'?null:loja,perfil,ativo:true,especial:body.especial===true,pin_hash:hashPin(body.pin)};
    const u=await db('usuarios',{method:'POST',body:data,prefer:'return=representation'});
    await audit(actor,'cadastrar_usuario',{id:u[0].id,nome});return {sucesso:true,usuario:cleanUser(u[0])};
  }
  const id=norm(body.id);const user=await one('usuarios',{id:`eq.${id}`});if(!user)throw bad('Usuário não encontrado.',404);
  if(actor.perfil!=='geral'&&(user.loja_id!==actor.loja_id||user.perfil==='geral'))throw bad('Acesso negado.',403);
  if(req.method==='PATCH'){
    const patch={};
    if(body.ativo!==undefined)patch.ativo=!!body.ativo;
    if(body.especial!==undefined)patch.especial=!!body.especial;
    if(body.celular_proprio!==undefined)patch.celular_proprio=!!body.celular_proprio;
    if(body.pin!==undefined)patch.pin_hash=hashPin(body.pin);
    if(body.nome!==undefined){if(specials.some(x=>normalizarNome(x)===normalizarNome(body.nome)))throw bad('Nome reservado para mapa especial.');patch.nome=norm(body.nome);patch.nome_normalizado=normalizarNome(body.nome);}
    if(body.perfil!==undefined){if(actor.perfil!=='geral'&&body.perfil==='geral')throw bad('Acesso negado.',403);patch.perfil=body.perfil;}
    if(!Object.keys(patch).length)throw bad('Nenhuma alteração.');
    await db('usuarios',{method:'PATCH',params:{id:`eq.${id}`},body:patch});
    if(body.ativo===false||body.pin!==undefined)await db('sessoes',{method:'DELETE',params:{usuario_id:`eq.${id}`}});
    await audit(actor,'editar_usuario',{id,campos:Object.keys(patch).filter(x=>x!=='pin_hash')});return {sucesso:true};
  }
  throw bad('Método não permitido.',405);
}
async function genericRecords(req,actor,body,query,table,extras={}) {
  const loja=actorLoja(actor,body.loja||query.get('loja'));
  if(req.method==='GET') {
    admin(actor);
    return {sucesso:true,registros:await rows(table,{[extras.lojaCol||'loja_id']:`eq.${loja}`,select:'*',order:'criado_em.desc'},700,10)};
  }
  admin(actor);
  if(req.method==='POST'){
    const payload={...body};delete payload.loja;delete payload.sessao;
    const allowed=extras.allowed||['ean','lote','validade','quantidade','motivo','observacao','romaneio','loja_origem','loja_destino','lancamento_id','estado','origem_mapa'];
    const data=Object.fromEntries(Object.entries(payload).filter(([k])=>allowed.includes(k)));
    data[extras.lojaCol||'loja_id']=loja;
    if(extras.usuarioCol!==false)data[extras.usuarioCol||'usuario_id']=actor.id;
    if(data.ean&&!eanValido(data.ean))throw bad('EAN inválido.');
    if(data.quantidade!==undefined&&(!Number.isInteger(Number(data.quantidade))||Number(data.quantidade)<1))throw bad('Quantidade inválida.');
    const r=await db(table,{method:'POST',body:data,prefer:'return=representation'});
    await audit(actor,'cadastrar_'+table,{id:r[0].id});return {sucesso:true,registro:r[0]};
  }
  if(req.method==='PATCH'){
    const atual=await one(table,{id:`eq.${body.id}`,[extras.lojaCol||'loja_id']:`eq.${loja}`});if(!atual)throw bad('Não encontrado.',404);
    const allowed=extras.patchAllowed||['estado','observacao'];const patch=Object.fromEntries(Object.entries(body).filter(([k])=>allowed.includes(k)));
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
    const [catalogo,migracao]=await Promise.all([
      rows('catalogo_pendencias',{status:'eq.pendente',select:'codigo_original,codigo_interno,descricao,secao,motivo,status',order:'importado_em.asc'},500,5),
      rows('migracao_pendencias',{status:'eq.pendente',select:'origem_migracao,tabela_origem,motivo,dados,status',order:'importado_em.asc'},500,5)
    ]);
    const visiveis=migracao.filter(x=>pendingVisible(actor,x));
    return {sucesso:true,catalogo,migracao:visiveis,totais:{catalogo:catalogo.length,migracao:visiveis.length}};
  }
  if(req.method!=='PATCH')throw bad('Método não permitido.',405);
  const tipo=norm(body.tipo),id=norm(body.id),entrada=body.correcao;
  if(!['catalogo','migracao'].includes(tipo)||!id||!entrada||typeof entrada!=='object'||Array.isArray(entrada))throw bad('Dados de correção inválidos.');
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

async function handle(req){
  const origin=req.headers.origin,host=req.headers.host;
  if(origin){let same=false;try{same=new URL(origin).host===host;}catch{}if(!same)throw bad('Origem não autorizada.',403);}
  const url=new URL(req.url,`https://${host||'localhost'}`);
  const query=url.searchParams;
  const candidate=norm(query.get('route'));
  const pathname=candidate && /^[a-z/]+$/i.test(candidate)?'/'+candidate:url.pathname.replace(/^\/api(?:\/index\.js)?/,'')||'/';
  if(req.method==='OPTIONS')return {sucesso:true};
  if(req.method!=='GET'&&Number(req.headers['content-length']||0)>2_000_000)throw bad('Solicitação muito grande.',413);
  const body=req.method==='GET'?{}:requestBody(req);
  if(pathname==='/health') {const configurado=!!(urlBase()&&secret());if(query.get('check')==='1'){if(!configurado)throw bad('Configuração Supabase ausente no Vercel.',503);await one('lojas',{select:'id'});return {sucesso:true,servico:'operacional',banco:'acessivel'};}return {sucesso:true,servico:'operacional',supabaseConfigurado:configurado};}
  if(pathname==='/login'&&req.method==='POST')return login(body);
  const {actor,sessao}=await authenticate(req);
  if(pathname==='/sessao'&&req.method==='GET')return {sucesso:true,usuario:cleanUser(actor)};
  if(pathname==='/logout'&&req.method==='POST'){
    await db('sessoes',{method:'DELETE',params:{token_hash:`eq.${sessao.token_hash}`}});return {sucesso:true};
  }
  if(pathname.startsWith('/produtos'))return produtos(req,actor,pathname,body,query);
  if(pathname.startsWith('/mapas'))return mapas(req,actor,pathname,body,query);
  if(pathname.startsWith('/estoque'))return stock(req,actor,pathname,body,query);
  if(pathname.startsWith('/usuarios'))return staff(req,actor,body,query);
  if(pathname==='/pendencias')return pendencias(req,actor,body,query);
  if(pathname==='/vencidos')return genericRecords(req,actor,body,query,'vencidos');
  if(pathname==='/queima')return genericRecords(req,actor,body,query,'queima',{patchAllowed:['estado','motivo']});
  if(pathname==='/sinalizacoes')return genericRecords(req,actor,body,query,'sinalizacoes',{usuarioCol:'atualizado_por'});
  if(pathname==='/transferencias')return genericRecords(req,actor,body,query,'transferencias',{lojaCol:'loja_destino',allowed:['ean','lote','validade','quantidade','romaneio','loja_origem']});
  if(pathname==='/auditoria'&&req.method==='GET'){
    admin(actor);const loja=actorLoja(actor,query.get('loja'));return {sucesso:true,registros:await rows('auditoria',{loja_id:`eq.${loja}`,select:'id,acao,dados,criado_em,usuario_id',order:'criado_em.desc'},500,2)};
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
