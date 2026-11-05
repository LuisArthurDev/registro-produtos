const ALLOWED_ORIGINS = new Set([
  "https://luisarthurdev.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
]);

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://luisarthurdev.github.io";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(data, status, request) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(request) }
  });
}

function productRow(row) {
  if (!row) return null;
  return {
    ean: String(row.ean || ""),
    codigoInterno: String(row.codigo_interno || ""),
    produto: String(row.descricao || ""),
    descricao: String(row.descricao || ""),
    secao: String(row.secao || "")
  };
}

function uniqueCodes(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => String(value == null ? "" : value).trim())
    .filter(value => value && value.length <= 80))].slice(0, 80);
}

async function health(env, request) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS total FROM produtos").first();
  return json({ sucesso: true, total: Number(row?.total || 0) }, 200, request);
}

async function getProduct(ean, env, request) {
  if (!/^\d{8,14}$/.test(ean)) return json({ sucesso: false, mensagem: "EAN inválido." }, 400, request);
  const row = await env.DB.prepare(
    "SELECT ean, codigo_interno, descricao, secao FROM produtos WHERE ean = ? OR codigo_interno = ? LIMIT 1"
  ).bind(ean, ean).first();
  return json({ sucesso: true, encontrado: !!row, produto: productRow(row) }, 200, request);
}

async function lookup(body, env, request) {
  const codes = uniqueCodes(body.codigos);
  if (!codes.length) return json({ sucesso: true, produtos: [] }, 200, request);
  const marks = codes.map(() => "?").join(",");
  const sql = `SELECT ean, codigo_interno, descricao, secao FROM produtos WHERE ean IN (${marks}) OR codigo_interno IN (${marks}) LIMIT 160`;
  const result = await env.DB.prepare(sql).bind(...codes, ...codes).all();
  return json({ sucesso: true, produtos: (result.results || []).map(productRow) }, 200, request);
}

async function search(body, env, request) {
  const query = String(body.query || "").trim().slice(0, 120);
  const filtro = String(body.filtro || "").trim().slice(0, 120);
  const mapaCodigos = uniqueCodes(body.mapaCodigos).slice(0, 100);
  const limit = Math.max(1, Math.min(100, Number(body.limit) || 15));
  const offset = Math.max(0, Math.min(1000000, Number(body.offset) || 0));
  const where = [];
  const values = [];
  if (query) {
    where.push("(ean LIKE ? OR codigo_interno LIKE ? OR descricao LIKE ?)");
    const like = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
    values.push(like, like, like);
  }
  if (filtro && !["todos", "todas", "all", "qualquer"].includes(filtro.toLowerCase())) {
    where.push("secao = ?"); values.push(filtro);
  }
  if (mapaCodigos.length) {
    const marks = mapaCodigos.map(() => "?").join(",");
    where.push(`(ean IN (${marks}) OR codigo_interno IN (${marks}))`);
    values.push(...mapaCodigos, ...mapaCodigos);
  }
  const clause = where.length ? " WHERE " + where.join(" AND ") : "";
  const totalRow = await env.DB.prepare("SELECT COUNT(*) AS total FROM produtos" + clause).bind(...values).first();
  const rows = await env.DB.prepare(
    "SELECT ean, codigo_interno, descricao, secao FROM produtos" + clause +
    " ORDER BY descricao COLLATE NOCASE LIMIT ? OFFSET ?"
  ).bind(...values, limit, offset).all();
  return json({ sucesso: true, produtos: (rows.results || []).map(productRow), total: Number(totalRow?.total || 0), limit, offset }, 200, request);
}

async function upsertProduct(request, env) {
  if (!env.API_SECRET) return json({ sucesso: false, mensagem: "Segredo API_SECRET não configurado no Worker." }, 503, request);
  const authorization = request.headers.get("Authorization") || "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!supplied || supplied !== env.API_SECRET) return json({ sucesso: false, mensagem: "Não autorizado." }, 401, request);
  let body;
  try { body = await request.json(); } catch (_) { return json({ sucesso: false, mensagem: "JSON inválido." }, 400, request); }
  const modo = String(body.modo || "adicionar");
  const codigoInterno = String(body.codigoInterno || "").trim();
  const ean = String(body.ean || "").trim();
  const descricao = String(body.produto || body.descricao || "").trim();
  const secao = String(body.secao || "").trim();
  if (!["adicionar", "editar"].includes(modo)) return json({ sucesso: false, mensagem: "Operação inválida." }, 400, request);
  if (!codigoInterno || !/^\d{8,14}$/.test(ean) || !descricao || !secao) return json({ sucesso: false, mensagem: "Informe Código Interno, EAN válido, descrição e seção." }, 400, request);
  if (codigoInterno.length > 80 || descricao.length > 250 || secao.length > 120) return json({ sucesso: false, mensagem: "Um dos campos ultrapassa o tamanho permitido." }, 400, request);
  await env.DB.prepare(
    "INSERT INTO produtos (ean, codigo_interno, descricao, secao) VALUES (?, ?, ?, ?) " +
    "ON CONFLICT(ean) DO UPDATE SET codigo_interno = excluded.codigo_interno, descricao = excluded.descricao, secao = excluded.secao"
  ).bind(ean, codigoInterno, descricao, secao).run();
  return json({ sucesso: true, modo, mensagem: modo === "editar" ? "Produto atualizado no Cloudflare D1." : "Produto cadastrado no Cloudflare D1.", produto: { ean, codigoInterno, produto: descricao, descricao, secao } }, 200, request);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/api/health") return await health(env, request);
      if (request.method === "GET" && url.pathname.startsWith("/api/produtos/")) {
        return await getProduct(decodeURIComponent(url.pathname.slice("/api/produtos/".length)), env, request);
      }
      if (request.method === "POST" && url.pathname === "/api/produtos/lookup") {
        const body = await request.json(); return await lookup(body || {}, env, request);
      }
      if (request.method === "POST" && url.pathname === "/api/produtos/busca") {
        const body = await request.json(); return await search(body || {}, env, request);
      }
      if (request.method === "POST" && url.pathname === "/api/produtos") return await upsertProduct(request, env);
      return json({ sucesso: false, mensagem: "Rota não encontrada." }, 404, request);
    } catch (error) {
      return json({ sucesso: false, mensagem: String(error?.message || error || "Erro interno.") }, 500, request);
    }
  }
};
