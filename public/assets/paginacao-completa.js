/* Leitura completa de um conjunto da API, sem depender da página visível da tabela.
 * Cada solicitação devolve até 800 registros e o cursor do próximo lote.
 * O cursor vem do offset bruto do banco, antes de filtrar seções/grupos ocultos.
 * Nunca retorna um resultado parcial quando o servidor ou conexão falha. */
export async function carregarTodasPaginas(request, url, {tamanho = 800, onProgress} = {}) {
  if (typeof request !== 'function' || typeof url !== 'string' || !url) throw new Error('Consulta inválida.');
  if (!Number.isSafeInteger(tamanho) || tamanho < 1 || tamanho > 1000) throw new Error('Tamanho do lote inválido.');
  const registros = [], visitados = new Set();
  let offset = 0;
  for (;;) {
    if (visitados.has(offset)) throw new Error('O servidor repetiu uma página. A consulta completa foi interrompida.');
    visitados.add(offset);
    const separador=url.includes('?')?'&':'?';
    const resposta=await request(`${url}${separador}offset=${offset}&limit=${tamanho}`);
    if (!resposta || resposta.sucesso === false || !Array.isArray(resposta.registros) || resposta.paginado !== true) {
      throw new Error('O servidor não confirmou a paginação completa. Atualize a aplicação e tente novamente.');
    }
    registros.push(...resposta.registros);
    onProgress?.({carregados:registros.length, paginas:visitados.size});
    const proximo=resposta.proximoOffset;
    if (proximo===null || proximo===undefined) return registros;
    if (!Number.isSafeInteger(proximo) || proximo<=offset) {
      throw new Error('Cursor de paginação inválido; a cópia não pode continuar.');
    }
    offset=proximo;
  }
}
