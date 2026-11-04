/* Catálogo remoto Cloudflare D1: mantém apenas produtos consultados em memória. */
(function (global) {
  'use strict';
  const API = 'https://registro-produtos-api.luisarthurofficial.workers.dev';
  const porEan = new Map();
  const porInterno = new Map();
  let pronto = false;
  let total = 0;
  let promessaAbertura = null;
  const norm = v => String(v ?? '').trim();
  function candidatos(v) {
    const s = norm(v); if (!s) return [];
    const a = [s, s.replace(/[\s.\/-]/g, ''), s.replace(/\D/g, '')];
    if (/^\d{12}$/.test(s)) a.push('0' + s);
    if (/^0\d{12}$/.test(s)) a.push(s.slice(1));
    return [...new Set(a.filter(Boolean))];
  }
  function normalizar(p) {
    return { ean:norm(p.ean), codigoInterno:norm(p.codigoInterno), produto:norm(p.produto || p.descricao), descricao:norm(p.produto || p.descricao), secao:norm(p.secao) };
  }
  function inserir(p) {
    const item=normalizar(p); if(!item.ean) return;
    porEan.set(item.ean,item); candidatos(item.ean).forEach(k=>porEan.set(k,item));
    if(item.codigoInterno) porInterno.set(item.codigoInterno,item);
  }
  async function requisicao(path, body) {
    const r=await fetch(API+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{}),cache:'no-store'});
    if(!r.ok) throw new Error(`Cloudflare D1 respondeu HTTP ${r.status}.`);
    const d=await r.json(); if(d.sucesso!==true) throw new Error(d.mensagem||'Resposta inválida do catálogo D1.'); return d;
  }
  async function abrir() {
    if(pronto) return api; if(promessaAbertura) return promessaAbertura;
    promessaAbertura=(async()=>{ const r=await fetch(API+'/api/health',{cache:'no-store'}); if(!r.ok) throw new Error('Não foi possível conectar ao catálogo D1.'); const d=await r.json(); if(d.sucesso!==true) throw new Error('Catálogo D1 indisponível.'); total=Number(d.total||0); pronto=true; return api; })().catch(e=>{promessaAbertura=null;throw e;});
    return promessaAbertura;
  }
  async function garantir(registros) {
    await abrir();
    const codigos=[...new Set((registros||[]).flatMap(r=>[r?.codigo,r?.ean,r?.EAN,r?.eanInterno,r?.codigoBarras,r?.codigo_barras,r?.codigoInterno,r?.codigo_interno,r?.codInterno].map(norm).filter(Boolean)))];
    const faltantes=codigos.filter(c=>!porEAN(c)&&!porCodigoInterno(c));
    for(let i=0;i<faltantes.length;i+=80){ const d=await requisicao('/api/produtos/lookup',{codigos:faltantes.slice(i,i+80)}); (d.produtos||[]).forEach(inserir); }
    return api;
  }
  async function buscarPagina(opcoes) {
    await abrir(); const x=opcoes||{};
    const d=await requisicao('/api/produtos/busca',{query:norm(x.query),filtro:norm(x.filtro),mapaCodigos:Array.isArray(x.mapaCodigos)?x.mapaCodigos:[],limit:Math.max(1,Math.min(100,Number(x.limit)||15)),offset:Math.max(0,Number(x.offset)||0)});
    (d.produtos||[]).forEach(inserir); return d;
  }
  function porEAN(v){for(const k of candidatos(v))if(porEan.has(k))return porEan.get(k);return null;}
  function porCodigoInterno(v){for(const k of candidatos(v))if(porInterno.has(k))return porInterno.get(k);return null;}
  function atualizarProduto(p){inserir(p);}
  function prontoFn(){return pronto;}
  function quantidade(){return total;}
  const api={abrir,garantir,buscarPagina,porEAN,porCodigoInterno,pronto:prontoFn,quantidade,atualizarProduto};
  // Substitui qualquer implementação antiga em cache e mantém a API pública completa.
  global.CatalogoSQLite = Object.assign(global.CatalogoSQLite || {}, api);
  if (typeof global.CatalogoSQLite.garantir !== 'function') {
    global.CatalogoSQLite.garantir = garantir;
  }
})(window);
