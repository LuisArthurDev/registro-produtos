/**
 * Gerador EXPERIMENTAL para testes de interoperabilidade com o Procfit.
 * Estrutura binária baseada em cópia sanitizada do TDB exportado pelo usuário.
 * NENHUMA GARANTIA de que Ctrl+Alt+I aceitará o arquivo; não usar em produção.
 * Este módulo não aprova Queima e nunca altera o arquivo de modelo.
 */
const MODELO_SHA256='5261d6c1959fbcf588bcd9bf8df9eac8c58aff6c0310572ecda1768e37e50d4b';
const MODELO='/assets/procfit-modelo-teste.tdb';
const PAGE=4096, PHASE=380, PAYLOAD=4056;
const HEADER_PAGE=10, HEADER_INDEX=9, HEADER_INFO=8;
const ITEM_FIRST_PAGE=16, ITEM_INDEX=15, ITEM_INFO=14;
const MAX_ITEMS=10_000;
const ORIGEM_FORMULARIO=568094,ORIGEM_TABELA=565206;
const FIELDS_HEADER=[
 ['QUEIMA_ESTOQUE','double',8],['FORMULARIO_ORIGEM','double',8],['TAB_MASTER_ORIGEM','double',8],
 ['REG_MASTER_ORIGEM','double',8],['REG_LOG_INCLUSAO','double',8],['USUARIO_LOGADO','double',8],
 ['DATA_HORA','datetime',8],['EMPRESA','double',8],
];
const FIELDS_ITEM=[
 ['QUEIMA_ESTOQUE_ITEM','double',8],['FORMULARIO_ORIGEM','double',8],['TAB_MASTER_ORIGEM','double',8],
 ['REG_MASTER_ORIGEM','double',8],['REG_LOG_INCLUSAO','double',8],['QUEIMA_ESTOQUE','double',8],
 ['EAN','varchar',14],['PRODUTO','double',8],['LOTE','varchar',16],['VALIDADE','datetime',8],
 ['QUANTIDADE','double',8],['CURVA','varchar',2],['PRECO_VENDA','double',8],['APROVADO','varchar',2],
 ['DEMANDA_DIA_PONDERADA','double',8],['ESTOQUE','double',8],['QUEIMA_ESTOQUE_MOTIVO','double',8],
 ['USUARIO_APROVACAO','double',8],['DATA_HORA_APROVACAO','datetime',8],['QUEIMA_ESTOQUE_PRECO_ITEM','double',8],
 ['GRUPO_PRODUTO','double',8],['CATEGORIA_PRODUTO','double',8],['DATA_INCLUSAO','datetime',8],
 ['DATA_PRIMEIRA_COMPRA','datetime',8],['PROMOCAO_VIGENTE','varchar',2],['DESCRICAO_PROMOCAO','varchar',51],
];
const cp1252Extras=new Map([['€',0x80],['‚',0x82],['ƒ',0x83],['„',0x84],['…',0x85],['†',0x86],['‡',0x87],['ˆ',0x88],['‰',0x89],['Š',0x8a],['‹',0x8b],['Œ',0x8c],['Ž',0x8e],['‘',0x91],['’',0x92],['“',0x93],['”',0x94],['•',0x95],['–',0x96],['—',0x97],['˜',0x98],['™',0x99],['š',0x9a],['›',0x9b],['œ',0x9c],['ž',0x9e],['Ÿ',0x9f]]);

function codificar1252(text,max,field){
 const out=[];
 for(const char of text){
  const n=char.codePointAt(0),b=cp1252Extras.get(char)??(n<128||n>=160&&n<=255?n:null);
  if(b===null)throw new Error(`${field}: caractere não representável no TDB (Windows-1252).`);
  out.push(b);
  if(out.length>max)throw new Error(`${field}: ultrapassa ${max} caracteres/bytes suportados pelo arquivo de exemplo. Não é permitido cortar dados.`);
 }
 return out;
}
function dataTdb(value){
 const s=String(value??'');const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
 if(!m)throw new Error(`Validade inválida: ${s}. Informe AAAA-MM-DD.`);
 const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]);
 const stamp=Date.UTC(y,mo-1,d),date=new Date(stamp);
 if(y<1900||y>9999||date.getUTCFullYear()!==y||date.getUTCMonth()!==mo-1||date.getUTCDate()!==d)
  throw new Error(`Validade inexistente: ${s}.`);
 // Absolute Database: TABSDateTime.Date = dias desde 0001-01-01 (dia 1).
 return [Math.round(stamp/86400000)+719163,0];
}
function dataHora(d){
 if(!(d instanceof Date)||!Number.isFinite(d.getTime()))throw new Error('Data/hora de criação inválida.');
 const y=d.getFullYear(),mo=d.getMonth()+1,day=d.getDate();
 const days=Math.round(Date.UTC(y,mo-1,day)/86400000)+719163;
 const millis=(((d.getHours()*60+d.getMinutes())*60+d.getSeconds())*1000+d.getMilliseconds());
 return [days,millis];
}
function payloadOf(page){return PHASE+page*PAGE+40;}
function headerOf(page){return PHASE+page*PAGE;}
function recLayout(fields){
 const nullBytes=Math.ceil(fields.length/8),recordSize=nullBytes+fields.reduce((s,f)=>s+f[2],0);
 let capacity=Math.floor(PAYLOAD/recordSize);
 while(Math.ceil(capacity/8)+capacity*recordSize>PAYLOAD)capacity--;
 return {nullBytes,recordSize,capacity,bitmapBytes:Math.ceil(capacity/8)};
}
const HEADER_LAYOUT=recLayout(FIELDS_HEADER);
const ITEM_LAYOUT=recLayout(FIELDS_ITEM);
function packRecord(bytes,location,fields,values){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const nullBytes=Math.ceil(fields.length/8);
 bytes.fill(0xff,location,location+nullBytes);
 let at=location+nullBytes;
 for(let i=0;i<fields.length;i++){
  const [name,type,width]=fields[i],value=values[name];
  if(value!==null&&value!==undefined&&value!==''){
   bytes[location+(i>>3)]&=~(1<<(i&7));
   if(type==='double'){
    const n=Number(value);
    if(!Number.isSafeInteger(n)||n<0)throw new Error(`${name}: deve ser um inteiro positivo válido.`);
    view.setFloat64(at,n,true);
   }else if(type==='datetime'){
    const [ordinal,millis]=Array.isArray(value)?value:dataTdb(value);
    view.setInt32(at,ordinal,true);view.setInt32(at+4,millis,true);
   }else if(type==='varchar'){
    const text=String(value),codes=codificar1252(text,width-1,name);
    for(let j=0;j<codes.length;j++)bytes[at+j]=codes[j];
   }
  }
  at+=width;
 }
}
function getInt32(b,offset){return new DataView(b.buffer,b.byteOffset,b.byteLength).getInt32(offset,true);}
function setInt32(b,offset,value){new DataView(b.buffer,b.byteOffset,b.byteLength).setInt32(offset,value,true);}
function getUint16(b,offset){return new DataView(b.buffer,b.byteOffset,b.byteLength).getUint16(offset,true);}
function setUint16(b,offset,value){new DataView(b.buffer,b.byteOffset,b.byteLength).setUint16(offset,value,true);}
function bumpState(b,page,count=1){const at=headerOf(page)+4;setInt32(b,at,getInt32(b,at)+count);}
function setInfo(b,page,changes,records){
 const at=payloadOf(page),n=getInt32(b,at+1);
 if(n<=0||n>300)throw new Error('Cabeçalho da tabela inválido.');
 setInt32(b,at+10+n-8,changes);setInt32(b,at+10+n-4,records);
 bumpState(b,page);
}
function setIndex(b,page,pageCounts){
 const at=payloadOf(page);
 if(b[at]!==1||b[at+1]!==1||getUint16(b,at+12)!==4)throw new Error('Formato de índice inesperado no modelo TDB.');
 if(pageCounts.length>(PAYLOAD-18)/6)throw new Error('Muitos produtos para o índice de teste (arquivo ficaria inconsistente).');
 setUint16(b,at+14,pageCounts.length);
 for(let i=0;i<pageCounts.length;i++){
  setInt32(b,at+18+i*6,pageCounts[i].page);
  setUint16(b,at+18+i*6+4,pageCounts[i].count);
 }
 bumpState(b,page);
}
function bitPageAllocated(b,page){const at=payloadOf(0)+(page>>3);return !!(b[at]&(1<<(page&7)));}
function allocatePages(b,lastPage){
 let novos=0;
 const view=new DataView(b.buffer,b.byteOffset,b.byteLength);
 const currentTotal=getInt32(b,30),nPages=b.length-PHASE;
 if(nPages%PAGE!==0||nPages/PAGE!==currentTotal)throw new Error('Geometria do modelo inconsistente.');
 const baseHeader=b.slice(headerOf(ITEM_FIRST_PAGE),headerOf(ITEM_FIRST_PAGE)+40);
 for(let pg=ITEM_FIRST_PAGE+1;pg<=lastPage;pg++){
  if(bitPageAllocated(b,pg))throw new Error(`Página ${pg} já ocupada no modelo. Geração recusada.`);
  b.set(baseHeader,headerOf(pg));
  setInt32(b,headerOf(pg)+4,150000+pg); // Estado sintético para página recém-criada.
  const pos=payloadOf(0)+(pg>>3);
  b[pos]|=1<<(pg&7);novos++;
 }
 if(novos)bumpState(b,0,novos);
 let changedExtents=0;
 const extSize=getUint16(b,28);if(extSize!==8)throw new Error('Geometria de extents desconhecida.');
 for(let ext=0;ext<=Math.floor(lastPage/8);ext++){
  let count=0;
  for(let pg=ext*8;pg<ext*8+8;pg++)if(pg<getInt32(b,30)&&bitPageAllocated(b,pg))count++;
  const target=count===0?0:count===8?3:1;
  const idx=payloadOf(1)+(ext>>2),shift=(ext&3)*2,actual=(b[idx]>>shift)&3;
  if(actual!==target){b[idx]=(b[idx]&~(3<<shift))|(target<<shift);changedExtents++;}
 }
 if(changedExtents)bumpState(b,1,changedExtents);
 setInt32(b,34,lastPage); // LastUsedPageNo
 return novos;
}
function encodeItems(orig,itens,{empresa,usuarioProcfit=5584,geradoEm=new Date(),sequencia}={}){
 if(!Array.isArray(itens)||itens.length===0)throw new Error('Nenhum registro elegível para gerar o TDB.');
 if(itens.length>MAX_ITEMS)throw new Error(`O gerador experimental permite até ${MAX_ITEMS.toLocaleString('pt-BR')} registros.`);
 const id=Number(sequencia??(700000000+Date.now()%150000000+Math.floor(Math.random()*500000)));
 if(!Number.isSafeInteger(id)||id<100000||id+MAX_ITEMS+100000>2000000000)throw new Error('Identificador de teste inválido.');
 const empresaNum=Number(empresa);
 if(!Number.isSafeInteger(empresaNum)||empresaNum<=0||empresaNum>1_000_000)throw new Error('Empresa inválida.');
 const usuario=Number(usuarioProcfit);
 if(!Number.isSafeInteger(usuario)||usuario<=0)throw new Error('Informe o ID de usuário Procfit válido, exibido nos metadados do modelo original.');
 const headerId=id,itemStart=id+100000;
 const head={QUEIMA_ESTOQUE:headerId,FORMULARIO_ORIGEM:ORIGEM_FORMULARIO,
  TAB_MASTER_ORIGEM:ORIGEM_TABELA,USUARIO_LOGADO:usuario,DATA_HORA:dataHora(geradoEm),EMPRESA:empresaNum};
 const encoded=itens.map((x,i)=>{
  if(Number(x.QUEIMA_ESTOQUE_MOTIVO)!==4)throw new Error(`Motivo diferente de 4 no item ${i+1}.`);
  const ean=String(x.EAN??''),lote=String(x.LOTE??''),produto=String(x.PRODUTO??'');
  if(ean&&!/^\d{8,14}$/.test(ean))throw new Error(`EAN inválido no item ${i+1}.`);
  if(!ean&&!produto)throw new Error(`Produto sem Código Interno e sem EAN no item ${i+1}.`);
  if(!lote)throw new Error(`Lote ausente no item ${i+1}.`);
  const qtd=Number(x.QUANTIDADE);
  if(!Number.isSafeInteger(qtd)||qtd<=0)throw new Error(`Quantidade corrigida inválida no item ${i+1}.`);
  return {
   QUEIMA_ESTOQUE_ITEM:itemStart+i,FORMULARIO_ORIGEM:ORIGEM_FORMULARIO,
   TAB_MASTER_ORIGEM:ORIGEM_TABELA,REG_MASTER_ORIGEM:headerId,QUEIMA_ESTOQUE:headerId,
   QUEIMA_ESTOQUE_MOTIVO:4,PRODUTO:produto||null,EAN:ean||null,LOTE:lote,VALIDADE:x.VALIDADE,QUANTIDADE:qtd
  };
 });
 return {head,encoded,headerId};
}
export const CONFIG_TDB_TESTE=Object.freeze({modelo:MODELO,sha256:MODELO_SHA256,maxItems:MAX_ITEMS,limiteEAN:13,limiteLote:15});
export async function gerarTdbExperimental(preparacao,{modeloBytes,empresa,usuarioProcfit=5584,geradoEm=new Date(),sequencia,cryptoApi=globalThis.crypto}={}){
 const itens=preparacao?.documento?.tabelas?.QUEIMA_ESTOQUE_ITEM;
 if(preparacao?.documento?.tipo!=='PREPARACAO_PROCFIT_QUEIMA'||!Array.isArray(itens))throw new Error('A preparação deve vir da conferência corrigida.');
 if(preparacao.documento.motivo_fixo!==4)throw new Error('Apenas Motivo 4 é permitido.');
 const {head,encoded,headerId}=encodeItems(null,itens,{empresa:empresa??preparacao.documento.empresa_contexto,usuarioProcfit,geradoEm,sequencia});
 if(!modeloBytes)throw new Error('O modelo TDB sanitizado não foi carregado.');
 const source=modeloBytes instanceof Uint8Array?modeloBytes:new Uint8Array(modeloBytes);
 if(!cryptoApi?.subtle?.digest)throw new Error('O navegador não permite verificar a integridade do modelo.');
 const digest=await cryptoApi.subtle.digest('SHA-256',source);
 const hash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
 if(hash!==MODELO_SHA256)throw new Error('O modelo binário não corresponde ao Teste2 validado. Geração cancelada.');
 if(HEADER_LAYOUT.recordSize!==65||ITEM_LAYOUT.recordSize!==251||ITEM_LAYOUT.capacity!==16)throw new Error('Layout de registros inesperado.');
 if(source.length!==PHASE+22*PAGE)throw new Error('Tamanho do modelo inválido.');
 const nDataPages=Math.ceil(encoded.length/ITEM_LAYOUT.capacity);
 if(nDataPages>(PAYLOAD-18)/6)throw new Error('Índice interno não suporta esta quantidade de itens.');
 const lastPage=ITEM_FIRST_PAGE+nDataPages-1;
 const neededPages=lastPage<22?22:22+Math.ceil((lastPage+1-22)/8)*8;
 const bytes=new Uint8Array(PHASE+neededPages*PAGE);bytes.set(source);
 if(neededPages!==22)setInt32(bytes,30,neededPages);
 // Metadados antigos foram zerados na criação do modelo; nenhuma solicitação anterior é reaproveitada.
 packRecord(bytes,payloadOf(HEADER_PAGE)+HEADER_LAYOUT.bitmapBytes,FIELDS_HEADER,head);
 bytes[payloadOf(HEADER_PAGE)]|=1;
 bumpState(bytes,HEADER_PAGE);
 setInfo(bytes,HEADER_INFO,1,1);setIndex(bytes,HEADER_INDEX,[{page:HEADER_PAGE,count:1}]);
 // Alocação e preenchimento de páginas de dados da QUEIMA_ESTOQUE_ITEM.
 allocatePages(bytes,lastPage);
 const itemIndexEntries=[];
 for(let p=0;p<nDataPages;p++){
  const pageNo=ITEM_FIRST_PAGE+p,first=p*ITEM_LAYOUT.capacity,count=Math.min(ITEM_LAYOUT.capacity,encoded.length-first);
  for(let j=0;j<count;j++){
   const at=payloadOf(pageNo)+ITEM_LAYOUT.bitmapBytes+j*ITEM_LAYOUT.recordSize;
   packRecord(bytes,at,FIELDS_ITEM,encoded[first+j]);
   bytes[payloadOf(pageNo)+(j>>3)]|=1<<(j&7);
  }
  bumpState(bytes,pageNo);
  itemIndexEntries.push({page:pageNo,count});
 }
 setInfo(bytes,ITEM_INFO,encoded.length,encoded.length);setIndex(bytes,ITEM_INDEX,itemIndexEntries);
 setInt32(bytes,38,getInt32(bytes,38)+1);
 return {bytes,items:encoded.length,solicitacaoTeste:headerId,empresa:Number(head.EMPRESA),paginas:nDataPages,
  aviso:'TDB BINÁRIO EXPERIMENTAL: compatibilidade com Ctrl+Alt+I ainda NÃO homologada. Testar em ambiente controlado, sem confirmar Queima.'};
}
export async function obterModeloTdb({fetcher=globalThis.fetch}={}){
 if(typeof fetcher!=='function')throw new Error('Navegador sem acesso ao modelo TDB.');
 const r=await fetcher(MODELO,{cache:'no-store'});
 if(!r.ok)throw new Error(`Não foi possível carregar o modelo binário (HTTP ${r.status}).`);
 return new Uint8Array(await r.arrayBuffer());
}
export function baixarTdbExperimental(resultado,{doc=globalThis.document,urlApi=globalThis.URL,BlobCtor=globalThis.Blob}={}){
 if(!(resultado?.bytes instanceof Uint8Array)||!doc?.createElement||!urlApi?.createObjectURL||!BlobCtor)throw new Error('Download TDB indisponível.');
 const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\..*/,'').replace('T','-');
 const nome=`PROCFIT_QUEIMA_TESTE_LOJA${resultado.empresa}_${stamp}.TDB`;
 const blob=new BlobCtor([resultado.bytes],{type:'application/octet-stream'});
 const url=urlApi.createObjectURL(blob),a=doc.createElement('a');
 a.href=url;a.download=nome;a.hidden=true;doc.body.appendChild(a);
 try{a.click();}finally{a.remove();globalThis.setTimeout?.(()=>urlApi.revokeObjectURL(url),2000);}
 return nome;
}
