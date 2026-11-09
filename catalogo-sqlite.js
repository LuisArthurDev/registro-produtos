/* Catálogo: Cloudflare D1 com contingência SQLite local (carregada sob demanda).
 * Mantém a API pública existente; nunca faz download do banco completo enquanto
 * o serviço remoto está saudável. Requisições de consulta são idempotentes.
 */
(function (global) {
  'use strict';
  const API = 'https://registro-produtos-api.luisarthurofficial.workers.dev';
  const porEan = new Map(), porInterno = new Map();
  let pronto = false, total = 0, modo = '', promessaAbertura = null, promessaLocal = null, banco = null;
  const norm = v => String(v ?? '').trim();
  const pausa = ms => new Promise(r => setTimeout(r, ms));
  function candidatos(v) {
    const s = norm(v); if (!s) return [];
    const a = [s, s.replace(/[\s.\/-]/g, ''), s.replace(/\D/g, '')];
    if (/^\d{12}$/.test(s)) a.push('0' + s);
    if (/^0\d{12}$/.test(s)) a.push(s.slice(1));
    return [...new Set(a.filter(Boolean))];
  }
  function normalizar(p) {
    return { ean: norm(p.ean), codigoInterno: norm(p.codigoInterno ?? p.codigo_interno),
      produto: norm(p.produto || p.descricao), descricao: norm(p.produto || p.descricao), secao: norm(p.secao) };
  }
  function inserir(p) {
    const item = normalizar(p); if (!item.ean) return;
    candidatos(item.ean).forEach(k => porEan.set(k, item));
    if (item.codigoInterno) porInterno.set(item.codigoInterno, item);
  }
  function porEAN(v) { for (const k of candidatos(v)) if (porEan.has(k)) return porEan.get(k); return null; }
  function porCodigoInterno(v) { for (const k of candidatos(v)) if (porInterno.has(k)) return porInterno.get(k); return null; }
  async function obterJson(path, body) {
    const url = API + path, post = body !== undefined;
    let ultimo;
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), path === '/api/health' ? 8000 : 12000);
      try {
        const r = await fetch(url, {
          method: post ? 'POST' : 'GET',
          headers: post ? { 'Content-Type': 'application/json' } : undefined,
          body: post ? JSON.stringify(body) : undefined,
          cache: 'no-store', signal: ctrl.signal
        });
        if (!r.ok) throw new Error('Cloudflare D1 respondeu HTTP ' + r.status);
        const d = await r.json();
        if (!d || d.sucesso !== true) throw new Error(d?.mensagem || 'Resposta inválida do catálogo D1');
        return d;
      } catch (e) {
        ultimo = e;
        if (tentativa === 0 && (e?.name === 'AbortError' || e instanceof TypeError)) await pausa(550);
        else break;
      } finally { clearTimeout(timer); }
    }
    const detalhe = ultimo?.name === 'AbortError' ? 'tempo limite excedido' : (ultimo?.message || 'falha na conexão');
    throw new Error('Falha ao consultar catálogo online (' + detalhe + ').');
  }
  function carregarBiblioteca() {
    if (typeof global.initSqlJs === 'function') return Promise.resolve(global.initSqlJs);
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = './libs/sql.js/sql-wasm.js'; s.async = true;
      s.onload = () => typeof global.initSqlJs === 'function' ? resolve(global.initSqlJs) : reject(new Error('sql.js não inicializou'));
      s.onerror = () => reject(new Error('Não foi possível carregar a biblioteca SQLite local'));
      document.head.appendChild(s);
    });
  }
  async function ativarLocal(causa) {
    if (banco) { modo = 'local'; pronto = true; return api; }
    if (promessaLocal) return promessaLocal;
    promessaLocal = (async () => {
      const init = await carregarBiblioteca();
      const SQL = await init({ locateFile: file => './libs/sql.js/' + file });
      const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 45000);
      try {
        const resposta = await fetch('./produtos_ean.db', { cache: 'force-cache', signal: ctrl.signal });
        if (!resposta.ok) throw new Error('Banco local não disponível (HTTP ' + resposta.status + ')');
        banco = new SQL.Database(new Uint8Array(await resposta.arrayBuffer()));
        total = Number(banco.exec('SELECT COUNT(*) FROM produtos')[0]?.values[0]?.[0] || 0);
        modo = 'local'; pronto = true;
        console.warn('Catálogo: usando SQLite local de contingência.', causa?.message || causa || '');
        return api;
      } finally { clearTimeout(timer); }
    })().catch(e => { promessaLocal = null; throw new Error('Catálogo online indisponível e contingência local falhou: ' + e.message); });
    return promessaLocal;
  }
  async function abrir() {
    if (pronto) return api;
    if (promessaAbertura) return promessaAbertura;
    promessaAbertura = (async () => {
      try {
        const d = await obterJson('/api/health');
        total = Number(d.total || 0); modo = 'remoto'; pronto = true; return api;
      } catch (e) { return ativarLocal(e); }
    })().catch(e => { promessaAbertura = null; throw e; });
    return promessaAbertura;
  }
  function consultarBanco(codigo) {
    if (!banco) return;
    for (const c of candidatos(codigo)) {
      const stmt = banco.prepare('SELECT ean, codigo_interno, descricao, secao FROM produtos WHERE ean = ? OR codigo_interno = ? LIMIT 1');
      try { stmt.bind([c, c]); if (stmt.step()) inserir(stmt.getAsObject()); }
      finally { stmt.free(); }
    }
  }
  async function garantir(registros) {
    await abrir();
    const codigos = [...new Set((registros || []).flatMap(r => [r?.codigo, r?.ean, r?.EAN, r?.eanInterno,
      r?.codigoBarras, r?.codigo_barras, r?.codigoInterno, r?.codigo_interno, r?.codInterno].map(norm).filter(Boolean)))];
    const faltantes = codigos.filter(c => !porEAN(c) && !porCodigoInterno(c));
    if (!faltantes.length) return api;
    if (modo === 'local') { faltantes.forEach(consultarBanco); return api; }
    const lotes = [];
    for (let i = 0; i < faltantes.length; i += 80) lotes.push(faltantes.slice(i, i + 80));
    let indice = 0, primeiraFalha = null;
    await Promise.all(Array.from({length: Math.min(3, lotes.length)}, async () => {
      while (indice < lotes.length && !primeiraFalha) {
        const bloco = lotes[indice++];
        try { const d = await obterJson('/api/produtos/lookup', { codigos: bloco }); (d.produtos || []).forEach(inserir); }
        catch (e) { primeiraFalha = e; }
      }
    }));
    if (primeiraFalha) { await ativarLocal(primeiraFalha); faltantes.forEach(consultarBanco); }
    return api;
  }
  function paginaLocal(x) {
    const limit = Math.max(1, Math.min(100, Number(x.limit) || 15));
    const offset = Math.max(0, Number(x.offset) || 0);
    const query = norm(x.query), filtro = norm(x.filtro), codigos = [...new Set((x.mapaCodigos || []).map(norm).filter(Boolean))].slice(0, 80);
    const cond = [], params = [];
    if (query) { const q = '%' + query.replace(/[\\%_]/g, '\\$&') + '%';
      cond.push("(ean LIKE ? ESCAPE '\\' OR codigo_interno LIKE ? ESCAPE '\\' OR descricao LIKE ? ESCAPE '\\')"); params.push(q, q, q); }
    if (filtro && !['todos','todas','all','qualquer'].includes(filtro.toLowerCase())) { cond.push('secao = ?'); params.push(filtro); }
    if (codigos.length) {
      const marks = codigos.map(() => '?').join(',');
      cond.push('(ean IN (' + marks + ') OR codigo_interno IN (' + marks + '))'); params.push(...codigos, ...codigos);
    }
    const where = cond.length ? ' WHERE ' + cond.join(' AND ') : '';
    function executar(sql, args) { const st = banco.prepare(sql); try { st.bind(args); const rows = []; while (st.step()) rows.push(st.getAsObject()); return rows; } finally { st.free(); } }
    const totalResultado = Number(executar('SELECT COUNT(*) AS total FROM produtos' + where, params)[0]?.total || 0);
    const produtos = executar('SELECT ean, codigo_interno, descricao, secao FROM produtos' + where + ' ORDER BY descricao COLLATE NOCASE LIMIT ? OFFSET ?', [...params, limit, offset]).map(normalizar);
    produtos.forEach(inserir);
    return { sucesso: true, produtos, total: totalResultado, limit, offset, fonte: 'sqlite-local' };
  }
  async function buscarPagina(opcoes) {
    await abrir(); const x = opcoes || {};
    if (modo === 'local') return paginaLocal(x);
    try {
      const d = await obterJson('/api/produtos/busca', { query: norm(x.query), filtro: norm(x.filtro),
        mapaCodigos: Array.isArray(x.mapaCodigos) ? x.mapaCodigos : [], limit: Math.max(1, Math.min(100, Number(x.limit) || 15)), offset: Math.max(0, Number(x.offset) || 0) });
      (d.produtos || []).forEach(inserir); return d;
    } catch (e) { await ativarLocal(e); return paginaLocal(x); }
  }
  function atualizarProduto(p) { inserir(p); }
  function prontoFn() { return pronto; }
  function quantidade() { return total; }
  function origem() { return modo; }
  const api = { abrir, garantir, buscarPagina, porEAN, porCodigoInterno, pronto: prontoFn, quantidade, atualizarProduto, origem };
  global.CatalogoSQLite = Object.assign(global.CatalogoSQLite || {}, api);
})(window);
