import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=src('public/assets/app.js');
const visual=src('public/assets/visualizacao.js');
const serviceWorker=src('public/sw.js');
const htmlLaunch=src('public/lancamentos.html');
test('funcionário não recebe Dashboard nem Mapa Conferente no menu',()=>{
  assert.match(app,/const items=isGeral\(\)\?menusGeral:menus\.filter\(m=>isAdmin\(\)\|\|m\[0\]==='notificacoes'\)/);
  assert.match(app,/if\(!isAdmin\(\)&&!isGeral\(\)&&!IS_VIEW_PAGE&&!IS_LAUNCH_PAGE\)/);
  assert.match(app,/if\(state\.user\?\.perfil==='funcionario'&&!\['lancamentos','visualizacao'\]\.includes\(route\)\)/);
});
test('após login móvel abre Lançamentos mesmo com hash antigo do Dashboard',()=>{
  assert.match(app,/function showApp\(fromLogin=false\)/);
  assert.match(app,/mobile && \(fromLogin \|\| !location\.hash\)/);
  assert.match(app,/location\.replace\(mobile\?'\/lancamentos\.html':'\/visualizacao\.html'\)/);
  assert.match(app,/f\.elements\.pin\.value='';showApp\(true\)/);
});
test('link explícito para o Painel Conferente é exclusivo de administrador',()=>{
  assert.match(app,/isAdmin\(\)\?'<a class="btn-outline" href="\/#dashboard">← Painel Conferente<\/a>':''/);
  assert.match(app,/window\.location\.assign\(isAdmin\(\)\?'\/#'\+encodeURIComponent\(route\):'\/visualizacao\.html'\)/);
  assert.match(htmlLaunch,/id="launch-to-panel"/);
});
test('Visualização não apresenta gráfico de Queima, reservado ao Dashboard',()=>{
  assert.doesNotMatch(visual,/queima-donut|queima-progress|resumoQueima\(/);
  assert.match(app,/async function dashboard\(\)/);
  assert.match(app,/class="queima-donut"/);
  assert.match(visual,/Todas as abas especiais/);
});
test('cache da PWA é atualizado',()=>{
  assert.match(serviceWorker,/registro-validades-v34-formulas-queima-gondola-historico/);
});
