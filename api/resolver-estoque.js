/* Auxilia o importador de estoque a associar EAN do Procfit ao catálogo.
 * Nunca adivinha zeros: um EAN incompleto só é recuperado de um código interno
 * único e de um EAN original compatível (vazio ou sufixo com zeros à esquerda).
 */
const norm=x=>String(x??'').trim();
const valido=x=>/^\d{8,14}$/.test(x);
export function mapaCodigosUnicos(produtos=[]){
 const m=new Map();
 for(const p of produtos){
  const code=norm(p.codigo_interno),ean=norm(p.ean);
  if(!code||!valido(ean))continue;
  if(!m.has(code))m.set(code,ean);
  else if(m.get(code)!==ean)m.set(code,null); // Código ambíguo: não usar.
 }
 return m;
}
export function resolverLinhaEstoque(registro,codigos=new Map()){
 const ean=norm(registro.ean),codigo=norm(registro.codigo_interno),catalogo=codigos.get(codigo);
 let eanFinal=ean,recuperado=false;
 if(valido(catalogo) && codigo && (ean==='' || (ean!==catalogo && /^\d+$/.test(ean) && catalogo.endsWith(ean) && /^0+$/.test(catalogo.slice(0,-ean.length))))) {
  eanFinal=catalogo;recuperado=true;
 }
 if(!valido(eanFinal))return {motivo:'EAN não identificado no catálogo'};
 const qtd=Number(registro.quantidade);
 if(!Number.isFinite(qtd)||qtd<0)return {motivo:'Saldo inválido ou negativo'};
 return {item:{ean:eanFinal,codigo_interno:codigo||null,descricao:norm(registro.descricao),secao:norm(registro.secao),quantidade:qtd},recuperado};
}
export function prepararLoteResolvido(itens,codigos=new Map()){
 const validos=new Map(),ignorados=[],reconciliados=[];
 for(const r of itens){
  const res=resolverLinhaEstoque(r,codigos);
  if(!res.item){ignorados.push({codigo_interno:norm(r.codigo_interno),ean:norm(r.ean),motivo:res.motivo});continue;}
  if(res.recuperado)reconciliados.push({codigo_interno:norm(r.codigo_interno),ean:res.item.ean});
  validos.set(res.item.ean,res.item); // Mesmo EAN: último saldo do relatório prevalece.
 }
 return {validos:[...validos.values()],ignorados,recuperados:reconciliados.length,duplicados:itens.length-ignorados.length-validos.size};
}
