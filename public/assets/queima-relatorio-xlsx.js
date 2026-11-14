/* Relatório Procfit (.xlsx): conciliação de aprovação da Queima. Somente leitura local;
 * interpreta colunas pela posição e pelo cabeçalho da linha 3. Sem bibliotecas/CDNs.
 * NÃO contém LOTE ou REGISTRO. O sistema deve evitar correspondências ambíguas.
 */
const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const normalize=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const asString=x=>String(x??'').trim();
const integerString=x=>{const s=asString(x);return /^\d+(?:\.0+)?$/.test(s)?s.replace(/\.0+$/,''):s;};
const isoDate=x=>{
 const s=asString(x);
 if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
 if(/^\d{4}-\d{2}-\d{2}T/.test(s))return s.slice(0,10);
 const d=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
 if(d)return `${d[3]}-${d[2].padStart(2,'0')}-${d[1].padStart(2,'0')}`;
 if(!/^\d+(?:\.\d+)?$/.test(s))return '';
 const serial=Number(s);
 if(!Number.isFinite(serial)||serial<1||serial>2958465)return '';
 const date=new Date((Math.floor(serial)-25569)*86400000);
 return Number.isNaN(date.getTime())?'':date.toISOString().slice(0,10);
};
const validIso=x=>{const s=isoDate(x),d=new Date(`${s}T12:00:00Z`);return !!s&&!Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s?s:'';};
async function getZipEntry(bytes,nome){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u16=(o)=>view.getUint16(o,true),u32=(o)=>view.getUint32(o,true),decoder=new TextDecoder();
 if(bytes.length<22||u32(0)!==0x04034b50)throw Error('O arquivo não é um XLSX/ZIP válido.');
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(u32(i)===0x06054b50){end=i;break;}
 if(end<0)throw Error('Diretório do XLSX não encontrado.');
 const entries=u16(end+10);if(entries>8000)throw Error('Planilha com arquivos internos demais.');
 let off=u32(end+16);
 for(let n=0;n<entries;n++){
  if(off+46>bytes.length||u32(off)!==0x02014b50)throw Error('Diretório do XLSX inválido.');
  const method=u16(off+10),compressed=u32(off+20),size=u32(off+24),len=u16(off+28),extra=u16(off+30),comment=u16(off+32),at=u32(off+42),name=decoder.decode(bytes.subarray(off+46,off+46+len));
  off+=46+len+extra+comment;
  if(name!==nome)continue;
  if(size>16*1024*1024||at+30>bytes.length||u32(at)!==0x04034b50)throw Error('Entrada XLSX muito grande/inválida.');
  const start=at+30+u16(at+26)+u16(at+28);if(start+compressed>bytes.length)throw Error('Entrada ZIP incompleta.');
  const data=bytes.slice(start,start+compressed);
  if(method===0)return data;
  if(method!==8)throw Error('Compressão XLSX não suportada.');
  if(typeof DecompressionStream!=='function')throw Error('Seu navegador não suporta a descompressão XLSX. Use Chrome ou Edge atualizados.');
  const ds=new DecompressionStream('deflate-raw');const output=new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer());
  if(output.length!==size)throw Error('Tamanho descompactado do XLSX incorreto.');
  return output;
 }
 throw Error(`O arquivo não contém ${nome}.`);
}
function xml(bytes){
 const value=new TextDecoder().decode(bytes);
 if(/<!DOCTYPE|<!ENTITY/i.test(value))throw Error('XML com entidades não permitido.');
 const result=new DOMParser().parseFromString(value,'application/xml');
 if(result.getElementsByTagName('parsererror').length)throw Error('XML XLSX inválido.');
 return result;
}
const children=(parent,local)=>[...(parent?.children||[])].filter(c=>c.localName===local&&c.namespaceURI===NS);
const child=(parent,local)=>children(parent,local)[0];
function parseLines(sheet,strings){
 const out=[];const sheetData=sheet.getElementsByTagNameNS(NS,'sheetData')[0];if(!sheetData)throw Error('XLSX sem linhas.');
 let physical=0;
 for(const row of children(sheetData,'row')){
  physical=Number(row.getAttribute('r'))||physical+1;
  if(physical>50000)throw Error('Relatório XLSX com linhas demais (máximo 50.000).');
  const a=[];let nextCol=0;
  for(const cell of children(row,'c')){
   const ref=cell.getAttribute('r');let col=nextCol;
   if(ref){const m=/^([A-Z]+)\d+$/.exec(ref.toUpperCase());if(m)col=[...m[1]].reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0)-1;}
   if(col>35)continue;
   const t=cell.getAttribute('t'),v=child(cell,'v')?.textContent??'',inline=child(cell,'is');
   a[col]=t==='s'?strings[Number(v)]??'':inline?inline.textContent:(t==='b'?v==='1':v);
   nextCol=col+1;
  }
  out.push({linha:physical,colunas:a});
 }
 return out;
}
export function interpretarRelatorioQueimaLinhas(linhas,{loja=''}={}){
 const cab=linhas.find(r=>normalize(r.colunas[1])==='produto'&&normalize(r.colunas[7])==='data de validade');
 if(!cab||normalize(cab.colunas[8])!=='aproado'&&normalize(cab.colunas[8])!=='aprovado')throw Error('Cabeçalho não encontrado. Esperadas: B Produto, H Data de Validade, I Aprovado, J Unidade, L Preço.');
 if(normalize(cab.colunas[9])!=='unidade'||normalize(cab.colunas[11])!=='preco')throw Error('Colunas Unidade/Preço não reconhecidas.');
 const items=[],resumo={total:0,aprovados:0,nao_aprovados:0,sem_preco:0,invalidos:0,outras_lojas:0},repeticoes=new Map();
 for(const r of linhas.filter(r=>r.linha>cab.linha)){
  const c=r.colunas;if(!c.some(v=>asString(v)))continue;
  const estado=asString(c[8]).toUpperCase();if(!['S','N'].includes(estado))continue;
  resumo.total++;if(estado==='N'){resumo.nao_aprovados++;continue;}
  resumo.aprovados++;
  if(loja){const local=asString(c[3]),match=/\bV\s*0*(\d+)\b/i.exec(local);
   if(match&&String(Number(match[1]))!==String(Number(loja))){resumo.outras_lojas++;continue;}}
  const produto=asString(c[1]),codigo=/^(\d+)\s*-\s*(.+)$/.exec(produto);const validade=validIso(c[7]),data_lancamento=validIso(c[0]);
  const quantidade=Number(String(c[9]??'').replace(',','.')),precoTexto=asString(c[11]).replace(',','.'),preco_gondola=precoTexto===''?null:Number(precoTexto);
  if(preco_gondola===null)resumo.sem_preco++;
  if(!codigo||!validade||!Number.isSafeInteger(quantidade)||quantidade<=0||quantidade>999999||preco_gondola!==null&&(!Number.isFinite(preco_gondola)||preco_gondola<0||preco_gondola>9999999999.99)||!data_lancamento){resumo.invalidos++;continue;}
  // O identificador de origem NÃO depende de preço/quantidade: correções futuras
  // devem atualizar a mesma ocorrência, sem criar uma nova Queima.
  const key=[codigo[1].replace(/^0+(?=\d)/,''),validade,data_lancamento].join('|');
  const ocorrencia=(repeticoes.get(key)||0)+1;repeticoes.set(key,ocorrencia);
  items.push({linha:r.linha,codigo_interno:codigo[1],descricao:codigo[2],validade,quantidade,preco_gondola,data_lancamento,ocorrencia,aprovado:true});
 }
 if(!resumo.total)throw Error('Nenhum produto com aprovação S/N encontrado neste relatório.');
 return {itens:items,resumo,colunas:{produto:'B',validade:'H',aprovado:'I',quantidade:'J',preco:'L'},sem_lote:true,sem_registro:true};
}
export async function lerRelatorioQueimaXlsx(file,{loja=''}={}){
 if(!/\.xlsx$/i.test(String(file?.name)))throw Error('Selecione o relatório .xlsx do Procfit.');
 if(file.size>12*1024*1024)throw Error('Relatório maior que 12 MB.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 const sheet=xml(await getZipEntry(bytes,'xl/worksheets/sheet1.xml'));
 let strings=[];
 try{
  const shared=xml(await getZipEntry(bytes,'xl/sharedStrings.xml'));
  strings=[...shared.getElementsByTagNameNS(NS,'si')].map(si=>si.textContent);
 }catch(e){if(!e.message.includes('não contém'))throw e;}
 return interpretarRelatorioQueimaLinhas(parseLines(sheet,strings),{loja});
}
