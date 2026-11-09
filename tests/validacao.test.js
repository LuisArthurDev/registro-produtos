import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizarNome,eanValido,dataValida,hashPin,validarPin} from '../api/index.js';
import handler from '../api/index.js';

test('normalização de nomes e EAN com zeros à esquerda',()=>{
 assert.equal(normalizarNome('  Ana  CAROLÍNA '),'ana carolina');
 assert.equal(eanValido('0000000021406'),true);
 assert.equal(eanValido('5253066'),false);
 assert.equal(eanValido('789123456789012'),false);
});
test('validade sem dias inexistentes',()=>{
 assert.equal(dataValida('2028-02-29'),true);
 assert.equal(dataValida('2027-02-29'),false);
 assert.equal(dataValida('2026-11-09'),true);
});
test('hash do PIN impede comparação inválida',()=>{
 const hash=hashPin('123456');
 assert.equal(validarPin('123456',hash),true);
 assert.equal(validarPin('654321',hash),false);
 assert.equal(validarPin('123456','scrypt$invalido$'),false);
 assert.throws(()=>hashPin('1234'));
});
const mock = (url,method='GET',body=null,headers={}) => new Promise(resolve=>{
 const req={url,method,body,headers:{host:'localhost',...headers}};
 const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(body){resolve({status:this.statusCode,data:JSON.parse(body)});}};
 handler(req,res);
});
test('a API só divulga status sem segredos',async()=>{
 const resp=await mock('/api/health');
 assert.equal(resp.status,200);assert.equal(resp.data.sucesso,true);
 assert.equal(JSON.stringify(resp.data).includes('sb_secret_'),false);
});
test('rotas protegidas exigem sessão',async()=>{
 const resp=await mock('/api/mapas?loja=151');
 assert.equal(resp.status,401);
});
test('rota do redirecionamento Vercel usa parâmetro protegido',async()=>{
 const resp=await mock('/api/index.js?route=health');
 assert.equal(resp.status,200);
});
test('não aceita origem de terceiro',async()=>{
 const resp=await mock('/api/health','GET',null,{origin:'https://attacker.example'});
 assert.equal(resp.status,403);
});
test('RLS e segregação entre estoque Procfit e mapa especial',()=>{
 const sql=readFileSync(new URL('../supabase/001_schema.sql',import.meta.url),'utf8');
 assert.match(sql,/create table if not exists public\.estoque_saldos/);
 assert.match(sql,/create table if not exists public\.mapa_lancamentos/);
 assert.match(sql,/create or replace function public\.descer_estoque/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke execute on function public\.gravar_lancamento/);
});
test('GitHub Pages possui caminhos antigos e config editável',()=>{
 const html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
 assert.match(html,/lancamento\.html/);
 assert.match(html,/visualizacao\.html/);
 assert.match(html,/location\.replace/);
 assert.match(html,/config\.js/);
 assert.match(html,/Não transferimos query strings/);
});
