import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {lerArquivoQueimaXls,registroDaQueimaNome,vencidoParaQueima} from '../public/assets/queima-xls.js';
import {hojeSaoPaulo,validadeVencidaParaQueima} from '../api/index.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Nome do arquivo define Registro; rejeita nomes e extensões errados',()=>{
 assert.equal(registroDaQueimaNome('Queima-166240.xls'),'166240');
 assert.equal(registroDaQueimaNome('Queima-001234 (1).xls'),'001234');
 for(const name of ['Produto.xls','Queima-outro.xls','Queima-166240.xlsx','Queima-166240.xls.exe'])assert.throws(()=>registroDaQueimaNome(name),/nome do arquivo/);
});
test('Regra de vencimento: dia anterior bloqueado, hoje permitido, amanhã permitido',()=>{
 assert.equal(vencidoParaQueima('2026-11-13','2026-11-14'),true);
 assert.equal(vencidoParaQueima('2026-11-14','2026-11-14'),false);
 assert.equal(vencidoParaQueima('2026-11-15','2026-11-14'),false);
 assert.equal(validadeVencidaParaQueima('2026-11-13','2026-11-14'),true);
 assert.equal(validadeVencidaParaQueima('2026-11-14','2026-11-14'),false);
 assert.equal(validadeVencidaParaQueima('2026-11-15','2026-11-14'),false);
 assert.equal(validadeVencidaParaQueima('2026-02-30','2026-11-14'),true);
 assert.equal(hojeSaoPaulo(new Date('2026-11-14T02:00:00Z')),'2026-11-13');
 assert.equal(hojeSaoPaulo(new Date('2026-11-14T05:00:00Z')),'2026-11-14');
});
test('XLS anexado: 100 linhas, Registro 166240, duplicidades preservadas, EAN resolvido depois',()=>{
 const path='/mnt/data/Queima-166240.xls';
 if(!existsSync(path))return; // o repositório não publica o XLS operacional do usuário.
 const b=readFileSync(path),r=lerArquivoQueimaXls(b,'Queima-166240.xls');
 assert.equal(r.registro,'166240');assert.equal(r.itens.length,100);
 assert.equal(r.itens.reduce((n,x)=>n+x.quantidade,0),260);
 assert.deepEqual(r.itens.slice(0,2).map(x=>[x.codigo_interno,x.lote,x.validade,x.quantidade,x.linha]),[
  ['93301','17316','2026-11-28',1,2],['93301','17316','2026-11-28',1,3]]);
 assert.equal(r.itens.find(x=>x.codigo_interno==='122405').validade,'2026-11-30');
 assert.equal(r.itens.filter(x=>x.ean).length,0);
 assert.equal(r.itens.filter(x=>vencidoParaQueima(x.validade,'2026-11-14')).length,0);
 assert.ok(r.itens.every(x=>x.motivo===4));
});
test('Não tenta interpretar XLSX, arquivo alterado ou texto como arquivo válido',()=>{
 assert.throws(()=>lerArquivoQueimaXls(new Uint8Array(200),'Queima-166240.xls'),/XLS binário válido/);
 assert.throws(()=>registroDaQueimaNome('Queima-166240.xlsx'),/nome do arquivo/);
});
test('Tela de Visualização oferece apenas Mapa/Lançamentos e dois modos',()=>{
 const view=read('public/assets/visualizacao.js');
 assert.match(view,/data-view-tab="mapas"/);
 assert.match(view,/data-view-mode="mes"/);
 assert.match(view,/data-view-mode="validade"/);
 assert.doesNotMatch(view,/data-view-tab="vencidos"|data-view-tab="sinalizacoes"/);
});
test('Banco exige validade futura ou hoje e datas da gôndola somente na aprovação',()=>{
 const sql=read('supabase/022_importacao_xls_queima_validade.sql');
 assert.match(sql,/NEW\.validade < \(now\(\) AT TIME ZONE 'America\/Sao_Paulo'\)::date/);
 assert.match(sql,/BEFORE INSERT ON public\.queima/);
 assert.match(sql,/NEW\.estado='aprovado'.*NEW\.preco_gondola IS NULL/);
 assert.match(sql,/BEFORE INSERT OR UPDATE ON public\.queima/);
 assert.match(sql,/registro_queima text/);
 assert.match(sql,/linha_importada integer/);
 assert.match(sql,/UNIQUE INDEX IF NOT EXISTS uq_queima_xls_linha_v40/);
 assert.match(sql,/importar_queima_xls_v40/);
 assert.match(sql,/IF validade < \(now\(\) AT TIME ZONE 'America\/Sao_Paulo'\)::date THEN/);
 assert.match(sql,/vencidos:=vencidos\+1;CONTINUE/);
 assert.match(sql,/ON CONFLICT DO NOTHING RETURNING id INTO novo_id/);
 assert.match(sql,/p\.formula_especial/);
 assert.match(sql,/abas_especiais/);
 assert.match(sql,/relancar_queima/);
});
test('Front separa importação pendente de aprovação e respeita validação de vencidos',()=>{
 const app=read('public/assets/app.js'),api=read('api/index.js');
 assert.match(app,/id="queima-import-open"/);
 assert.match(app,/lerArquivoQueimaXls\(await selected\.arrayBuffer\(\),selected\.name\)/);
 assert.match(app,/vencidoParaQueima\(r\.validade,hoje\)/);
 assert.match(app,/request\('\/queima\/importar-xls'/);
 assert.match(app,/solicitarAprovacaoQueima\(old\)/);
 assert.match(app,/Registro da Queima/);
 assert.match(api,/validarPrazoQueima\(data\.validade\)/);
 assert.match(api,/for\(const item of itens\)validarPrazoQueima\(item\.validade\)/);
 assert.match(api,/Object\.assign\(patch,validarDadosGondola\(body\)\)/);
 assert.match(api,/rpc\/encaminhar_mapa_queima_v40/);
 assert.match(api,/rpc\/importar_queima_xls_v40/);
});
