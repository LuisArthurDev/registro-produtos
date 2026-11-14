import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ordenarSugestoesQueima} from '../api/sugestoes-queima.js';
import handler from '../api/index.js';

const uuid=id=>id.repeat(8)+'-'+id.repeat(4)+'-4'+id.repeat(3)+'-8'+id.repeat(3)+'-'+id.repeat(12);
const alice=uuid('a'),bruna=uuid('b'),carlos=uuid('c'),dora=uuid('d');
const ad=uuid('f'),item=uuid('e');
const funcionario=(id,nome,extra={})=>({id,nome,perfil:'funcionario',ativo:true,excluido_em:null,...extra});
const usuarios=[funcionario(alice,'Alice'),funcionario(bruna,'Bruna'),funcionario(carlos,'Carlos'),funcionario(dora,'Dora', {ativo:false})];

test('ordena sugestões por EAN + validade, grupo organizado, outros vencimentos e grupo',()=>{
 const result=ordenarSugestoesQueima({funcionarios:usuarios,validadeProduto:'2026-12-30',
  responsavelGrupoId:bruna,
  mapasProduto:[{funcionario_id:alice,validade:'2026-12-30'},{funcionario_id:alice,validade:'2027-01-30'},
   {funcionario_id:carlos,validade:'2027-03-30'},{funcionario_id:dora,validade:'2026-12-30'}],
  mapasGrupo:[{funcionario_id:carlos},{funcionario_id:carlos},{funcionario_id:dora}]});
 assert.deepEqual(result.map(x=>x.nome),['Alice','Bruna','Carlos']);
 assert.equal(result[0].nivel,'Correspondência direta');
 assert.match(result[0].evidencias.join(' '),/mesmo EAN e validade/);
 assert.equal(result[1].nivel,'Organização do grupo');
 assert.equal(result[2].mesmoGrupo,2);
 assert.ok(!result.some(x=>x.id===dora),'funcionário inativo não pode ser sugerido');
});

test('sem correspondências não inventa indicação; nunca sugere IDs fora da equipe ativa',()=>{
 const result=ordenarSugestoesQueima({funcionarios:usuarios,mapasProduto:[{funcionario_id:'fora-da-loja',validade:'2026-12-30'}],responsavelGrupoId:'fora-da-loja'});
 assert.deepEqual(result,[]);
});

test('desempates são determinísticos e sugestões são limitadas',()=>{
 const result=ordenarSugestoesQueima({funcionarios:usuarios,mapasProduto:[
  {funcionario_id:alice,validade:'2027-01-01'}, {funcionario_id:bruna,validade:'2027-01-01'},
  {funcionario_id:carlos,validade:'2027-01-01'}],validadeProduto:'2026-12-01',limite:2});
 assert.deepEqual(result.map(x=>x.nome),['Alice','Bruna']);
});

const token='9'.repeat(64),hash=createHash('sha256').update(token).digest('hex');
function mock(role='admin',flags={}){
 const originalFetch=globalThis.fetch,originalUrl=process.env.SUPABASE_URL,originalKey=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://mock.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_fake';
 const calls=[];
 globalThis.fetch=async(url,opt={})=>{
  const target=new URL(url),table=target.pathname.split('/rest/v1/')[1],params=target.searchParams;
  calls.push({table,params,method:opt.method||'GET'});
  let data=[];
  if(table==='sessoes')data=[{token_hash:hash,usuario_id:ad,expira_em:'2099-01-01',ultima_atividade:new Date().toISOString(),manter_conectado:true}];
  else if(table==='usuarios'&&!params.has('perfil'))data=[{id:ad,nome:'Admin',perfil:role,loja_id:'151',ativo:true}];
  else if(table==='usuarios')data=usuarios;
  else if(table==='queima')data=flags.notEligible?[]:[{id:item,loja_id:'151',ean:'07898962711477',validade:'2026-12-30',estado:'aprovado',aprovado_via_importacao:true,sem_responsavel_importacao:true}];
  else if(table==='produtos'&&params.has('ean')&&params.get('ean').startsWith('eq.'))data=[{ean:'07898962711477',secao:'CONVENIENCIA',grupo:'DOCES'}];
  else if(table==='produtos')data=[{ean:'07898962711477'},{ean:'7898962711477'},{ean:'7891234567890'}];
  else if(table==='organizacao_grupos')data=[{responsavel_id:bruna,grupo:'DOCES'}];
  else if(table==='mapa_lancamentos'&&params.get('ean')?.startsWith('eq.'))data=[{funcionario_id:alice,ean:'07898962711477',validade:'2026-12-30'}];
  else if(table==='mapa_lancamentos')data=[{funcionario_id:carlos,ean:'7891234567890'}];
  return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
 };
 const request=async(path)=>{
  const res={statusCode:200,setHeader(){},end(s){this.value=JSON.parse(s);}};
  await handler({method:'GET',url:'/api'+path,headers:{host:'localhost',authorization:'Bearer '+token}},res);
  return res;
 };
 return {calls,request,restore(){globalThis.fetch=originalFetch;originalUrl===undefined?delete process.env.SUPABASE_URL:process.env.SUPABASE_URL=originalUrl;originalKey===undefined?delete process.env.SUPABASE_SECRET_KEY:process.env.SUPABASE_SECRET_KEY=originalKey;}};
}

test('API devolve candidatos da própria loja, com evidência e sem editar a Queima',async()=>{
 const m=mock();try{
  const r=await m.request(`/queima/sugestoes?id=${item}`);
  assert.equal(r.statusCode,200,JSON.stringify(r.value));
  assert.deepEqual(r.value.sugestoes.map(x=>x.id),[alice,bruna,carlos]);
  assert.equal(r.value.grupo,'DOCES');
  assert.ok(r.value.funcionarios.some(u=>u.id===alice));
  assert.ok(m.calls.every(c=>c.method==='GET'));
  for(const c of m.calls.filter(x=>['queima','usuarios','organizacao_grupos','mapa_lancamentos'].includes(x.table)&&x.table!=='usuarios'||x.table==='usuarios'&&x.params.has('perfil'))){
    assert.equal(c.params.get('loja_id'),'eq.151',`Escopo da loja ausente em ${c.table}`);
  }
  assert.ok(m.calls.filter(c=>c.table==='mapa_lancamentos').every(c=>c.params.get('tipo_mapa')==='eq.funcionario'&&c.params.get('excluido_em')==='is.null'));
 }finally{m.restore();}
});

test('API recusa funcionário, id inválido e item que deixou de estar sem responsável',async()=>{
 for(const [role,flags,path,code] of [
  ['funcionario',{},`/queima/sugestoes?id=${item}`,403],
  ['admin',{},'/queima/sugestoes?id=123',422],
  ['admin',{notEligible:true},`/queima/sugestoes?id=${item}`,409]]){
  const m=mock(role,flags);try{const r=await m.request(path);assert.equal(r.statusCode,code,JSON.stringify(r.value));
   assert.ok(!m.calls.some(c=>c.table==='organizacao_grupos'&&code!==200));
  }finally{m.restore();}
 }
});

test('frontend tem modal global e por produto, opção manual e confirmação antes da atribuição',()=>{
 const app=readFileSync(new URL('../public/assets/app.js',import.meta.url),'utf8');
 const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
 assert.match(app,/id="queima-sug-open"/);
 assert.match(app,/id="queima-sug-dialog"/);
 assert.match(app,/data-suggest-burn="\$\{H\(r\.id\)\}"/);
 assert.match(app,/id="queima-sug-list"/);
 assert.match(app,/id="queima-sug-select"/);
 assert.match(app,/Escolher funcionário/);
 assert.match(app,/confirmDialog\('Confirmar atribuição'/);
 assert.match(app,/acao:'atribuir_importacao'/);
 assert.match(sw,/registro-validades-v50-procfit-todos-s-novos/);
});
