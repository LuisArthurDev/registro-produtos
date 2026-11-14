import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import handler from '../api/index.js';
import {TAM_LOTE_QUEIMA,dividirQueimaEmLotes,executarQueimaEmLotes} from '../public/assets/queima-conciliacao-lotes.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const staffId='33333333-3333-4333-8333-333333333333',adminId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',otherId='44444444-4444-4444-8444-444444444444';
const mapId='11111111-1111-4111-8111-111111111111',otherMap='22222222-2222-4222-8222-222222222222',specialMap='55555555-5555-4555-8555-555555555555';
const ean='07898962711477';
const mapa=(id,nome,funcionario_id,tipo_mapa='funcionario')=>({id,loja_id:'151',mapa_nome:nome,tipo_mapa,funcionario_id,ean,validade:'2026-11-30',excluido_em:null,produtos:{secao:'HIGIENE',grupo:'HIGIENE',formula_especial:false}});
const q=(id,props)=>({id,loja_id:'151',ean,validade:'2026-11-30',lote:'A',quantidade:3,estado:'aprovado',criado_em:'2026-11-12T12:00:00Z',excluido_em:null,produto_relatorio:'Sabonete',origem_mapa:'Isabela',...props});
const list=[
 q('a1',{lancamento_id:mapId,origem_mapa:'Isabela'}),
 q('a2',{lancamento_id:otherMap,origem_mapa:'Ana'}),
 q('a3',{responsavel_importacao_id:staffId,origem_mapa:'Relatório Procfit (sem lote/registro)',lancamento_id:null}),
 q('a4',{estado:'pendente',lancamento_id:mapId}),
 q('a5',{loja_id:'152',lancamento_id:mapId}),
 q('a6',{responsavel_importacao_id:otherId,origem_mapa:'Isabela',lancamento_id:mapId}),
 q('a7',{lancamento_id:specialMap,origem_mapa:'Estoque'})
];
async function doRequest(path,role='funcionario'){
 const token='5'.repeat(64),sha=createHash('sha256').update(token).digest('hex');
 const backup=globalThis.fetch,base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;const calls=[];
 process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_test';
 globalThis.fetch=async(url,opts={})=>{
  const u=new URL(url),table=u.pathname.split('/rest/v1/')[1];calls.push({table,params:u.searchParams});let result=[];
  if(table==='sessoes')result=[{token_hash:sha,usuario_id:role==='admin'?adminId:staffId,expira_em:'2099-01-01T00:00:00Z',ultima_atividade:new Date().toISOString()}];
  if(table==='usuarios')result=[{id:role==='admin'?adminId:staffId,perfil:role,loja_id:'151',nome:role==='admin'?'Administrador':'Isabela',nome_normalizado:role==='admin'?'administrador':'isabela',ativo:true}];
  if(table==='mapa_lancamentos'){
   const all=[mapa(mapId,'Isabela',staffId),mapa(otherMap,'Ana',otherId),mapa(specialMap,'Estoque',null,'Estoque')];
   result=all.filter(m=>{
    const nome=u.searchParams.get('mapa_nome'),tipo=u.searchParams.get('tipo_mapa');
    return (!nome||nome==='eq.'+m.mapa_nome)&&(!tipo||tipo==='eq.'+m.tipo_mapa||tipo.startsWith('in.')&&m.tipo_mapa==='Estoque');
   });
  }
  if(table==='queima'){
   result=list.filter(rec=>{
    const id=u.searchParams.get('lancamento_id'),dono=u.searchParams.get('responsavel_importacao_id'),origem=u.searchParams.get('origem_mapa'),status=u.searchParams.get('estado'),loja=u.searchParams.get('loja_id');
    return (!id||id.startsWith('in.')&&id.includes(rec.lancamento_id)||id==='eq.'+rec.lancamento_id)
     &&(!dono||dono==='eq.'+rec.responsavel_importacao_id)&&(!origem||origem==='eq.'+rec.origem_mapa)
     &&(!status||status==='eq.'+rec.estado)&&(!loja||loja==='eq.'+rec.loja_id);
   });
  }
  if(table==='produtos')result=[{ean,descricao:'Sabonete 90g',codigo_interno:'111'}];
  return new Response(JSON.stringify(result),{status:200,headers:{'content-type':'application/json'}});
 };
 try{
  const res={statusCode:200,setHeader(){},end(txt){this.data=JSON.parse(txt)}};
  await handler({method:'GET',url:'/api'+path,headers:{host:'test.local',authorization:'Bearer '+token},body:{}},res);
  return {res,calls};
 }finally{globalThis.fetch=backup; if(base===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=base;
 if(key===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=key;}
}
test('Visualização tem somente Mapa e os três modos; sem tabs de retirados/sinalizações para qualquer perfil',()=>{
 const code=read('public/assets/visualizacao.js');const tabs=[...code.matchAll(/data-view-tab="([^"]+)"/g)].map(x=>x[1]);
 const modes=[...code.matchAll(/data-view-mode="([^"]+)"/g)].map(x=>x[1]);
 assert.deepEqual(tabs,['mapas']);assert.deepEqual(modes,['mes','validade','queima']);
 assert.match(code,/id="view-queima-alert"/);assert.match(code,/quantidade informada na Queima pode estar incorreta/);
 assert.match(code,/request\('\/visualizacao\/queima-aprovados'/);assert.doesNotMatch(code,/data-view-tab="vencidos"|data-view-tab="sinalizacoes"/);
 assert.doesNotMatch(code,/data-approve=|data-edit-burn=/);
});
test('Funcionária recebe só seus aprovados do mapa + seus importados atribuídos; nunca os de outra loja ou pessoa',async()=>{
 const {res,calls}=await doRequest('/visualizacao/queima-aprovados');assert.equal(res.statusCode,200,JSON.stringify(res.data));
 assert.deepEqual(res.data.registros.map(x=>x.id).sort(),['a1','a3'].sort());
 assert.match(res.data.aviso,/quantidade/i);
 const queries=calls.filter(c=>c.table==='queima');assert.ok(queries.length>0);
 assert.ok(queries.every(c=>c.params.get('loja_id')==='eq.151'&&c.params.get('estado')==='eq.aprovado'));
});
test('Administrador vê aprovados das abas especiais, sem acesso aos mapas dos funcionários',async()=>{
 const {res}=await doRequest('/visualizacao/queima-aprovados','admin');assert.equal(res.statusCode,200,JSON.stringify(res.data));
 assert.deepEqual(res.data.registros.map(x=>x.id),['a7']);
 const denied=await doRequest('/visualizacao/queima-aprovados?mapa=Isabela','admin');assert.equal(denied.res.statusCode,403);
});
test('Edição de aprovado recebe as duas validades independentes, sem corrigir pelo XLSX',()=>{
 const js=read('public/assets/app.js'),api=read('api/index.js'),sql=read('supabase/030_conciliacao_queima_indice_lotes_editar_validade.sql');
 assert.match(js,/Validade do Produto<input name="validade" type="date" required/);
 assert.match(js,/Validade da Gôndola<input name="validade_gondola" type="date" required/);
 assert.match(js,/validade:form\.elements\.validade\.value,validade_gondola:form\.elements\.validade_gondola\.value/);
 assert.match(api,/if\(!dataValida\(validade\)\)throw bad\('Informe uma validade válida para o produto/);
 assert.match(api,/if\(!dataValida\(validadeGondola\)\)throw bad\('Informe uma validade válida para a gôndola/);
 assert.match(api,/antes:\{quantidade:atual\.quantidade,validade:atual\.validade,validade_gondola:/);
 assert.match(sql,/OLD\.estado='aprovado' AND NEW\.estado='aprovado'/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.bloquear_queima_vencida_v40/);
});
test('SQL030 otimiza catálogo para um lote de 10 e preserva apenas novas aprovações',()=>{
 const sql=read('supabase/030_conciliacao_queima_indice_lotes_editar_validade.sql');
 assert.equal(TAM_LOTE_QUEIMA,10);assert.deepEqual(dividirQueimaEmLotes(Array.from({length:23},(_,i)=>i)).map(x=>x.length),[10,10,3]);
 for(const field of ['idx_queima_busca_ativos_validade_v51','idx_queima_busca_excluidos_validade_v51',
    'idx_queima_codigo_normalizado_v51','tmp_queima_codigos_v51',
    "jsonb_array_length(p_itens) NOT BETWEEN 1 AND 10",'p_corrigir_aprovados IS TRUE','q.id=t.criado_id'])assert.ok(sql.includes(field),field);
 assert.doesNotMatch(sql,/q\.ean IN \(SELECT p\.ean FROM public\.produtos/);
 assert.match(sql,/IF NOT p_simular THEN/);
 assert.match(sql,/NEW\.validade <= \(now\(\) AT TIME ZONE 'America\/Sao_Paulo'\)::date/);
 const wf=read('.github/workflows/migracao-supabase.yml');assert.match(wf,/queima_timeout_e_validade_v51/);
 assert.match(wf,/supabase\/030_conciliacao_queima_indice_lotes_editar_validade\.sql/);
 assert.match(read('public/sw.js'),/registro-validades-v54-importacao-historica-grupos/);
});

test('Timeout SQL 57014 reduz progressivamente o lote sem perder linhas, na prévia e na confirmação',async()=>{
 for(const simular of [true,false]){
  const chamadas=[];const data=Array.from({length:10},(_,i)=>({linha:i+4}));
  const resumo=await executarQueimaEmLotes(data,async lote=>{
   chamadas.push(lote.length);
   if(lote.length>2)throw new Error('Supabase (57014): statement timeout');
   return {resultado:{total_aprovados:lote.length,criados:simular?0:lote.length,
    contagem:{cadastrar_e_aprovar:lote.length},amostras:lote.map(x=>({linha:x.linha}))}};
  },{simular});
  assert.equal(resumo.total_aprovados,10);
  assert.equal(resumo.contagem.cadastrar_e_aprovar,10);
  assert.equal(resumo.criados,simular?0:10);
  assert.deepEqual(resumo.amostras.map(x=>x.linha),data.map(x=>x.linha));
  assert.ok(chamadas.includes(10)&&chamadas.includes(5)&&chamadas.includes(2));
 }
});
test('Erro diferente de 57014 não dispara repartição/retentativa automática do lote',async()=>{
 let count=0;
 await assert.rejects(()=>executarQueimaEmLotes(Array.from({length:10},()=>1),async()=>{count++;throw new Error('401: acesso negado');}),/acesso negado/);
 assert.equal(count,1);
});
