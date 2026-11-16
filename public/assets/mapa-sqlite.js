/** Exportador SQLite 3 independente de bibliotecas externas. Não altera o banco do site. */
const PAGE_SIZE=4096;
const enc=new TextEncoder();
const u16=(b,o,v)=>{b[o]=v>>>8;b[o+1]=v&255;};
const u32=(b,o,v)=>{b[o]=(v>>>24)&255;b[o+1]=(v>>>16)&255;b[o+2]=(v>>>8)&255;b[o+3]=v&255;};
function varint(n){
 if(!Number.isSafeInteger(n)||n<0)throw new Error('Número inválido no banco SQLite.');
 const arr=[n%128];n=Math.floor(n/128);
 while(n){arr.unshift((n%128)|128);n=Math.floor(n/128);}
 return Uint8Array.from(arr);
}
function juntar(...parts){const b=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let pos=0;for(const p of parts){b.set(p,pos);pos+=p.length;}return b;}
function campo(valor){
 if(valor===null||valor===undefined||valor==='')return {serial:0,bytes:new Uint8Array(0)};
 if(typeof valor==='number'){
  if(!Number.isSafeInteger(valor)||valor<0||valor>2147483647)throw new Error('Quantidade fora do intervalo permitido.');
  if(valor===0||valor===1)return {serial:8+valor,bytes:new Uint8Array(0)};
  const n=valor<=127?1:valor<=32767?2:4,b=new Uint8Array(n);
  for(let k=n-1,v=valor;k>=0;k--){b[k]=v&255;v=Math.floor(v/256);}
  return {serial:n===1?1:n===2?2:4,bytes:b};
 }
 const bytes=enc.encode(String(valor));return {serial:13+2*bytes.length,bytes};
}
function registro(values){const fields=values.map(campo),tipos=juntar(...fields.map(f=>varint(f.serial)));let size=tipos.length+1,prior=0;
 do{prior=size;size=tipos.length+varint(size).length;}while(size!==prior);
 return juntar(varint(size),tipos,...fields.map(f=>f.bytes));
}
function celula(id,values){const payload=registro(values);if(payload.length>PAGE_SIZE-80)throw new Error('Um campo excede o tamanho aceito para exportação SQLite.');return juntar(varint(payload.length),varint(id),payload);}
function folha(b,page,items,isFirst=false){const off=(page-1)*PAGE_SIZE,head=off+(isFirst?100:0);let cursor=off+PAGE_SIZE;
 b[head]=13;u16(b,head+1,0);u16(b,head+3,items.length);
 for(let i=0;i<items.length;i++){
  cursor-=items[i].length;if(cursor<head+8+items.length*2)throw new Error('Página SQLite cheia.');
  b.set(items[i],cursor);u16(b,head+8+i*2,cursor-off);
 }
 u16(b,head+5,cursor-off);
}
function alocarFolhas(cells){const groups=[];let current=[],total=8;
 for(const cell of cells){if(total+2+cell.length>PAGE_SIZE){groups.push(current);current=[];total=8;}
  if(cell.length+10>PAGE_SIZE)throw new Error('Item muito grande para uma página SQLite.');
  current.push(cell);total+=2+cell.length;
 }
 if(current.length)groups.push(current);return groups;
}
/** Retorna bytes de um SQLite válido com tabela QUEIMA_ESTOQUE_ITEM e cinco campos operacionais. */
export function gerarDbMapa(registros){
 if(!Array.isArray(registros)||!registros.length)throw new Error('Selecione itens do mapa para exportar.');
 if(registros.length>5000)throw new Error('O arquivo DB permite até 5.000 itens por vez. Restrinja os filtros.');
 const schema='CREATE TABLE QUEIMA_ESTOQUE_ITEM ("EAN" TEXT, "COD_INTERNO" TEXT, "LOTE" TEXT, "VALIDADE" TEXT, "QUANTIDADE" INTEGER)';
 const meta=[celula(1,['table','QUEIMA_ESTOQUE_ITEM','QUEIMA_ESTOQUE_ITEM',2,schema])];
 const cells=registros.map((r,i)=>{
  const codigo=String(r.codigoInterno??'').trim(),ean=String(r.ean??'').trim(),lote=String(r.lote??'').trim(),validade=String(r.validade??'').slice(0,10),quantidade=Number(r.quantidade);
  if(!codigo&&!/^\d{8,14}$/.test(ean))throw new Error(`Registro ${i+1}: informe EAN quando não houver código interno.`);
  if(!lote||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(validade)||!Number.isSafeInteger(quantidade)||quantidade<0)throw new Error(`Registro ${i+1}: lote, validade ou quantidade inválidos.`);
  return celula(i+1,[codigo?null:ean,codigo||null,lote,validade,quantidade]);
 });
 const groups=alocarFolhas(cells);
 const multi=groups.length>1;
 if(multi&&groups.length>300)throw new Error('Muitos itens para exportação DB. Divida o mapa por filtros.');
 const pages=multi?2+groups.length:2,b=new Uint8Array(pages*PAGE_SIZE);
 b.set(enc.encode('SQLite format 3\0'),0);u16(b,16,PAGE_SIZE);b[18]=1;b[19]=1;b[20]=0;b[21]=64;b[22]=32;b[23]=32;
 u32(b,24,1);u32(b,28,pages);u32(b,32,0);u32(b,36,0);u32(b,40,1);u32(b,44,4);u32(b,48,0);u32(b,52,0);u32(b,56,1);u32(b,60,0);u32(b,64,0);u32(b,68,0);u32(b,92,1);u32(b,96,3040001);
 folha(b,1,meta,true);
 if(!multi)folha(b,2,groups[0]);
 else{
  for(let i=0;i<groups.length;i++)folha(b,3+i,groups[i]);
  const head=PAGE_SIZE;b[head]=5;u16(b,head+1,0);u16(b,head+3,groups.length-1);
  let pos=PAGE_SIZE*2;
  for(let i=0;i<groups.length-1;i++){
   const child=3+i,key=groups.slice(0,i+1).reduce((n,g)=>n+g.length,0);
   const entry=juntar(Uint8Array.of(child>>>24,(child>>>16)&255,(child>>>8)&255,child&255),varint(key));
   pos-=entry.length;b.set(entry,pos);u16(b,head+12+i*2,pos-PAGE_SIZE);
  }
  u16(b,head+5,pos-PAGE_SIZE);u32(b,head+8,2+groups.length);
 }
 return b;
}
export function baixarArquivoBinario(bytes,nome,doc=globalThis.document){
 const url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));
 const a=doc.createElement('a');a.href=url;a.download=nome;doc.body.append(a);
 try{a.click();}finally{a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
}
