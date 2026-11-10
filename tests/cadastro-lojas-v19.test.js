import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import handler,{ hashPin } from '../api/index.js';

const token='a'.repeat(64), tokenHash=createHash('sha256').update(token).digest('hex');
const accountId='11111111-1111-4111-8111-111111111111';
const frontend=readFileSync(new URL('../public/assets/app.js',import.meta.url),'utf8');
const prior=Object.fromEntries(['SUPABASE_URL','SUPABASE_SECRET_KEY'].map(k=>[k,process.env[k]]));
process.env.SUPABASE_URL='https://fake.supabase.co';
process.env.SUPABASE_SECRET_KEY='sb_secret_test';

function mock({profile='admin',asGeral=true,duplo=true,forceRace=false}={}){
  const old=globalThis.fetch;
  const calls=[];
  const lojas=[{id:'151',nome:'Loja 151'},{id:'200',nome:'Loja 200'}];
  const usuario={id:accountId,nome:'Luis Arthur',loja_id:'151',perfil:profile,acesso_geral:duplo,ativo:true,pin_hash:hashPin('123456')};
  const sessao={usuario_id:accountId,token_hash:tokenHash,expira_em:'2099-01-01T00:00:00Z',ultima_atividade:new Date().toISOString(),manter_conectado:true,modo_acesso:asGeral?'geral':'admin',modo_expira_em:asGeral?'2099-01-01T00:00:00Z':null};
  globalThis.fetch=async (url,opts={})=>{
    const target=new URL(url);const table=target.pathname.split('/rest/v1/')[1],method=opts.method||'GET';
    const body=opts.body?JSON.parse(opts.body):null;
    calls.push({table,method,body,params:target.searchParams});
    let output=[];
    if(table==='sessoes')output=[sessao];
    if(table==='usuarios')output=method==='GET'?[usuario]:null;
    if(table==='lojas'){
      if(method==='GET'){
        const requested=target.searchParams.get('id');
        output=requested?lojas.filter(v=>v.id===requested.replace('eq.','')):lojas;
      }else if(method==='POST'){
        if(forceRace||lojas.some(l=>l.id===body.id))output=[];
        else{const add={id:body.id,nome:body.nome};lojas.push(add);output=[add];}
      }
    }
    if(table==='auditoria')output=null;
    return {ok:true,status:200,text:async()=>JSON.stringify(output)};
  };
  const request=async (method,route,body={})=>{
    const res={statusCode:0,setHeader(){},end(v){this.data=JSON.parse(v);}};
    await handler({url:'/api/index.js?route='+route.replace(/^\//,''),method,headers:{authorization:'Bearer '+token,host:'example.test'},body},res);
    return res;
  };
  return {request,calls,lojas,restore(){globalThis.fetch=old;}};
}

test('Painel Geral agrega todas lojas sem restringir à Loja 151 e mantém a loja de origem no perfil',async()=>{
  const t=mock();try{
    const r=await t.request('GET','/geral');
    assert.equal(r.statusCode,200);
    assert.equal(r.data.lojas.length,2);
    assert.deepEqual(r.data.lojas.map(x=>x.id),['151','200']);
    const lojasQuery=t.calls.find(x=>x.table==='lojas'&&x.method==='GET');
    assert.equal(lojasQuery.params.get('loja_id'),null);
  }finally{t.restore();}
});
test('Modo Geral com conta de origem 151 pode cadastrar loja 152, sem atualizar a conta',async()=>{
  const t=mock();try{
    const r=await t.request('POST','/geral/lojas',{codigo:'152',nome:'  Loja 152   Centro '});
    assert.equal(r.statusCode,200);assert.deepEqual(r.data.loja,{id:'152',nome:'Loja 152 Centro'});
    assert.ok(t.lojas.some(x=>x.id==='152'));
    assert.deepEqual(t.calls.filter(x=>x.table==='usuarios'&&x.method!=='GET'),[]);
    const audit=t.calls.find(x=>x.table==='auditoria');
    assert.equal(audit.body.loja_id,null);
    assert.equal(audit.body.usuario_id,accountId);
    assert.equal(audit.body.acao,'cadastrar_loja_geral');
  }finally{t.restore();}
});
test('Administrador de loja sem elevação não cadastra lojas',async()=>{
  const t=mock({asGeral:false});try{
    const r=await t.request('POST','/geral/lojas',{codigo:'152',nome:'Loja Nova'});
    assert.equal(r.statusCode,403);assert.ok(!t.calls.some(x=>x.table==='lojas'&&x.method==='POST'));
  }finally{t.restore();}
});
test('Administrador sem acesso duplo não pode cadastrar nem com flag de sessão geral',async()=>{
  const t=mock({duplo:false});try{
    const r=await t.request('POST','/geral/lojas',{codigo:'152',nome:'Loja Nova'});
    assert.equal(r.statusCode,403);
  }finally{t.restore();}
});
test('Funcionário não tem permissão no Painel Geral',async()=>{
  const t=mock({profile:'funcionario'});try{
    const r=await t.request('POST','/geral/lojas',{codigo:'152',nome:'Loja Nova'});
    assert.equal(r.statusCode,403);
  }finally{t.restore();}
});
test('Loja duplicada retorna conflito e não altera nome cadastrado',async()=>{
  const t=mock();try{
    const r=await t.request('POST','/geral/lojas',{codigo:'151',nome:'Nome modificado'});
    assert.equal(r.statusCode,409);assert.equal(t.lojas[0].nome,'Loja 151');
    assert.ok(!t.calls.some(x=>x.table==='lojas'&&x.method==='POST'));
  }finally{t.restore();}
});
test('Concorrência: ON CONFLICT ignora duplicata criada entre verificação e gravação',async()=>{
  const t=mock({forceRace:true});try{
    const r=await t.request('POST','/geral/lojas',{codigo:'152',nome:'Loja Nova'});
    assert.equal(r.statusCode,409);
    const post=t.calls.find(x=>x.table==='lojas'&&x.method==='POST');
    assert.equal(post.params.get('on_conflict'),'id');
    assert.ok(!t.calls.some(x=>x.table==='auditoria'));
  }finally{t.restore();}
});
test('Código ou nome inválido não cria loja',async()=>{
  const t=mock();try{
    for(const x of [{codigo:'151;drop',nome:'Qualquer'},{codigo:'9999999999999',nome:'Loja'},{codigo:'152',nome:'a'},{codigo:'',nome:'Loja'}]){
      const r=await t.request('POST','/geral/lojas',x);
      assert.equal(r.statusCode,422);
    }
    assert.ok(!t.calls.some(x=>x.table==='lojas'&&x.method==='POST'));
  }finally{t.restore();}
});
test('Painel Geral oferece Cadastrar loja e formulário com retorno à lista',()=>{
  assert.match(frontend,/id="geral-store-new"/);
  assert.match(frontend,/id="geral-store-form"/);
  assert.match(frontend,/request\('\/geral\/lojas',\{method:'POST'/);
  assert.match(frontend,/renderRoute\('painel-geral'\)/);
  assert.match(frontend,/lojas\.map\(l=>`<option value=/);
});
