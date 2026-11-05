const CORS_ALLOWED_ORIGINS = new Set([
  "https://luisarthurdev.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
]);

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const headers = {
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  };
  if (CORS_ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(data, status, request) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...corsHeaders(request) }
  });
}

function candidatosEAN(value) {
  const original = String(value || "").trim();
  const out = [original];
  if (/^\d{12}$/.test(original)) out.push("0" + original);
  if (/^0\d{12}$/.test(original)) out.push(original.slice(1));
  return [...new Set(out.filter(Boolean))];
}

function produtoLegado(row) {
  return {
    ean: String(row.ean || ""),
    codigoInterno: String(row.codigo_interno || ""),
    produto: String(row.descricao || ""),
    descricao: String(row.descricao || ""),
    secao: String(row.secao || "")
  };
}

async function exigirChave(request, env) {
  const expected = String(env.API_SECRET || "");
  const auth = String(request.headers.get("Authorization") || "");
  if (!expected || auth !== "Bearer " + expected) return false;
  return true;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    try {
      if (request.method === "GET" && (path === "/" || path === "/api/health")) {
        const result = await env.DB.prepare("SELECT COUNT(*) AS total FROM produtos").first();
        return json({ sucesso: true, servico: "registro-produtos-api", banco: "registro-produtos", total: Number(result?.total || 0) }, 200, request);
      }

      if (request.method === "POST" && path === "/api/produtos/lookup") {
        let body; try { body = await request.json(); } catch (_) { return json({ sucesso:false, mensagem:"JSON inválido." },400,request); }
        const codigos = [...new Set((Array.isArray(body.codigos) ? body.codigos : []).map(v => String(v || "").trim()).filter(Boolean))].slice(0,80);
        if (!codigos.length) return json({ sucesso:true, produtos:[] },200,request);
        const payload = JSON.stringify(codigos);
        const rows = await env.DB.prepare("SELECT ean, codigo_interno, descricao, secao FROM produtos WHERE ean IN (SELECT value FROM json_each(?)) OR codigo_interno IN (SELECT value FROM json_each(?)) LIMIT 500").bind(payload,payload).all();
        return json({ sucesso:true, produtos:(rows.results||[]).map(produtoLegado) },200,request);
      }

      if (request.method === "POST" && path === "/api/produtos/busca") {
        let body; try { body = await request.json(); } catch (_) { return json({ sucesso:false, mensagem:"JSON inválido." },400,request); }
        const busca = String(body.query || "").trim().slice(0,120);
        const filtro = String(body.filtro || "");
        const codigos = [...new Set((Array.isArray(body.mapaCodigos) ? body.mapaCodigos : []).map(v=>String(v||"").trim()).filter(Boolean))];
        const limit = Math.max(1,Math.min(100,Number.parseInt(body.limit||"15",10)||15));
        const offset = Math.max(0,Number.parseInt(body.offset||"0",10)||0);
        const where = [];
        const binds = [];
        if (busca) { const like="%"+busca+"%"; where.push("(ean LIKE ? OR codigo_interno LIKE ? OR descricao LIKE ? OR secao LIKE ?)"); binds.push(like,like,like,like); }
        if (filtro === "mapa" || filtro === "sem-mapa") {
          const jsonCodigos=JSON.stringify(codigos);
          const cond="(ean IN (SELECT value FROM json_each(?)) OR codigo_interno IN (SELECT value FROM json_each(?)))";
          where.push(filtro === "mapa" ? cond : "NOT "+cond); binds.push(jsonCodigos,jsonCodigos);
        }
        const clause=where.length?" WHERE "+where.join(" AND "):"";
        const totalRow=await env.DB.prepare("SELECT COUNT(*) AS total FROM produtos"+clause).bind(...binds).first();
        const page=await env.DB.prepare("SELECT ean, codigo_interno, descricao, secao FROM produtos"+clause+" ORDER BY ean LIMIT ? OFFSET ?").bind(...binds,limit,offset).all();
        const sections=await env.DB.prepare("SELECT COUNT(DISTINCT secao) AS total FROM produtos WHERE secao <> ''").first();
        const mapped=codigos.length?await env.DB.prepare("SELECT COUNT(*) AS total FROM produtos WHERE ean IN (SELECT value FROM json_each(?)) OR codigo_interno IN (SELECT value FROM json_each(?))").bind(JSON.stringify(codigos),JSON.stringify(codigos)).first():{total:0};
        return json({sucesso:true,total:Number(totalRow?.total||0),secoes:Number(sections?.total||0),noMapa:Number(mapped?.total||0),limit,offset,produtos:(page.results||[]).map(produtoLegado)},200,request);
      }

      if (request.method === "GET" && path === "/api/produtos") {
        const busca = String(url.searchParams.get("busca") || "").trim().slice(0, 120);
        const limit = Math.max(1, Math.min(5000, Number.parseInt(url.searchParams.get("limit") || "50", 10) || 50));
        const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") || "0", 10) || 0);
        let totalResult;
        let page;
        if (busca) {
          const like = "%" + busca + "%";
          const where = "(ean LIKE ? OR codigo_interno LIKE ? OR descricao LIKE ? OR secao LIKE ?)";
          totalResult = await env.DB.prepare(`SELECT COUNT(*) AS total FROM produtos WHERE ${where}`).bind(like, like, like, like).first();
          page = await env.DB.prepare(`SELECT ean, codigo_interno, descricao, secao FROM produtos WHERE ${where} ORDER BY ean LIMIT ? OFFSET ?`).bind(like, like, like, like, limit, offset).all();
        } else {
          totalResult = await env.DB.prepare("SELECT COUNT(*) AS total FROM produtos").first();
          page = await env.DB.prepare("SELECT ean, codigo_interno, descricao, secao FROM produtos ORDER BY ean LIMIT ? OFFSET ?").bind(limit, offset).all();
        }
        return json({ sucesso: true, total: Number(totalResult?.total || 0), limit, offset, produtos: (page.results || []).map(produtoLegado) }, 200, request);
      }

      if (request.method === "GET" && path.startsWith("/api/produtos/")) {
        const ean = decodeURIComponent(path.slice("/api/produtos/".length));
        if (!/^\d{8,14}$/.test(ean)) return json({ sucesso: false, mensagem: "EAN inválido." }, 400, request);
        const keys = candidatosEAN(ean);
        const placeholders = keys.map(() => "?").join(",");
        const row = await env.DB.prepare(`SELECT ean, codigo_interno, descricao, secao FROM produtos WHERE ean IN (${placeholders}) LIMIT 1`).bind(...keys).first();
        return json({ sucesso: true, encontrado: Boolean(row), produto: row ? produtoLegado(row) : null }, 200, request);
      }

      if (request.method === "POST" && path === "/api/produtos") {
        if (!(await exigirChave(request, env))) return json({ sucesso: false, mensagem: "Não autorizado." }, 401, request);
        let body;
        try { body = await request.json(); } catch (_) { return json({ sucesso: false, mensagem: "JSON inválido." }, 400, request); }
        const modo = String(body.modo || "adicionar").trim();
        const codigoInterno = String(body.codigoInterno || "").trim();
        const ean = String(body.ean || "").trim();
        const produto = String(body.produto || "").trim();
        const secao = String(body.secao || "").trim();
        if (!["adicionar", "editar"].includes(modo)) return json({ sucesso: false, mensagem: "Operação inválida." }, 400, request);
        if (!codigoInterno || !ean || !produto || !secao) return json({ sucesso: false, mensagem: "Preencha Código Interno, EAN, Descrição e Seção." }, 400, request);
        if (!/^\d{8,14}$/.test(ean)) return json({ sucesso: false, mensagem: "O EAN deve conter de 8 a 14 dígitos." }, 400, request);
        if (codigoInterno.length > 80 || produto.length > 250 || secao.length > 120) return json({ sucesso: false, mensagem: "Um dos campos ultrapassa o tamanho permitido." }, 400, request);
        const existente = await env.DB.prepare("SELECT ean FROM produtos WHERE ean = ? LIMIT 1").bind(ean).first();
        if (modo === "adicionar" && existente) return json({ sucesso: false, duplicado: true, mensagem: "Este EAN já está cadastrado. Escolha Editar para corrigir os dados." }, 409, request);
        if (modo === "editar" && !existente) return json({ sucesso: false, mensagem: "Este EAN não existe no catálogo. Atualize a lista e tente novamente." }, 404, request);
        if (modo === "adicionar") {
          await env.DB.prepare("INSERT INTO produtos (ean, codigo_interno, descricao, secao) VALUES (?, ?, ?, ?)").bind(ean, codigoInterno, produto, secao).run();
        } else {
          await env.DB.prepare("UPDATE produtos SET codigo_interno = ?, descricao = ?, secao = ? WHERE ean = ?").bind(codigoInterno, produto, secao, ean).run();
        }
        const salvo = await env.DB.prepare("SELECT ean, codigo_interno, descricao, secao FROM produtos WHERE ean = ? LIMIT 1").bind(ean).first();
        if (!salvo) return json({ sucesso: false, mensagem: "O banco não confirmou a gravação. Tente novamente." }, 500, request);
        return json({ sucesso: true, modo, mensagem: modo === "editar" ? "Produto atualizado e confirmado no Cloudflare D1." : "Produto cadastrado e confirmado no Cloudflare D1.", produto: produtoLegado(salvo) }, 200, request);
      }

      return json({ sucesso: false, mensagem: "Rota não encontrada." }, 404, request);
    } catch (error) {
      console.error("Erro na API do catálogo:", error);
      return json({ sucesso: false, mensagem: "Erro interno ao consultar o catálogo." }, 500, request);
    }
  }
};
