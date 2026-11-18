/* Leitor local e estritamente limitado de relatórios .XLS (BIFF8/CFB) do Procfit.
 * Dados são conferidos novamente no servidor; nenhum arquivo é enviado a terceiros.
 */
const assinatura=[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1];
const registrar=b=>{const t=new DataView(b.buffer,b.byteOffset,b.byteLength);return {u8:o=>t.getUint8(o),u16:o=>t.getUint16(o,true),u32:o=>t.getUint32(o,true),i32:o=>t.getInt32(o,true),f64:o=>t.getFloat64(o,true)};};
const excelData=n=>{if(!Number.isFinite(n)||n<1||n>2958465)throw Error('Data numérica XLS inválida.');
  const v=new Date((Math.floor(n)-25569)*86400000);const iso=v.toISOString().slice(0,10);return iso;};
export function registroDaQueimaNome(nome){const match=/^Queima-(\d{1,20})\.xls$/i.exec(String(nome||''));if(!match)throw Error('O nome do arquivo deve ser Queima-NUMERO_DO_REGISTRO.xls (ex.: Queima-176421.xls).');return match[1];}
/** Data de corte: hoje + 7 dias de calendário; hoje e os próximos 6 não entram. */
export function limiteMinimoQueima(hoje){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(hoje)))throw Error('Data de referência inválida.');
 const dt=new Date(hoje+'T00:00:00Z');
 if(!Number.isFinite(dt.getTime())||dt.toISOString().slice(0,10)!==hoje)throw Error('Data de referência inválida.');
 dt.setUTCDate(dt.getUTCDate()+7);
 return dt.toISOString().slice(0,10);
}
export function prazoInsuficienteParaQueima(data,hoje){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(data)))return true;
 const dt=new Date(data+'T00:00:00Z');
 return !Number.isFinite(dt.getTime())||dt.toISOString().slice(0,10)!==data||data<limiteMinimoQueima(hoje);
}
export const vencidoParaQueima=prazoInsuficienteParaQueima; // compatibilidade interna com v40

function cfbWorkbook(buffer){
 const bytes=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer),r=registrar(bytes);
 if(bytes.byteLength>12*1024*1024||bytes.length<1024||assinatura.some((v,i)=>bytes[i]!==v))throw Error('Selecione um arquivo XLS binário válido (até 12 MB).');
 const tam=2**r.u16(30),qtFats=r.u32(44);if(tam!==512||qtFats>2000)throw Error('Formato OLE da planilha não suportado.');
 const bloco=id=>{const at=(id+1)*tam;if(at<512||at+tam>bytes.length)throw Error('Setor XLS inválido.');return bytes.subarray(at,at+tam);};
 const ids=[];for(let i=0;i<Math.min(qtFats,109);i++){const n=r.u32(76+4*i);if(n<0xfffffffa)ids.push(n);}
 const fat=[];for(const n of ids){const b=bloco(n),v=registrar(b);for(let i=0;i<tam/4;i++)fat.push(v.u32(i*4));}
 const cadeia=(first,max=30000)=>{const out=[],visit=new Set();let id=first;while(id<0xfffffffa){if(visit.has(id)||id>=fat.length||out.length>=max)throw Error('Cadeia de setores inválida.');visit.add(id);out.push(bloco(id));id=fat[id];}return out;};
 const concatenar=(partes,length)=>{const all=new Uint8Array(length??partes.reduce((t,x)=>t+x.length,0));let i=0;for(const parte of partes){if(i>=all.length)break;all.set(parte.subarray(0,all.length-i),i);i+=parte.length;}return all;};
 const dir=concatenar(cadeia(r.u32(48)));let entrada=null;
 for(let i=0;i+128<=dir.length;i+=128){const v=registrar(dir.subarray(i,i+128));const n=v.u16(64);if(n<2||n>64)continue;
  const name=String.fromCharCode(...Array.from({length:n/2-1},(_,k)=>v.u16(k*2)));
  if(name==='Workbook'||name==='Book'){entrada={start:v.u32(116),size:v.u32(120)};break;}}
 if(!entrada||entrada.size<4096||entrada.size>12*1024*1024)throw Error('Fluxo Workbook não encontrado.');
 return concatenar(cadeia(entrada.start),entrada.size);
}
function obterSST(partes){
 if(!partes.length)return [];
 // SST/CONTINUE BIFF8: em uma quebra no meio de texto, o próximo bloco
 // inicia com 1 byte que informa a codificação daquele trecho. Não é
 // permitido simplesmente concatenar os blocos.
 let bloco=0,pos=0;
 const proximo=()=>{if(++bloco>=partes.length)throw Error('SST XLS truncada em CONTINUE.');pos=0;};
 const ler=(n)=>{const b=[];for(let j=0;j<n;j++){
   while(bloco<partes.length&&pos>=partes[bloco].length)proximo();
   b.push(partes[bloco][pos++]);
  }return b;};
 const u8=()=>ler(1)[0],u16=()=>{const a=ler(2);return a[0]|(a[1]<<8);},u32=()=>{const a=ler(4);return (a[0]+a[1]*256+a[2]*65536+a[3]*16777216)>>>0;};
 const total=u32(),n=u32();if(n>100000||total>1000000)throw Error('Quantidade de textos XLS excessiva.');
 const out=[];
 for(let i=0;i<n;i++){
  const len=u16(),flag=u8();
  if(flag&0xf2)throw Error('XLS usa formato de texto não suportado nesta versão.');
  const rt=flag&8?u16():0,ext=flag&4?u32():0;
  let unicode=Boolean(flag&1),texto='';
  for(let j=0;j<len;j++){
   if(pos===partes[bloco].length){
    proximo();
    const option=u8();
    if(option!==0&&option!==1)throw Error('Codificação CONTINUE XLS inválida.');
    unicode=Boolean(option&1);
   }
   const code=unicode?u16():u8();
   texto+=String.fromCharCode(code);
  }
  // Dados de rich-text e extensões seguem os caracteres, sem byte de
  // codificação extra quando atravessam um limite de CONTINUE.
  if(rt)ler(rt*4);
  if(ext)ler(ext);
  out.push(texto);
 }
 return out;
}
function decodificarRK(x){let num;if(x&2)num=x&0x80000000?(x>>2): (x>>>2);else{const b=new ArrayBuffer(8),dv=new DataView(b);dv.setUint32(4,x&0xfffffffc,true);num=dv.getFloat64(0,true);}return x&1?num/100:num;}
export function lerArquivoQueimaXls(arrayBuffer,nome){
 const registro=registroDaQueimaNome(nome),a=cfbWorkbook(new Uint8Array(arrayBuffer)),v=registrar(a),records=[],sst=[];
 let at=0;while(at+4<=a.length){const id=v.u16(at),length=v.u16(at+2);if(at+4+length>a.length)throw Error('Registro BIFF8 inválido.');records.push({id,at:at+4,length});at+=4+length;}
 const bounds=records.find(x=>x.id===0x85),markSst=records.findIndex(x=>x.id===0xfc);
 if(!bounds)throw Error('Estrutura da planilha XLS não reconhecida: não contém abas.');
 // BIFF5/Excel 5 (Book) usa LABEL por célula e não possui SST.
 // BIFF8/Excel 97+ (Workbook) usa SST dividido em CONTINUE.
 const parts=markSst<0?[]:[a.subarray(records[markSst].at,records[markSst].at+records[markSst].length)];
 for(let i=markSst+1;markSst>=0&&records[i]?.id===0x3c;i++)parts.push(a.subarray(records[i].at,records[i].at+records[i].length));
 const strings=obterSST(parts),linhas=new Map(),col=(row,c,value)=>{if(row>100000||c>300)throw Error('Dimensões XLS excessivas.');if(!linhas.has(row))linhas.set(row,{});linhas.get(row)[c]=value;};
 const aba=v.u32(bounds.at);if(aba>a.length-4)throw Error('Aba XLS inválida.');
 for(const r of records){if(r.at<=aba)continue;const d=registrar(a.subarray(r.at,r.at+r.length));
   if(r.id===0x000a)break;
   if(r.id===0xfd){const row=d.u16(0),c=d.u16(2),ind=d.u32(6);col(row,c,strings[ind]??'');}
   else if(r.id===0x203){col(d.u16(0),d.u16(2),d.f64(6));}
   else if(r.id===0x27e){col(d.u16(0),d.u16(2),decodificarRK(d.u32(6)));}
   else if(r.id===0xbd){const row=d.u16(0),first=d.u16(2),last=d.u16(r.length-2);if(last-first>500)throw Error('XLS inválido.');for(let i=first;i<=last;i++)col(row,i,decodificarRK(d.u32(4+6*(i-first)+2)));}
   else if(r.id===0x204){const row=d.u16(0),c=d.u16(2),len=d.u16(6),x=a.subarray(r.at+8,r.at+8+len);col(row,c,new TextDecoder('windows-1252').decode(x));}
 }
 const norm=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 // O Procfit exporta pelo menos dois layouts: o relatório clássico começa
 // com EAN/Produto; a listagem F1 começa com Motivo de Queima/EAN/Produto.
 // Colunas repetidas como Produto (código e descrição) usam a primeira ocorrência.
 const primeiraColuna=(header,nomes)=>Object.keys(header).map(Number).sort((a,b)=>a-b).find(c=>nomes.includes(norm(header[c])));
 let cabecalho=null,indices=null,primeiraLinha=0;
 for(const [i,linha] of [...linhas.entries()].sort((a,b)=>a[0]-b[0]).slice(0,30)){
  const cols={
   ean:primeiraColuna(linha,['ean']),codigo:primeiraColuna(linha,['produto','codigo interno','cod interno','codigo']),
   lote:primeiraColuna(linha,['lote']),validade:primeiraColuna(linha,['validade']),
   quantidade:primeiraColuna(linha,['quantidade','qtd','qtde']),motivo:primeiraColuna(linha,['motivo de queima','motivo']),
   descricao:primeiraColuna(linha,['descricao','descricao produto'])
  };
  if(['codigo','lote','validade','quantidade','motivo'].every(k=>cols[k]!==undefined)){
   cabecalho=linha;indices=cols;primeiraLinha=i;break;
  }
 }
 if(!indices)throw Error('Estrutura XLS não reconhecida: faltam colunas Produto, Lote, Validade, Quantidade ou Motivo de Queima.');
 const valor=(r,c)=>c===undefined?'':r[c];
 const texto=x=>String(x??'').trim().replace(/\.0$/,'');
 const itens=[];
 for(const [n,r] of [...linhas.entries()].filter(([i])=>i>primeiraLinha).sort((a,b)=>a[0]-b[0])){
  if(!Object.keys(r).length)continue;
  const codigo=texto(valor(r,indices.codigo)),ean=texto(valor(r,indices.ean));
  const motivo=Number(valor(r,indices.motivo)),lote=texto(valor(r,indices.lote));
  const raw=valor(r,indices.validade);
  let validade='';if(typeof raw==='number'){validade=excelData(raw);}
  else {const txt=String(raw??'').trim(),m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(txt);validade=m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:txt;}
  itens.push({linha:n+1,codigo_interno:codigo,ean,lote,validade,quantidade:Number(valor(r,indices.quantidade)),motivo,descricao:String(valor(r,indices.descricao)??''),registro_queima:registro});
 }
 if(!itens.length)throw Error('Nenhum produto encontrado no arquivo.');
 return {registro,itens};
}
