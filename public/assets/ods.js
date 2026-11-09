/* Leitor ODS simples, offline e sem serviço externo.
 * Lê content.xml do ZIP ODF com a API DecompressionStream (navegadores modernos).
 * Não executa macros nem faz upload do arquivo original.
 */
const ODF_TABLE='urn:oasis:names:tc:opendocument:xmlns:table:1.0';
const ODF_TEXT='urn:oasis:names:tc:opendocument:xmlns:text:1.0';
const ODF_OFFICE='urn:oasis:names:tc:opendocument:xmlns:office:1.0';
const uint16=(v,o)=>v.getUint16(o,true),uint32=(v,o)=>v.getUint32(o,true);
export async function lerODS(file,{maxLinhas=150000,maxColunas=80}={}){
 if(!file||!String(file.name||'').toLowerCase().endsWith('.ods'))throw new Error('Selecione um arquivo .ods.');
 const bytes=new Uint8Array(await file.arrayBuffer()),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 // O arquivo ZIP contém um diretório central; não confiar nos tamanhos do cabeçalho local.
 let end=-1;for(let at=bytes.length-22;at>=Math.max(0,bytes.length-65557);at--){if(view.getUint32(at,true)===0x06054b50){end=at;break;}}
 if(end<0)throw new Error('Arquivo ODS inválido ou corrompido.');
 const entryCount=uint16(view,end+10),directory=uint32(view,end+16),utf8=new TextDecoder('utf-8');
 let at=directory,content=null;
 for(let n=0;n<entryCount;n++){
  if(at+46>bytes.length||view.getUint32(at,true)!==0x02014b50)throw new Error('Diretório ZIP inválido.');
  const method=uint16(view,at+10),compressed=uint32(view,at+20),uncompressed=uint32(view,at+24),nameLen=uint16(view,at+28),extra=uint16(view,at+30),comment=uint16(view,at+32),offset=uint32(view,at+42);
  const name=utf8.decode(bytes.slice(at+46,at+46+nameLen));at+=46+nameLen+extra+comment;
  if(name!=='content.xml')continue;
  if(uncompressed>80*1024*1024)throw new Error('Planilha grande demais para processar no navegador.');
  if(offset+30>bytes.length||view.getUint32(offset,true)!==0x04034b50)throw new Error('Entrada ZIP inválida.');
  const start=offset+30+uint16(view,offset+26)+uint16(view,offset+28);
  if(start+compressed>bytes.length)throw new Error('Arquivo ZIP incompleto.');
  const compressedBytes=bytes.slice(start,start+compressed);
  if(method===0)content=compressedBytes;
  else if(method===8){
   if(typeof DecompressionStream==='undefined')throw new Error('Seu navegador não suporta a descompressão de ODS. Use CSV.');
   const stream=new Blob([compressedBytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
   content=new Uint8Array(await new Response(stream).arrayBuffer());
  }else throw new Error('Compressão ODS não suportada.');
  break;
 }
 if(!content)throw new Error('Arquivo ODS sem content.xml.');
 const xml=new DOMParser().parseFromString(utf8.decode(content),'application/xml');
 if(xml.querySelector('parsererror'))throw new Error('Estrutura XML do ODS inválida.');
 const sheet=xml.getElementsByTagNameNS(ODF_TABLE,'table')[0];if(!sheet)throw new Error('Planilha ODS sem abas.');
 const out=[];
 for(const row of sheet.getElementsByTagNameNS(ODF_TABLE,'table-row')){
  const repeat=Math.min(100000,Math.max(1,Number(row.getAttributeNS(ODF_TABLE,'number-rows-repeated'))||1));
  const cells=[];
  for(const child of row.children){
   if(child.namespaceURI!==ODF_TABLE||!['table-cell','covered-table-cell'].includes(child.localName))continue;
   const count=Math.max(1,Number(child.getAttributeNS(ODF_TABLE,'number-columns-repeated'))||1);
   let text=[...child.getElementsByTagNameNS(ODF_TEXT,'p')].map(p=>p.textContent).join(' ').trim();
   if(!text)text=child.getAttributeNS(ODF_OFFICE,'value')||'';
   for(let n=0;n<Math.min(count,maxColunas-cells.length);n++)cells.push(text);
   if(cells.length>=maxColunas)break;
  }
  if(!cells.some(x=>x!==''))continue; // Pode haver milhares de linhas vazias repetidas no ODS.
  for(let n=0;n<repeat;n++){
   out.push([...cells]);if(out.length>maxLinhas)throw new Error('Planilha com linhas demais. Divida-a antes de importar.');
  }
 }
 if(!out.length)throw new Error('A aba ODS não contém linhas preenchidas.');
 return out;
}
