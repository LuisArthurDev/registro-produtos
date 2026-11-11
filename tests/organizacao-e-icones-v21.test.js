import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recomendacaoSecao} from '../public/assets/organizacao-secoes.js';
import {detectarAcao,classeDaAcao} from '../public/assets/icones-acoes.js';
const read=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
const app=read('public/assets/app.js'),api=read('api/index.js'),sql=read('supabase/013_organizacao_secoes.sql'),sqlMonth=read('supabase/014_mes_opcional_transferencias.sql'),css=read('public/assets/app.css'),workflow=read('.github/workflows/migracao-supabase.yml'),sw=read('public/sw.js');
const mockBtn={getAttribute:()=>'',attributes:[]};
test('ícones SVG locais atendem ações sem depender de CDN',()=>{
 assert.equal(detectarAcao('Editar',mockBtn),'edit');assert.equal(detectarAcao('Excluir',mockBtn),'delete');
 assert.equal(detectarAcao('Lançar no Queima',mockBtn),'fire');assert.equal(detectarAcao('Transferir lançamentos',mockBtn),'transfer');
 assert.equal(classeDaAcao('Excluir',mockBtn),'danger');
 assert.match(app,/instalarIconesDeAcao\(\)/);assert.match(css,/\.icon-action:focus-visible/);
 assert.match(sw,/icones-acoes\.js/);
});
test('menu mantém Seções imediatamente após Funcionários',()=>{
 assert.match(app,/\['usuarios','users','Funcionários'\],\['organizacao-secoes','board','Seções'\]/);
 assert.match(app,/case 'organizacao-secoes':if\(!isAdmin\(\)\)/);
});
test('organização recomenda quem possui mais registros na seção',()=>{
 const staff=[{id:'a',nome:'Ana'},{id:'b',nome:'Beatriz'}];
 const r=recomendacaoSecao('Perfumaria',[{chave:'perfumaria',funcionario_id:'a',registros:4,unidades:13},{chave:'PERFUMARIA',funcionario_id:'b',registros:6,unidades:6}],staff);
 assert.equal(r.principal.funcionario_id,'b');assert.equal(r.total,10);assert.equal(r.empate,false);
});
test('organização não indica líder em caso de empate e ignora funcionário inativo',()=>{
 const stats=[{chave:'PAPELARIA',funcionario_id:'a',registros:3,unidades:10},{chave:'PAPELARIA',funcionario_id:'b',registros:3,unidades:5},{chave:'PAPELARIA',funcionario_id:'c',registros:9,unidades:2}];
 const r=recomendacaoSecao('papelaria',stats,[{id:'a'},{id:'b'}]);
 assert.equal(r.empate,true);assert.equal(r.total,6);
});
test('SQL de organização é somente de leitura nos mapas e tem RLS',()=>{
 assert.match(sql,/create table if not exists public\.organizacao_secoes/);
 assert.match(sql,/alter table public\.organizacao_secoes enable row level security/);
 assert.match(sql,/where m\.loja_id=p_loja/);
 assert.doesNotMatch(sql,/update public\.mapa_lancamentos/i);
 assert.match(api,/organizarSecoes\(req,actor,body\)/);
});
test('mês opcional no formulário e na API, SQL deve preservar filtros e auditoria',()=>{
 assert.match(app,/Mês do lançamento \(opcional\)/);
 assert.match(api,/if\(!valor\)return null/);
 assert.match(api,/\.\.\.\(mes\?\{mes_lancamento:/);
 assert.match(sqlMonth,/p_mes IS NULL OR m\.mes_lancamento=p_mes/);
 assert.match(sqlMonth,/INSERT INTO public\.auditoria/);
 assert.match(sqlMonth,/IF qtd>2000 THEN RAISE EXCEPTION/);
 assert.match(workflow,/mes_opcional_transferencias/);
});
test('quadros das seções nunca transferem automaticamente lançamentos',()=>{
 const ui=read('public/assets/organizacao-secoes.js');
 assert.match(ui,/Nada é transferido, editado ou excluído dos lançamentos/);
 assert.doesNotMatch(ui,/request\('\/usuarios\/transferir'/);
 assert.match(ui,/data-org-select/);
 assert.match(ui,/dragstart/);
});
