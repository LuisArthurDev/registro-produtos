/* Catálogo remoto Cloudflare D1. Mantém a interface CatalogoSQLite usada pelo painel. */
(function (global) {
  'use strict';
  const API = 'https://registro-produtos-api.luisarthurofficial.workers.dev';
  const PAGE_SIZE = 5000;
  let produtos = [];
  let porEan = new Map();
  let porInterno = new Map();
  let indicePorEan = new Map();
  let promessa = null;
  let carregado = false;

  function norm(v) { return String(v ?? '').trim(); }
  function candidatos(v) {
    const s = norm(v); if (!s) return [];
    const a = [s, s.replace(/[\s.\/-]/g, ''), s.replace(/\D/g, '')];
    if (/^\d{12}$/.test(s)) a.push('0' + s);
    if (/^0\d{12}$/.test(s)) a.push(s.slice(1));
    return [...new Set(a.filter(Boolean))];
  }
  function normalizar(p) {
    return { ean: norm(p.ean), codigoInterno: norm(p.codigoInterno), produto: norm(p.produto || p.descricao), descricao: norm(p.produto || p.descricao), secao: norm(p.secao) };
  }
  function inserir(p) {
    const item = normalizar(p);
    if (!item.ean) return;
    const idx = indicePorEan.get(item.ean);
    if (idx !== undefined) {
      const anterior = produtos[idx];
      produtos[idx] = item;
      if (anterior.codigoInterno && anterior.codigoInterno !== item.codigoInterno && porInterno.get(anterior.codigoInterno)?.ean === item.ean) porInterno.delete(anterior.codigoInterno);
    } else {
      indicePorEan.set(item.ean, produtos.length);
      produtos.push(item);
    }
    porEan.set(item.ean, item);
    for (const k of candidatos(item.ean)) porEan.set(k, item);
    if (item.codigoInterno && !porInterno.has(item.codigoInterno)) porInterno.set(item.codigoInterno, item);
  }
  async function buscarPagina(offset) {
    const url = `${API}/api/produtos?limit=${PAGE_SIZE}&offset=${offset}`;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`Cloudflare D1 respondeu HTTP ${r.status}.`);
    const d = await r.json();
    if (d.sucesso !== true || !Array.isArray(d.produtos)) throw new Error(d.mensagem || 'Resposta inválida do catálogo D1.');
    return d;
  }
  async function abrir(forcar) {
    if (carregado && !forcar) return api;
    if (promessa && !forcar) return promessa;
    promessa = (async () => {
      const primeira = await buscarPagina(0);
      if (!Number.isFinite(Number(primeira.total)) || Number(primeira.total) < 1) throw new Error('O catálogo D1 está vazio. A importação ainda não foi concluída.');
      const todos = primeira.produtos.slice();
      const offsets = [];
      for (let o = PAGE_SIZE; o < Number(primeira.total); o += PAGE_SIZE) offsets.push(o);
      for (let i = 0; i < offsets.length; i += 4) {
        const lote = await Promise.all(offsets.slice(i, i + 4).map(buscarPagina));
        for (const p of lote) todos.push(...p.produtos);
      }
      if (todos.length !== Number(primeira.total)) throw new Error(`Catálogo incompleto: recebidos ${todos.length} de ${primeira.total} produtos.`);
      produtos = []; porEan = new Map(); porInterno = new Map(); indicePorEan = new Map();
      todos.forEach(inserir);
      produtos.sort((a,b) => a.ean.localeCompare(b.ean));
      indicePorEan.clear();
      produtos.forEach((item, i) => indicePorEan.set(item.ean, i));
      carregado = true;
      return api;
    })().catch(e => { promessa = null; throw e; });
    return promessa;
  }
  function porEAN(v) { for (const k of candidatos(v)) if (porEan.has(k)) return porEan.get(k); return null; }
  function porCodigoInterno(v) { for (const k of candidatos(v)) if (porInterno.has(k)) return porInterno.get(k); return null; }
  function filtrar(query, filtro, mapaCodigos) {
    const q = norm(query).toLocaleLowerCase('pt-BR');
    const mapa = new Set((mapaCodigos || []).map(norm));
    return produtos.filter(p => {
      if (q && !(p.ean + ' ' + p.codigoInterno + ' ' + p.produto + ' ' + p.secao).toLocaleLowerCase('pt-BR').includes(q)) return false;
      const noMapa = mapa.has(p.ean) || mapa.has(p.codigoInterno);
      if (filtro === 'mapa' && !noMapa) return false;
      if (filtro === 'sem-mapa' && noMapa) return false;
      return true;
    });
  }
  function listar(o) { const x=o||{}, l=Math.max(1,Math.min(500,Number(x.limit)||100)), off=Math.max(0,Number(x.offset)||0); return filtrar(x.query,x.filtro,x.mapaCodigos).slice(off,off+l); }
  function contarBusca(q,f,m) { return filtrar(q,f,m).length; }
  function contarSecoes() { return new Set(produtos.map(p=>p.secao).filter(Boolean)).size; }
  function atualizarProduto(p) { inserir(p); produtos.sort((a,b)=>a.ean.localeCompare(b.ean)); indicePorEan.clear(); produtos.forEach((item, i) => indicePorEan.set(item.ean, i)); }
  function temEAN(v) { return Boolean(porEAN(v)); }
  function pronto() { return carregado; }
  function quantidade() { return produtos.length; }
  const api = { abrir, porEAN, porCodigoInterno, listar, contarBusca, contarSecoes, temEAN, pronto, quantidade, atualizarProduto };
  global.CatalogoSQLite = api;
})(window);
