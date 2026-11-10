/* Três categorias excludentes para o Dashboard da loja.
 * Unidade de contagem: lançamento de mapa ou entrada de Queima sem mapa vinculado.
 * Relançamentos históricos (estado=relancado) são removidos do denominador.
 */
const valor=v=>String(v??'').trim();
const chave=m=>[valor(m.ean),valor(m.lote),valor(m.validade).slice(0,10)].join('|');
const dateValue=r=>Date.parse(r.criado_em||r.atualizado_em||'')||0;
const recente=(a,b)=>dateValue(b)-dateValue(a)||valor(b.id).localeCompare(valor(a.id));
export function resumoQueima(mapaRows=[],queueRows=[]){
  const maps=[];const vistos=new Set();
  for(const m of mapaRows){
    if(m.excluido_em||!(Number(m.quantidade)>0))continue;
    const id=valor(m.id);
    if(!id||vistos.has(id))continue;
    vistos.add(id);maps.push(m);
  }
  const queimados=queueRows.filter(q=>q.estado!=='relancado'&&!q.excluido_em);
  // Cada lançamento tem no máximo um estado atual na Queima.
  const queueByMap=new Map();const unlinked=[];
  for(const q of [...queimados].sort(recente)){
    const id=valor(q.lancamento_id);
    if(id){if(!queueByMap.has(id))queueByMap.set(id,q);}
    else unlinked.push(q);
  }
  const legacyByKey=new Map();
  for(const q of unlinked){const k=chave(q),group=legacyByKey.get(k)||[];group.push(q);legacyByKey.set(k,group);}
  const usedLegacy=new Set();
  let naoLancados=0,pendentes=0,aprovados=0;
  const state=q=>{if(valor(q.estado)==='aprovado')aprovados++;else pendentes++;};
  for(const m of maps){
    let row=queueByMap.get(valor(m.id));
    // Para registros antigos sem lancamento_id, relacionar EAN + lote + validade.
    // Não associar a mesma entrada de Queima a dois mapas diferentes.
    if(!row){
      const candidates=legacyByKey.get(chave(m))||[];
      row=candidates.find(q=>!usedLegacy.has(q));
      if(row)usedLegacy.add(row);
    }
    if(row)state(row);else naoLancados++;
  }
  for(const [id,q] of queueByMap)if(!vistos.has(id))state(q);
  for(const q of unlinked)if(!usedLegacy.has(q))state(q);
  const total=naoLancados+pendentes+aprovados;
  const pct=n=>total?Math.round(100*n/total):0;
  return {naoLancados,pendentes,aprovados,total,percentuais:{naoLancados:pct(naoLancados),pendentes:pct(pendentes),aprovados:pct(aprovados)}};
}
