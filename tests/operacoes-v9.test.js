import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {mascararValidade,validadeParaISO} from '../public/assets/validade.js';
const frontend=fs.readFileSync('public/assets/app.js','utf8');
const api=fs.readFileSync('api/index.js','utf8');
const sql=fs.readFileSync('supabase/008_operacoes_lancamento.sql','utf8');
const html=fs.readFileSync('public/index.html','utf8');
const standalone=fs.readFileSync('public/lancamentos.html','utf8');
for(const [entrada,esperada] of Object.entries({'01/26':'2026-01-31','1/26':'2026-01-31','02/26':'2026-02-28','02/28':'2028-02-29','15/01/26':'2026-01-15','15/01/2026':'2026-01-15','12/2026':'2026-12-31'})){
 test('validade '+entrada+' → '+esperada,()=>assert.equal(validadeParaISO(entrada),esperada));
}
test('validade rejeita dias inexistentes',()=>{assert.throws(()=>validadeParaISO('31/02/26'));assert.throws(()=>validadeParaISO('13/26'));});
test('máscara insere barras mas aceita mês de 1 dígito',()=>{assert.equal(mascararValidade('150126'),'15/01/26');assert.equal(mascararValidade('0126'),'01/26');assert.equal(mascararValidade('1/26'),'1/26');});
test('topo das duas páginas não contém botão Novo lançamento',()=>{assert.doesNotMatch(html,/id="top-open-launch"/);assert.doesNotMatch(standalone,/id="top-open-launch"/);});
test('destino do funcionário é seu login e administrador só tem abas especiais',()=>{assert.match(frontend,/state\.user\.nome/);assert.match(frontend,/const specialOptions=special\.map/);assert.match(api,/Administradores só podem lançar nas abas especiais/);});
test('transferências no formulário e na aba, com autorização no servidor',()=>{assert.match(frontend,/launch-kind/);assert.match(frontend,/loja_origem/);assert.match(frontend,/tipoRegistro === 'transferencia'/);assert.match(api,/Somente o administrador da loja pode registrar transferências/);assert.match(sql,/transferencias_request_id_unique/);});
test('mapas exibem ações individuais e exclusão lógica',()=>{assert.match(frontend,/data-remove-map/);assert.match(frontend,/data-send-map/);assert.match(frontend,/Lançar como Vencido/);assert.match(sql,/excluido_em/);assert.match(api,/exclusao_logica/);});
test('queima bloqueia aprovar de novo e relança apenas mês anterior',()=>{assert.match(frontend,/data-delete-burn/);assert.match(frontend,/Aprovado/);assert.match(sql,/Queima do mês atual: aprove em vez de relançar/);});
test('histórico utiliza nomes em vez de UUIDs',()=>{assert.match(api,/usuarios\(nome\)/);assert.match(frontend,/r\.usuarios\?\.nome/);});
test('som apenas após salvamento, não antes da resposta da API',()=>{assert.match(frontend,/if \(r\.status === 'saved'/);assert.match(frontend,/tocarConfirmacao\(\);/);});
test('consentimento nativo ocorre antes de aguardar SDK remoto',()=>{const push=fs.readFileSync('public/assets/push.js','utf8');assert.ok(push.indexOf('Notification.requestPermission()')<push.indexOf('const sdk=await iniciarPush();verificarSuporte(sdk);',push.indexOf('export async function permitirPush')));});
