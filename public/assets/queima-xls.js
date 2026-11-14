/* Leitor local e estritamente limitado de relatórios .XLS (BIFF8/CFB) do Procfit.
 * Dados são conferidos novamente no servidor; nenhum arquivo é enviado a terceiros.
 */
const assinatura=[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1];
const registrar=b=>{const t=new DataView(b.buffer,b.byteOffset,b.byteLength);return {u8:o=>t.getUint8(o),u16:o=>t.getUint16(o,true),u32:o=>t.getUint32(o,true),i32:o=>t.getInt32(o,true),f64:o=>t.getFloat64(o,true)};};
const excelData=n=>{if(!Number.isFinite(n)||n<1||n>2958465)throw Error('Data numérica XLS inválida.');
  const v=new Date((Math.floor(n)-25569)*86400000);const iso=v.toISOString().slice(0,10);return iso;};
export function registroDaQueimaNome(nome){const match=/^queima[-_ ](\d{1,20})(?:\s*\(\d+\))?\.xls$/i.exec(String(nome||''));if(!match)throw Error('O nome do arquivo deve seguir Queima-166240.xls.');return match[1];}
export function vencidoParaQueima(data,hoje){return /^\d{4}-\d\d-\d\d$/.test(data)&&data<hoje;}
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
function obterSST(partes){if(!partes.length)return [];
 // Os textos no modelo do Procfit não cruzam limites de CONTINUE.
 // Se houver split dentro de string, avisar em vez de interpretar errado.
 const sum=partes.reduce((s,p)=>s+p.length,0),a=new Uint8Array(sum);let k=0;
 for(const p of partes){a.set(p,k);k+=p.length;}
 const v=registrar(a),n=v.u32(4),out=[];let at=8;
 if(n>100000)throw Error('Quantidade de textos XLS excessiva.');
 for(let i=0;i<n;i++){
  if(at+3>a.length)throw Error('Tabela de textos XLS incompleta.');
  const len=v.u16(at),flag=v.u8(at+2);at+=3;
  if(flag&0xf2)throw Error('XLS usa codificação de texto não suportada nesta versão.');
  const rt=flag&8?v.u16(at):0;if(rt)at+=2;const ext=flag&4?v.u32(at):0;if(ext)at+=4;
  const count=len*(flag&1?2:1);if(at+count>a.length)throw Error('Texto XLS fragmentado em CONTINUE.');
  let s='';for(let j=0;j<len;j++)s+=String.fromCharCode(flag&1?v.u16(at+2*j):v.u8(at+j));at+=count+rt*4+ext;out.push(s);
 }
 return out;
}
function decodificarRK(x){let num;if(x&2)num=x&0x80000000?(x>>2): (x>>>2);else{const b=new ArrayBuffer(8),dv=new DataView(b);dv.setUint32(4,x&0xfffffffc,true);num=dv.getFloat64(0,true);}return x&1?num/100:num;}
export function lerArquivoQueimaXls(arrayBuffer,nome){
 const registro=registroDaQueimaNome(nome),a=cfbWorkbook(new Uint8Array(arrayBuffer)),v=registrar(a),records=[],sst=[];
 let at=0;while(at+4<=a.length){const id=v.u16(at),length=v.u16(at+2);if(at+4+length>a.length)throw Error('Registro BIFF8 inválido.');records.push({id,at:at+4,length});at+=4+length;}
 const bounds=records.find(x=>x.id===0x85),markSst=records.findIndex(x=>x.id===0xfc);
 if(!bounds||markSst<0)throw Error('Estrutura da planilha XLS não reconhecida.');
 const parts=[a.subarray(records[markSst].at,records[markSst].at+records[markSst].length)];
 for(let i=markSst+1;records[i]?.id===0x3c;i++)parts.push(a.subarray(records[i].at,records[i].at+records[i].length));
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
 const header=linhas.get(0)||{},norm=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 
 if(norm(header[0])!=='ean'||norm(header[1])!=='produto'||norm(header[3])!=='motivo de queima'||norm(header[5])!=='lote'||norm(header[6])!=='validade'||norm(header[7])!=='quantidade')
  throw Error('As colunas do XLS não correspondem ao relatório Queima do Procfit.');
 const itens=[];
 for(const [n,r] of [...linhas.entries()].filter(([i])=>i>0).sort((a,b)=>a[0]-b[0])){
  if(!Object.keys(r).length)continue;
  const codigo=String(r[1]??'').trim().replace(/\.0$/,''),ean=String(r[0]??'').trim().replace(/\.0$/,'');
  const motivo=Number(r[3]),lote=String(r[5]??'').trim().replace(/\.0$/,'');
  let validade='';if(typeof r[6]==='number'){validade=excelData(r[6]);}
  else {const txt=String(r[6]??'').trim(),m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(txt);validade=m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:txt;}
  itens.push({linha:n+1,codigo_interno:codigo,ean,lote,validade,quantidade:Number(r[7]),motivo,descricao:String(r[2]??''),registro_queima:registro});
 }
 if(!itens.length)throw Error('Nenhum produto encontrado no arquivo.');
 return {registro,itens};
}
