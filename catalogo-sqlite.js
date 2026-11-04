/* Camada única de acesso ao catálogo SQLite para GitHub Pages. */
(function (global) {
  'use strict';

  const SQLJS_VERSION = '1.13.0';
  const LOCAL_SQLJS = './libs/sql.js/sql-wasm.js';
  const CDN_BASE = `https://cdn.jsdelivr.net/npm/sql.js@${SQLJS_VERSION}/dist/`;
  const DB_URL = './produtos_ean.db';
  let sqlPromise = null;
  let dbPromise = null;
  let db = null;
  let total = 0;
  const cacheEan = new Map();
  const cacheInterno = new Map();

  function carregarScript(src) {
    return new Promise((resolve, reject) => {
      const existente = document.querySelector(`script[data-sqljs-src="${src}"]`);
      if (existente) {
        if (global.initSqlJs) return resolve();
        existente.addEventListener('load', resolve, { once: true });
        existente.addEventListener('error', () => reject(new Error('Falha ao carregar SQL.js.')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.sqljsSrc = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Falha ao carregar SQL.js.'));
      document.head.appendChild(script);
    });
  }

  async function iniciarSQL() {
    if (!sqlPromise) {
      sqlPromise = (async () => {
        let erroLocal = null;
        try {
          if (typeof global.initSqlJs !== 'function') {
            await carregarScript(LOCAL_SQLJS);
          }
          if (typeof global.initSqlJs !== 'function') {
            throw new Error('SQL.js não disponibilizou initSqlJs.');
          }
          // initSqlJs é uma fábrica assíncrona: seu retorno é o módulo SQL
          // que contém Database. Não se deve usar a função initSqlJs diretamente.
          return await global.initSqlJs({ locateFile: file => `./libs/sql.js/${file}` });
        } catch (erro) {
          erroLocal = erro;
        }

        try {
          // Se a cópia local ou o WASM local falhar, tenta a mesma versão no CDN.
          await carregarScript(`${CDN_BASE}sql-wasm.js`);
          if (typeof global.initSqlJs !== 'function') {
            throw new Error('SQL.js não disponibilizou initSqlJs pelo CDN.');
          }
          return await global.initSqlJs({ locateFile: file => `${CDN_BASE}${file}` });
        } catch (erroCDN) {
          throw new Error(`Não foi possível inicializar SQL.js. Local: ${erroLocal?.message || 'indisponível'}. CDN: ${erroCDN?.message || erroCDN}`);
        }
      })().catch(error => {
        sqlPromise = null;
        throw error;
      });
    }
    return sqlPromise;
  }

  function normalizarCodigo(valor) {
    return String(valor ?? '').trim();
  }

  function candidatos(valor) {
    const original = normalizarCodigo(valor);
    if (!original) return [];
    const lista = [original, original.replace(/[\s.\/-]/g, ''), original.replace(/\D/g, '')];
    if (/^\d{12}$/.test(original)) lista.push('0' + original);
    if (/^0\d{12}$/.test(original)) lista.push(original.slice(1));
    return [...new Set(lista.filter(Boolean))];
  }

  function linhaProduto(row) {
    if (!row) return null;
    return {
      ean: String(row[0] ?? ''),
      codigoInterno: String(row[1] ?? ''),
      produto: String(row[2] ?? ''),
      descricao: String(row[2] ?? ''),
      secao: String(row[3] ?? '')
    };
  }

  function consultar(sql, params) {
    if (!db) throw new Error('Banco SQLite ainda não foi carregado.');
    const stmt = db.prepare(sql);
    try {
      stmt.bind(params || []);
      if (!stmt.step()) return null;
      return linhaProduto(stmt.get());
    } finally {
      stmt.free();
    }
  }

  async function abrir(forcar) {
    if (db && !forcar) return api;
    if (dbPromise && !forcar) return dbPromise;
    dbPromise = (async () => {
      const SQL = await iniciarSQL();
      let versao = '1';
      try {
        const manifest = await fetch(`./catalogo_versao.json?t=${Date.now()}`, { cache: 'no-store' });
        if (manifest.ok) { const meta = await manifest.json(); versao = String(meta.versao || versao); }
      } catch (_) {}
      const url = `${DB_URL}?v=${encodeURIComponent(versao)}${forcar ? '&r=' + Date.now() : ''}`;
      const resposta = await fetch(url, { cache: forcar ? 'reload' : 'default' });
      if (!resposta.ok) throw new Error(`Não foi possível carregar produtos_ean.db (HTTP ${resposta.status}).`);
      const bytes = new Uint8Array(await resposta.arrayBuffer());
      const novoBanco = new SQL.Database(bytes);
      const ver = novoBanco.exec('PRAGMA integrity_check');
      if (!ver?.[0]?.values?.[0]?.[0] || ver[0].values[0][0] !== 'ok') {
        novoBanco.close();
        throw new Error('O arquivo produtos_ean.db está corrompido ou incompleto.');
      }
      const countResult = novoBanco.exec('SELECT COUNT(*) FROM produtos');
      const novoTotal = Number(countResult?.[0]?.values?.[0]?.[0] || 0);
      if (!novoTotal) {
        novoBanco.close();
        throw new Error('O banco SQLite não contém produtos.');
      }
      if (db) db.close();
      db = novoBanco;
      total = novoTotal;
      cacheEan.clear();
      cacheInterno.clear();
      return api;
    })().catch(error => {
      dbPromise = null;
      throw error;
    });
    return dbPromise;
  }

  function porEAN(valor) {
    if (!db) return null;
    for (const chave of candidatos(valor)) {
      if (cacheEan.has(chave)) return cacheEan.get(chave);
      const item = consultar('SELECT ean, codigo_interno, descricao, secao FROM produtos WHERE ean = ? LIMIT 1', [chave]);
      if (item) {
        for (const c of candidatos(chave)) cacheEan.set(c, item);
        return item;
      }
    }
    return null;
  }

  function porCodigoInterno(valor) {
    if (!db) return null;
    for (const chave of candidatos(valor)) {
      if (cacheInterno.has(chave)) return cacheInterno.get(chave);
      const item = consultar('SELECT ean, codigo_interno, descricao, secao FROM produtos WHERE codigo_interno = ? LIMIT 1', [chave]);
      if (item) {
        cacheInterno.set(chave, item);
        return item;
      }
    }
    return null;
  }

  function prepararCodigosMapa(codigos) {
    db.run('CREATE TEMP TABLE IF NOT EXISTS _catalogo_mapa (codigo TEXT PRIMARY KEY)');
    db.run('DELETE FROM _catalogo_mapa');
    if (!Array.isArray(codigos) || !codigos.length) return;
    const stmt = db.prepare('INSERT OR IGNORE INTO _catalogo_mapa(codigo) VALUES(?)');
    try {
      for (const codigo of codigos) {
        const valor = String(codigo ?? '').trim();
        if (valor) { stmt.run([valor]); stmt.reset(); }
      }
    } finally { stmt.free(); }
  }

  function filtroSql(filtro) {
    if (filtro === 'mapa') return ' AND EXISTS (SELECT 1 FROM _catalogo_mapa m WHERE m.codigo = produtos.ean OR m.codigo = produtos.codigo_interno)';
    if (filtro === 'sem-mapa') return ' AND NOT EXISTS (SELECT 1 FROM _catalogo_mapa m WHERE m.codigo = produtos.ean OR m.codigo = produtos.codigo_interno)';
    return '';
  }

  function listar(opcoes) {
    if (!db) return [];
    const o = opcoes || {};
    const limite = Math.max(1, Math.min(500, Number(o.limit) || 100));
    const offset = Math.max(0, Number(o.offset) || 0);
    const busca = String(o.query || '').trim();
    if (o.filtro) prepararCodigosMapa(o.mapaCodigos || []);
    const whereBusca = busca ? ' WHERE (ean LIKE ? OR codigo_interno LIKE ? OR descricao LIKE ? OR secao LIKE ?)' : ' WHERE 1=1';
    const sql = `SELECT ean, codigo_interno, descricao, secao FROM produtos${whereBusca}${filtroSql(o.filtro)} ORDER BY ean LIMIT ? OFFSET ?`;
    const params = busca ? [`%${busca}%`, `%${busca}%`, `%${busca}%`, `%${busca}%`, limite, offset] : [limite, offset];
    const stmt = db.prepare(sql);
    const result = [];
    try { stmt.bind(params); while (stmt.step()) result.push(linhaProduto(stmt.get())); }
    finally { stmt.free(); }
    return result;
  }

  function contarBusca(query, filtro, mapaCodigos) {
    if (!db) return 0;
    if (filtro) prepararCodigosMapa(mapaCodigos || []);
    const busca = String(query || '').trim();
    const whereBusca = busca ? ' WHERE (ean LIKE ? OR codigo_interno LIKE ? OR descricao LIKE ? OR secao LIKE ?)' : ' WHERE 1=1';
    const sql = `SELECT COUNT(*) FROM produtos${whereBusca}${filtroSql(filtro)}`;
    const params = busca ? [`%${busca}%`, `%${busca}%`, `%${busca}%`, `%${busca}%`] : [];
    const stmt = db.prepare(sql);
    try { stmt.bind(params); return stmt.step() ? Number(stmt.get()[0] || 0) : 0; }
    finally { stmt.free(); }
  }

  function contarSecoes() {
    if (!db) return 0;
    const r = db.exec("SELECT COUNT(DISTINCT secao) FROM produtos WHERE TRIM(secao) <> ''");
    return Number(r?.[0]?.values?.[0]?.[0] || 0);
  }

  function temEAN(valor) { return Boolean(porEAN(valor)); }
  function pronto() { return Boolean(db); }
  function quantidade() { return total; }

  const api = { abrir, porEAN, porCodigoInterno, listar, contarBusca, contarSecoes, temEAN, pronto, quantidade };
  global.CatalogoSQLite = api;
})(window);
