/* XLS binário real: Excel 97–2003 (BIFF8 dentro de OLE Compound File, sem CDN).
 * Exportação para Procfit: seis colunas. Priorizar Código Interno; usar EAN
 * apenas se não houver Código Interno. EAN/lote/validade são gravados como texto.
 * A escolha de produtos e quantidades é a MESMA da cópia para o Conector.
 * Limite técnico do XLS (BIFF8): 65.536 linhas, incluindo cabeçalho.
 */
import { montarListaProcfit } from './procfit.js';

export const CABECALHO_CONFERENCIA_XLS = Object.freeze(['Motivo', 'Codigo', 'Ean', 'Lote', 'Validade', 'Quantidade']);
const FREE = 0xFFFFFFFF, END = 0xFFFFFFFE, FAT = 0xFFFFFFFD, DIFAT = 0xFFFFFFFC;
const SETOR = 512, TAM_MAX_REGISTRO = 8224;

class Binario {
  constructor(capacidade=256) { this.buffer = new Uint8Array(capacidade); this.tamanho = 0; }
  reservar(n) {
    const minimo = this.tamanho + n;
    if (minimo <= this.buffer.length) return;
    let capacidade = this.buffer.length;
    while (capacidade < minimo) capacidade *= 2;
    const novo = new Uint8Array(capacidade);novo.set(this.buffer);this.buffer = novo;
  }
  u8(n) { this.reservar(1);this.buffer[this.tamanho++] = n & 255; }
  u16(n) { this.reservar(2);new DataView(this.buffer.buffer).setUint16(this.tamanho,n,true);this.tamanho+=2; }
  u32(n) { this.reservar(4);new DataView(this.buffer.buffer).setUint32(this.tamanho,n>>>0,true);this.tamanho+=4; }
  f64(n) { this.reservar(8);new DataView(this.buffer.buffer).setFloat64(this.tamanho,n,true);this.tamanho+=8; }
  bytes(bytes) { this.reservar(bytes.length);this.buffer.set(bytes,this.tamanho);this.tamanho+=bytes.length; }
  resultado() { return this.buffer.subarray(0,this.tamanho); }
}
const reg = (id, dados) => {
  if (dados.length > TAM_MAX_REGISTRO) throw new Error('Registro XLS ultrapassa o limite BIFF8.');
  const b=new Binario(dados.length+4);b.u16(id);b.u16(dados.length);b.bytes(dados);return b.resultado();
};
function dadosN(...numeros) { const b=new Binario();for (const [tipo,n] of numeros) b[tipo](n);return b.resultado(); }
function bof(tipo) { return reg(0x0809,dadosN(['u16',0x0600],['u16',tipo],['u16',0x0DBB],['u16',0x07CC],['u32',0x00000041],['u32',0x00000006])); }
function unicodeBIFF(texto) {
  const valor=String(texto);
  if (valor.length > 3000) throw new Error('Há texto com mais de 3.000 caracteres; não é seguro truncá-lo no XLS.');
  const compacto=[...valor].every(c=>c.charCodeAt(0)<=255),b=new Binario(3+(compacto?valor.length:valor.length*2));
  b.u16(valor.length);b.u8(compacto?0:1);
  for(let i=0;i<valor.length;i++){if(compacto)b.u8(valor.charCodeAt(i));else b.u16(valor.charCodeAt(i));}
  return b.resultado();
}
function sharedStrings(strings, usoTotal) {
  // CONTINUE começa sempre em fronteira de string; nenhuma string é dividida.
  const partes=[],cab=new Binario(8);cab.u32(usoTotal);cab.u32(strings.length);
  let atual=new Binario(TAM_MAX_REGISTRO);atual.bytes(cab.resultado());let primeiro=true;
  function descarregar(){partes.push(reg(primeiro?0x00FC:0x003C,atual.resultado()));primeiro=false;atual=new Binario(TAM_MAX_REGISTRO);}
  for(const s of strings){const v=unicodeBIFF(s);if(v.length>TAM_MAX_REGISTRO)throw new Error('Texto grande demais para XLS.');if(atual.tamanho+v.length>TAM_MAX_REGISTRO)descarregar();atual.bytes(v);}
  descarregar();return partes;
}
function fontPadrao() {
  const b=new Binario();b.u16(200);b.u16(0);b.u16(0x7fff);b.u16(400);b.u16(0);
  b.u8(0);b.u8(0);b.u8(0);b.u8(0);b.u8(5);b.u8(0);
  for(const c of 'Arial')b.u8(c.charCodeAt(0));return reg(0x0031,b.resultado());
}
function cfbDirectoryEntry(nome,tipo,inicio,tamanho,filho=FREE){
  const b=new Uint8Array(128),v=new DataView(b.buffer),value=nome.slice(0,31);
  for(let i=0;i<value.length;i++)v.setUint16(i*2,value.charCodeAt(i),true);
  v.setUint16(64,(value.length+1)*2,true);b[66]=tipo;b[67]=1;
  v.setUint32(68,FREE,true);v.setUint32(72,FREE,true);v.setUint32(76,filho>>>0,true);
  v.setUint32(116,inicio>>>0,true);v.setUint32(120,tamanho>>>0,true);v.setUint32(124,0,true);
  return b;
}
function colocarCFB(stream) {
  // Na estrutura OLE, streams menores que 4096 iriam para o MiniFAT.
  // Guardamos sempre >= 4096 bytes no Workbook para evitar MiniFAT.
  const bytesReais=Math.max(4096,stream.length),qtdLivro=Math.ceil(bytesReais/SETOR),qtdDir=1;
  let qtdFat=0,qtdDifat=0;
  for(let i=0;i<100;i++){
    const fat=Math.ceil((qtdLivro+qtdDir+qtdFat+qtdDifat)/128);
    const difat=Math.ceil(Math.max(0,fat-109)/127);
    if(fat===qtdFat&&difat===qtdDifat)break;
    qtdFat=fat;qtdDifat=difat;
  }
  const primeiroDir=qtdLivro,primeiroFat=primeiroDir+qtdDir,primeiroDifat=primeiroFat+qtdFat;
  const total=qtdLivro+qtdDir+qtdFat+qtdDifat;
  const resultado=new Uint8Array((total+1)*SETOR),view=new DataView(resultado.buffer);
  resultado.set([0xD0,0xCF,0x11,0xE0,0xA1,0xB1,0x1A,0xE1],0);
  view.setUint16(24,0x003e,true);view.setUint16(26,3,true);view.setUint16(28,0xfffe,true);
  view.setUint16(30,9,true);view.setUint16(32,6,true);
  view.setUint32(40,0,true);view.setUint32(44,qtdFat,true);view.setUint32(48,primeiroDir,true);
  view.setUint32(56,4096,true);view.setUint32(60,END,true);view.setUint32(68,qtdDifat?primeiroDifat:END,true);view.setUint32(72,qtdDifat,true);
  for(let i=0;i<109;i++)view.setUint32(76+4*i,i<qtdFat?primeiroFat+i:FREE,true);
  resultado.set(stream,SETOR);
  const offsetDir=(primeiroDir+1)*SETOR;
  resultado.set(cfbDirectoryEntry('Root Entry',5,END,0,1),offsetDir);
  resultado.set(cfbDirectoryEntry('Workbook',2,0,bytesReais),offsetDir+128);
  const fat=new Uint32Array(total).fill(FREE);
  for(let i=0;i<qtdLivro;i++)fat[i]=i===qtdLivro-1?END:i+1;
  fat[primeiroDir]=END;
  for(let i=0;i<qtdFat;i++)fat[primeiroFat+i]=FAT;
  for(let i=0;i<qtdDifat;i++)fat[primeiroDifat+i]=DIFAT;
  for(let i=0;i<qtdFat*128;i++){
    view.setUint32((primeiroFat+Math.floor(i/128)+1)*SETOR+(i%128)*4,i<fat.length?fat[i]:FREE,true);
  }
  for(let i=0;i<qtdDifat;i++){
    const pos=(primeiroDifat+i+1)*SETOR;
    for(let j=0;j<127;j++){
      const indice=109+i*127+j;
      view.setUint32(pos+j*4,indice<qtdFat?primeiroFat+indice:FREE,true);
    }
    view.setUint32(pos+508,i===qtdDifat-1?END:primeiroDifat+i+1,true);
  }
  return resultado;
}
function biffWorkbook(celulas){
  if(celulas.length>65536)throw new Error('O formato XLS aceita no máximo 65.535 produtos mais o cabeçalho. Reduza o filtro.');
  const textos=[],posicoes=new Map(),dados=[];let nStrings=0;
  const idx=valor=>{const s=String(valor??'');nStrings++;if(!posicoes.has(s)){posicoes.set(s,textos.length);textos.push(s);}return posicoes.get(s);};
  for(const linha of celulas)dados.push(linha.map((x,c)=>(dados.length>0 && (c===0||c===5))?Number(x):idx(x)));
  const globalAntes=[bof(0x0005),reg(0x0042,dadosN(['u16',1200])),reg(0x0022,dadosN(['u16',0])),fontPadrao(),reg(0x00E0,new Uint8Array(20))];
  const nome='Conferencia';
  const arquivoNome=new Binario();arquivoNome.u32(0);arquivoNome.u8(0);arquivoNome.u8(0);arquivoNome.u8(nome.length);arquivoNome.u8(0);
  for(const char of nome)arquivoNome.u8(char.charCodeAt(0));
  const resto=[...sharedStrings(textos,nStrings),reg(0x000A,new Uint8Array())];
  const tamanhoGlobal=[...globalAntes,reg(0x0085,arquivoNome.resultado()),...resto].reduce((s,c)=>s+c.length,0);
  const aba=new Binario();aba.bytes(bof(0x0010));
  aba.bytes(reg(0x0200,dadosN(['u32',0],['u32',celulas.length],['u16',0],['u16',6],['u16',0])));
  const larguras=[10,16,20,23,17,14];
  for(let c=0;c<6;c++)aba.bytes(reg(0x007D,dadosN(['u16',c],['u16',c],['u16',larguras[c]*256],['u16',0],['u16',0],['u16',0])));
  for(let r=0;r<dados.length;r++)for(let c=0;c<6;c++){
    const d=new Binario();d.u16(r);d.u16(c);d.u16(0);
    if(r>0 && (c===0||c===5)){d.f64(dados[r][c]);aba.bytes(reg(0x0203,d.resultado()));}
    else{d.u32(dados[r][c]);aba.bytes(reg(0x00FD,d.resultado()));}
  }
  aba.bytes(reg(0x000A,new Uint8Array()));
  const loc=new Binario();loc.u32(tamanhoGlobal);loc.u8(0);loc.u8(0);loc.u8(nome.length);loc.u8(0);
  for(const char of nome)loc.u8(char.charCodeAt(0));
  const livro=new Binario(tamanhoGlobal+aba.tamanho);
  for(const rec of globalAntes)livro.bytes(rec);
  livro.bytes(reg(0x0085,loc.resultado()));
  for(const rec of resto)livro.bytes(rec);
  livro.bytes(aba.resultado());
  return colocarCFB(livro.resultado());
}

/** Exporta somente os registros elegíveis de toda a conferência; sem usar página atual. */
export function gerarConferenciaXls(registros){
  const exportacao=montarListaProcfit(registros,{corrigido:true});
  const celulas=[CABECALHO_CONFERENCIA_XLS];
  for(const linha of exportacao.texto.split('\r\n').slice(1)){
    if(!linha)continue;
    const [codigo,ean,lote,validade,quantidade]=linha.split('\t');
    // O Procfit deve identificar o produto por um único identificador:
    // 1) Código Interno quando presente; 2) EAN somente sem Código Interno.
    // Mantemos as duas colunas do layout solicitado, sem duplicar a identificação.
    celulas.push([4,codigo,codigo?'':ean,lote,validade,Number(quantidade)]);
  }
  if(celulas.length>65536)throw new Error('O XLS do Excel 97–2003 aceita no máximo 65.535 produtos. Reduza os filtros da conferência.');
  return {bytes:biffWorkbook(celulas),total:exportacao.total,ignorados:exportacao.ignorados};
}
