import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import handler from '../api/index.js';
const code=readFileSync(new URL('../public/assets/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const sql=readFileSync(new URL('../supabase/004_painel_conferente.sql',import.meta.url),'utf8');
const yaml=readFileSync(new URL('../.github/workflows/migracao-supabase.yml',import.meta.url),'utf8');
const admin={id:'11111111-1111-4111-8111-111111111111',nome:'Admin Teste',nome_normalizado:'admin teste',perfil:'admin',loja_id:'151',ativo:true};
const geral={...admin,id:'22222222-2222-4222-8222-222222222222',perfil:'geral',loja_id:null};
const sessao={token_hash:'key',usuario_id:admin.id,expira_em:new Date(Date.now()+86400000).toISOString(),ultima_atividade:new Date().toISOString(),manter_conectado:true};
const auth={authorization:'Bearer '+('a'.repeat(64)),host:'localhost'};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});}
async function invoke(url,method='GET',body={},actor=admin){
 const old=global.fetch,envUrl=process.env.SUPABASE_URL,envKey=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_TEST';
 const operations=[];
 global.fetch=async(uri,opt={})=>{
  const path=new URL(uri).pathname.split('/').pop();operations.push([path,opt.method||'GET']);
  if(path==='sessoes')return json([sessao]);
  if(path==='usuarios')return json([actor]);
  if(path==='lojas')return json([{id:'151',nome:'Loja 151'}]);
  return json([]);
 };
 try{return await new Promise(resolve=>{const req={url,method,body,headers:auth};const res={statusCode:200,setHeader(){},end(txt){resolve({status:this.statusCode,body:JSON.parse(txt),operations});}};handler(req,res);});}
 finally{global.fetch=old;if(envUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=envUrl;if(envKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=envKey;}
}
test('perfil administrativo por loja não cria administradores nem usa painel geral',async()=>{
 const a=await invoke('/api/usuarios','POST',{nome:'Novo Admin',perfil:'admin',pin:'123456'});
 assert.equal(a.status,403);assert.equal(a.operations.some(([n,m])=>n==='usuarios'&&m==='POST'),false);
 const b=await invoke('/api/geral');assert.equal(b.status,403);
});
test('administrador geral pode consultar painel geral',async()=>{
 const r=await invoke('/api/geral','GET',{},geral);assert.equal(r.status,200);assert.equal(r.body.lojas[0].id,'151');
});
test('frontend segmenta menus e permite recolher, modal de lançamento e senha por perfil',()=>{
 assert.match(code,/const menusGeral=/);assert.match(code,/isGeral\(\)\?menusGeral/);
 assert.match(code,/sidebar-collapsed/);assert.match(code,/function openPinReset/);
 assert.match(code,/async function abrirNovoLancamento/);
 assert.match(html,/id="launch-dialog"/);assert.match(html,/id="sidebar-collapse"/);
 assert.match(code,/input\.readOnly=valid/);
});
test('migração do banco inclui operações transacionais sem sobrescrever originais',()=>{
 assert.match(sql,/function public.encaminhar_mapa/);assert.match(sql,/for update/);
 assert.match(sql,/function public.relancar_queima/);
 assert.match(sql,/add column if not exists situacao/);
 assert.match(yaml,/atualizar_painel/);assert.match(yaml,/004_painel_conferente\.sql/);
});
test('telas antigas possuem substitutos com filtros e exportação',()=>{
 for(const name of ['controleValidade','perdas','dashboard','mapas','produtos','notificacoes','administradoresGeral'])assert.match(code,new RegExp(`function ${name}\\(`));
 assert.match(code,/exportCsv/);assert.match(code,/printableTable/);
 assert.match(code,/data-relaunch/);assert.match(code,/data-approve/);
 assert.match(code,/lerODS/);
});
