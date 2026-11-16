/** Pacote ZIP (sem dependências) para XLS de até 100 produtos por arquivo. */
import { gerarMapaProcfitXls } from './mapa-procfit-xls.js';

export const TAMANHO_LOTE_PROCFIT = 100;

const encode = value => new TextEncoder().encode(value);
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let i=0;i<256;i++) {
    let c=i;
    for (let j=0;j<8;j++) c=c&1 ? (0xEDB88320^(c>>>1)) : (c>>>1);
    t[i]=c>>>0;
  }
  return t;
})();
function crc32(bytes) {
  let c=0xFFFFFFFF;
  for (const byte of bytes) c=crcTable[(c^byte)&255]^(c>>>8);
  return (c^0xFFFFFFFF)>>>0;
}
function zipArmazenado(arquivos) {
  const partes=[],central=[];
  let cursor=0;
  const push=data=>{partes.push(data);cursor+=data.byteLength;};
  const mk=(length)=>{const b=new Uint8Array(length);return {b,v:new DataView(b.buffer)};};
  for(const {nome,bytes} of arquivos) {
    const filename=encode(nome);
    const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
    const checksum=crc32(data),offset=cursor;
    const loc=mk(30+filename.length);
    loc.v.setUint32(0,0x04034b50,true);
    loc.v.setUint16(4,20,true);
    loc.v.setUint16(6,0x0800,true); // nomes em UTF-8
    loc.v.setUint16(8,0,true); // sem compressão: o XLS já é binário
    loc.v.setUint32(14,checksum,true);
    loc.v.setUint32(18,data.length,true);
    loc.v.setUint32(22,data.length,true);
    loc.v.setUint16(26,filename.length,true);
    loc.b.set(filename,30);
    push(loc.b);push(data);
    const dir=mk(46+filename.length);
    dir.v.setUint32(0,0x02014b50,true);
    dir.v.setUint16(4,20,true);dir.v.setUint16(6,20,true);
    dir.v.setUint16(8,0x0800,true);
    dir.v.setUint32(16,checksum,true);
    dir.v.setUint32(20,data.length,true);
    dir.v.setUint32(24,data.length,true);
    dir.v.setUint16(28,filename.length,true);
    dir.v.setUint32(42,offset,true);
    dir.b.set(filename,46);
    central.push(dir.b);
  }
  const centralOffset=cursor;
  for(const item of central)push(item);
  const centralSize=cursor-centralOffset;
  const end=mk(22);
  end.v.setUint32(0,0x06054b50,true);
  end.v.setUint16(8,arquivos.length,true);
  end.v.setUint16(10,arquivos.length,true);
  end.v.setUint32(12,centralSize,true);
  end.v.setUint32(16,centralOffset,true);
  push(end.b);
  if(cursor>=0xFFFFFFFF || arquivos.length>65535)throw new Error('Limite técnico do ZIP excedido. Aplique filtros menores.');
  const out=new Uint8Array(cursor);let pos=0;
  for(const item of partes){out.set(item,pos);pos+=item.byteLength;}
  return out;
}

/** Gera XLS único para até 100 itens; ZIP com lotes numerados para mais de 100. */
export function gerarMapaProcfitEmLotes(registros,{loja='151',data=''}={}) {
  if(!Array.isArray(registros)||!registros.length)throw new Error('Nenhum produto disponível para exportar.');
  const safeLoja=String(loja).replace(/[^a-zA-Z0-9_-]/g,'')||'LOJA';
  const safeData=String(data).replace(/[^a-zA-Z0-9_-]/g,'')||'DATA';
  const prefix=`PROCFIT_QUEIMA_ESTOQUE_ITEM_LOJA${safeLoja}_${safeData}`;
  const totalLotes=Math.ceil(registros.length/TAMANHO_LOTE_PROCFIT);
  if(totalLotes===1) {
    const {bytes,total}=gerarMapaProcfitXls(registros);
    return {bytes,nome:`${prefix}_LOTE_001.xls`,total,totalLotes,compactado:false};
  }
  const arquivos=[];
  const indice=['LOTE;LINHA_INICIAL;LINHA_FINAL;PRODUTOS;ARQUIVO'];
  for(let i=0;i<totalLotes;i++) {
    const inicio=i*TAMANHO_LOTE_PROCFIT;
    const fim=Math.min(inicio+TAMANHO_LOTE_PROCFIT,registros.length);
    const nome=`${prefix}_LOTE_${String(i+1).padStart(3,'0')}.xls`;
    try {
      const {bytes}=gerarMapaProcfitXls(registros.slice(inicio,fim));
      arquivos.push({nome,bytes});
    }catch(error){throw new Error(`Lote ${i+1}, produtos ${inicio+1}–${fim}: ${error.message}`);}
    indice.push(`${i+1};${inicio+1};${fim};${fim-inicio};${nome}`);
  }
  arquivos.push({nome:'INDICE_DOS_LOTES.csv',bytes:encode('\uFEFF'+indice.join('\r\n')+'\r\n')});
  return {bytes:zipArmazenado(arquivos),nome:`${prefix}_${totalLotes}_LOTES.zip`,total:registros.length,totalLotes,compactado:true};
}
