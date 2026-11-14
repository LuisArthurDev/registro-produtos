import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import handler from '../api/index.js';
import {interpretarRelatorioQueimaLinhas} from '../public/assets/queima-relatorio-xlsx.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/029_importacao_queima_todos_s_sem_preco.sql');
const ui=read('public/assets/app.js');
const api=read('api/index.js');
const cab={linha:3,colunas:['Data','Produto','Regional','Loja','Usuário','Curva','Data da Aprovação','Data de Validade','Aproado','Unidade','Valor Total','Preço']};
const R=(linha,B,H,I,J,L)=>({linha,colunas:['46340',B,'','V151 - Loja','','','',H,I,J,'',L]});
const rows=[cab,
 R(4,'11123 - PRODUTO SEM PREÇO','47000','S','4',''),
 R(5,'99999 - NÃO EXISTE NO CATÁLOGO','47000','S','2','abc'),
 R(6,'2222 - QUANTIDADE DESCONHECIDA','47000','S','','2.75'),
 R(7,'333 - PRODUTO VENCIDO','43000','S','7','1.75'),
 R(8,'444 - PRODUTO NÃO APROVADO','47000','N','9','6.50'),
 R(9,'PRODUTO SEM CÓDIGO','47000','S','1',''),
 R(10,'','47000','S','1',''),
 R(11,'555 - DATA AUSENTE','','S','1','2.20')
];

test('Leitor preserva TODOS os S, inclusive sem preço, código, quantidade ou data',()=>{
 const d=interpretarRelatorioQueimaLinhas(rows,{loja:'151'});
 assert.equal(d.resumo.aprovados,7);assert.equal(d.resumo.nao_aprovados,1);
 assert.equal(d.itens.length,7);
 assert.deepEqual(d.itens.map(x=>x.linha),[4,5,6,7,9,10,11]);
 assert.equal(d.itens[0].preco_gondola,null);
 assert.equal(d.itens[1].preco_gondola,null);
 assert.equal(d.itens[2].quantidade,0);assert.equal(d.itens[2].quantidade_pendente,true);
 assert.equal(d.itens[4].codigo_interno,null);
 assert.equal(d.itens[4].produto_relatorio,'PRODUTO SEM CÓDIGO');
 assert.equal(d.itens[5].produto_relatorio,'');
 assert.equal(d.itens[6].validade,null);
 assert.ok(!d.itens.some(x=>x.linha===8),'N nunca deve ser importado');
});

test('Preço e quantidade podem mudar entre importações sem alterar o identificador da origem',()=>{
 const d=interpretarRelatorioQueimaLinhas(rows);
 const other=rows.map(r=>({...r,colunas:[...r.colunas]}));other[1].colunas[9]='27';other[1].colunas[11]='34,70';
 const e=interpretarRelatorioQueimaLinhas(other);
 assert.equal(d.itens[0].ocorrencia,e.itens[0].ocorrencia);
 assert.equal(d.itens[0].produto_relatorio,e.itens[0].produto_relatorio);
});

test('SQL aceita EAN, preço e quantidade ausentes somente para origem Procfit identificada',()=>{
 assert.match(sql,/ALTER TABLE public\.queima ALTER COLUMN ean DROP NOT NULL/);
 assert.match(sql,/CHECK \(ean IS NOT NULL OR \(origem_relatorio_chave IS NOT NULL AND/);
 assert.match(sql,/ADD COLUMN IF NOT EXISTS codigo_interno text/);
 assert.match(sql,/ADD COLUMN IF NOT EXISTS descricao_original text/);
 assert.match(sql,/ADD COLUMN IF NOT EXISTS quantidade_pendente boolean/);
 assert.match(sql,/NULL::text AS ean/);
 assert.match(sql,/t\.n_catalogo IS DISTINCT FROM 1/);
 assert.match(sql,/preco_gondola=CASE WHEN t\.preco_gondola BETWEEN 0 AND 9999999999\.99 THEN t\.preco_gondola ELSE NULL END/);
 assert.match(sql,/NOT coalesce\(t\.quantidade BETWEEN 1 AND 999999,false\)/);
 assert.match(sql,/NEW\.aprovado_via_importacao IS TRUE AND NEW\.origem_relatorio_chave IS NOT NULL/);
 assert.match(sql,/NEW\.origem_mapa='Relatório Procfit \(sem lote\/registro\)'/);
});

test('Somente a importação Procfit tem corte amanhã; lançamentos manuais mantêm +7 dias',()=>{
 assert.match(sql,/NEW\.validade <= \(now\(\) AT TIME ZONE 'America\/Sao_Paulo'\)::date/);
 assert.match(sql,/NEW\.validade < \(\(now\(\) AT TIME ZONE 'America\/Sao_Paulo'\)::date \+ 7\)/);
 assert.match(sql,/SET acao='sem_validade'/);
 assert.match(sql,/SET acao='vencido'/);
 assert.match(sql,/t\.validade <= \(now\(\) AT TIME ZONE 'America\/Sao_Paulo'\)::date/);
 assert.doesNotMatch(sql,/SET acao='sem_preco'|SET acao='sem_catalogo'|SET acao='prazo_insuficiente'|SET acao='formula_especial'|SET acao='aba_especial'/);
});

test('Conferência de novos não altera quantidade/preço/validade de lançamentos anteriores',()=>{
 assert.match(sql,/SET acao='ja_existente'/);
 assert.match(sql,/SET acao='ja_conciliado'/);
 assert.match(sql,/SET acao='ja_excluido'/);
 assert.match(sql,/UPDATE public\.queima q SET estado='aprovado'/);
 assert.match(sql,/WHERE q\.id=t\.criado_id AND q\.loja_id=p_loja_id AND q\.estado='pendente'/);
 assert.match(sql,/ON CONFLICT \(loja_id,origem_relatorio_chave\)/);
 assert.match(sql,/IF NOT p_simular THEN/);
 assert.match(sql,/CREATE TEMP TABLE tmp_queima_relatorio_v48 ON COMMIT DROP/);
 assert.match(sql,/jsonb_array_length\(p_itens\) NOT BETWEEN 1 AND 40/);
});

test('Interface mantém Primeira importação, edição manual e resumos de itens vencidos/sem validade',()=>{
 assert.match(ui,/id="queima-relatorio-primeira"/);
 assert.match(ui,/id="queima-relatorio-primeira-open"/);
 assert.match(ui,/Todos os itens S ainda não lançados serão cadastrados e aprovados/);
 assert.match(ui,/sem preço serão cadastradas sem esse valor/);
 assert.match(ui,/c\.vencido\|\|0/);
 assert.match(ui,/c\.sem_validade\|\|0/);
 assert.match(ui,/acao:'editar_aprovado'/);
 assert.match(api,/quantidade_pendente:manterQuantidadePendente/);
 assert.doesNotMatch(ui,/id="queima-relatorio-corrigir"/);
});

function env(){
 const old=globalThis.fetch,oldURL=process.env.SUPABASE_URL,oldSec=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_test';
 const token='f'.repeat(64),hash=createHash('sha256').update(token).digest('hex'),actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const calls=[];
 globalThis.fetch=async(u,o={})=>{
  const table=new URL(u).pathname.split('/rest/v1/')[1];const body=o.body?JSON.parse(o.body):null;calls.push({table,body});
  let data=[];
  if(table==='sessoes')data=[{token_hash:hash,usuario_id:actor,expira_em:'2099-01-01T00:00:00Z',ultima_atividade:new Date().toISOString()}];
  else if(table==='usuarios')data=[{id:actor,nome:'Admin',loja_id:'151',perfil:'admin',ativo:true}];
  else if(table==='rpc/conciliar_queima_relatorio_v43')data={total_aprovados:body.p_itens.length,simulacao:body.p_simular,contagem:{cadastrar_e_aprovar:body.p_itens.length}};
  return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
 };
 return {calls,async call(items,simular=true){const res={statusCode:200,setHeader(){},end(t){this.data=JSON.parse(t)}};
  await handler({url:'/api/index.js?route=queima/conciliar-relatorio',method:'POST',headers:{authorization:'Bearer '+token,host:'test.local'},body:{itens:items,primeira_carga:true,corrigir_aprovados:false,simular}},res);return res;},restore(){globalThis.fetch=old;oldURL===undefined?delete process.env.SUPABASE_URL:process.env.SUPABASE_URL=oldURL;oldSec===undefined?delete process.env.SUPABASE_SECRET_KEY:process.env.SUPABASE_SECRET_KEY=oldSec;}};
}

test('API envia linhas S sem preço/catálogo/quantidade e sem data para classificação SQL',async()=>{
 const e=env();try{
  const parsed=interpretarRelatorioQueimaLinhas(rows,{loja:'151'});
  const r=await e.call(parsed.itens,true);assert.equal(r.statusCode,200,JSON.stringify(r.data));
  const rpc=e.calls.find(x=>x.table==='rpc/conciliar_queima_relatorio_v43');
  assert.equal(rpc.body.p_itens.length,7);
  assert.equal(rpc.body.p_simular,true);
  assert.equal(rpc.body.p_itens[0].preco_gondola,null);
  assert.equal(rpc.body.p_itens[2].quantidade,0);
  assert.equal(rpc.body.p_itens.at(-1).validade,null);
  assert.equal(rpc.body.p_itens[4].codigo_interno,null);
  assert.equal(rpc.body.p_itens[4].produto_relatorio,'PRODUTO SEM CÓDIGO');
 }finally{e.restore();}
});

test('SQL 029 é etapa independente no workflow; API contém módulo Sugestões necessário para login',()=>{
 const workflow=read('.github/workflows/migracao-supabase.yml');
 assert.match(workflow,/queima_todos_s_nao_vencidos_v50/);
 assert.match(workflow,/supabase\/029_importacao_queima_todos_s_sem_preco\.sql/);
 assert.match(api,/sugestoes-queima\.js/);
 assert.match(read('public/sw.js'),/registro-validades-v55-atribuicao-por-secao/);
});
