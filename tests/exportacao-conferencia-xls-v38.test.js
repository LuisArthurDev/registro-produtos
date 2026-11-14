import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gerarConferenciaXls, CABECALHO_CONFERENCIA_XLS } from '../public/assets/conferencia-xls.js';
import { filtrarMapasParaConferencia } from '../public/assets/filtro-conferencia-procfit.js';

const app=readFileSync(new URL('../public/assets/app.js',import.meta.url),'utf8');
const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
const dado=(n=1,extra={})=>({ean:String(7890000000000+n).padStart(14,'0'),codigoInterno:String(n).padStart(6,'0'),
  lote:'L-ÁBC-'+n,validade:'2026-11-30',quantidadeCorrigida:2,quantidade:10,mapa:'Alice',tipoMapa:'funcionario',...extra});

// Leitor independente dos setores OLE, SST e registros BIFF8 usados pelo exportador.
// Assim o teste não se limita a verificar textos no código que gerou o arquivo.
function lerPlanilhaXls(buffer){
 const dv=new DataView(buffer.buffer,buffer.byteOffset,buffer.byteLength);
 assert.deepEqual([...buffer.subarray(0,8)],[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]);
 assert.equal(dv.getUint16(26,true),3);assert.equal(dv.getUint16(30,true),9);
 const u32=(pos)=>dv.getUint32(pos,true),u16=(pos)=>dv.getUint16(pos,true);
 const fatCount=u32(44),fat=[];
 for(let i=0;i<fatCount;i++){
   const sec=u32(76+i*4),off=(sec+1)*512;
   for(let j=0;j<128;j++)fat.push(u32(off+j*4));
 }
 const inicioDir=u32(48),offDir=(inicioDir+1)*512;
 const nome=Array.from({length:8},(_,i)=>String.fromCharCode(u16(offDir+128+i*2))).join('');
 assert.equal(nome,'Workbook');
 const inicio=u32(offDir+128+116),size=u32(offDir+128+120),partes=[];
 let s=inicio;
 for(let limite=0;s!==0xfffffffe&&limite<100000;limite++){
   partes.push(buffer.subarray((s+1)*512,(s+2)*512));s=fat[s];
 }
 const livro=new Uint8Array(Math.min(size,partes.length*512));
 partes.forEach((p,i)=>{if(i*512<livro.length)livro.set(p.subarray(0,Math.min(512,livro.length-i*512)),i*512);});
 const v=new DataView(livro.buffer,livro.byteOffset,livro.byteLength);
 const recs=[],ler=(offset)=>{const tipo=v.getUint16(offset,true),tamanho=v.getUint16(offset+2,true);return {tipo,offset,bytes:livro.subarray(offset+4,offset+4+tamanho),proximo:offset+4+tamanho};};
 for(let off=0;off+4<=livro.length;){const r=ler(off);recs.push(r);off=r.proximo;if(r.tipo===0x000a)break;}
 assert.equal(recs[0].tipo,0x0809);
 assert.equal(new DataView(recs[0].bytes.buffer,recs[0].bytes.byteOffset).getUint16(0,true),0x0600);
 let ss=[],totalStrings=0,unique=0;
 const idx=recs.findIndex(r=>r.tipo===0x00fc);assert.ok(idx>=0,'deve ter SST');
 const sst=[recs[idx]];
 for(let k=idx+1;recs[k]?.tipo===0x003c;k++)sst.push(recs[k]);
 const total=sst.reduce((s,r)=>s+r.bytes.length,0),bloco=new Uint8Array(total);let w=0;
 for(const r of sst){bloco.set(r.bytes,w);w+=r.bytes.length;}
 const sv=new DataView(bloco.buffer);totalStrings=sv.getUint32(0,true);unique=sv.getUint32(4,true);let pos=8;
 for(let i=0;i<unique;i++){
   const tamanho=sv.getUint16(pos,true),utf16=bloco[pos+2]&1;pos+=3;let str='';
   for(let c=0;c<tamanho;c++){
     str+=String.fromCharCode(utf16?sv.getUint16(pos,true):bloco[pos]);pos+=utf16?2:1;
   }
   ss.push(str);
 }
 const bounds=recs.find(r=>r.tipo===0x0085);assert.ok(bounds);
 const offAba=new DataView(bounds.bytes.buffer,bounds.bytes.byteOffset).getUint32(0,true);
 const tabela=[];let fim=false;
 for(let off=offAba;off+4<=livro.length&&!fim;){
   const r=ler(off),v=new DataView(r.bytes.buffer,r.bytes.byteOffset,r.bytes.byteLength);off=r.proximo;
   if(r.tipo===0x000a){fim=true;break;}
   if(r.tipo!==0x00fd&&r.tipo!==0x0203)continue;
   const row=v.getUint16(0,true),col=v.getUint16(2,true);
   if(!tabela[row])tabela[row]=new Array(6).fill(null);
   tabela[row][col]=r.tipo===0x0203?v.getFloat64(6,true):ss[v.getUint32(6,true)];
 }
 return {tabela,totalStrings,unique,registros:recs};
}

test('XLS verdadeiro BIFF8: colunas exatas, código interno prioritário e validade com barra',()=>{
 const arquivo=gerarConferenciaXls([dado(1,{ean:'07898962711477',codigoInterno:'000123',lote:'ÁBC-001'})]);
 assert.equal(arquivo.total,1);assert.equal(arquivo.bytes[0],0xd0);
 const livro=lerPlanilhaXls(arquivo.bytes);
 assert.deepEqual(livro.tabela[0],CABECALHO_CONFERENCIA_XLS);
 assert.deepEqual(livro.tabela[1],[4,'000123','','ÁBC-001','30/11/2026',2]);
 assert.equal(livro.totalStrings,10); // seis títulos + quatro células textuais por item
});


test('Código Interno prevalece; EAN só é exportado quando Código Interno estiver ausente',()=>{
 const arquivo=gerarConferenciaXls([
   dado(1,{codigoInterno:'012340',ean:'07898962711477',lote:'CODIGO'}),
   dado(2,{codigoInterno:'',ean:'07898962711478',lote:'SEM-CODIGO'}),
   dado(3,{codigoInterno:null,ean:'00000000000123',lote:'SEM-CODIGO-2'}),
 ]);
 const linhas=lerPlanilhaXls(arquivo.bytes).tabela;
 assert.equal(arquivo.total,3);
 assert.deepEqual(linhas[0],CABECALHO_CONFERENCIA_XLS);
 assert.deepEqual(linhas[1],[4,'012340','','CODIGO','30/11/2026',2]);
 assert.deepEqual(linhas[2],[4,'','07898962711478','SEM-CODIGO','30/11/2026',2]);
 assert.deepEqual(linhas[3],[4,'','00000000000123','SEM-CODIGO-2','30/11/2026',2]);
});

test('fórmulas especiais, saldo zero, dados inválidos e abas especiais não entram no XLS',()=>{
 const lista=[
   dado(1),dado(2,{formulaEspecial:true}),dado(3,{quantidadeCorrigida:0}),
   dado(4,{validade:'2026-02-30'}),dado(5,{tipoMapa:'especial',mapa:'Termolabil'}),
   dado(6,{tipoMapa:'estoque',mapa:'Estoque'}),dado(7,{tipoMapa:'especial',mapa:'Psicotropicos'}),
 ];
 const selecionados=filtrarMapasParaConferencia(lista),arquivo=gerarConferenciaXls(selecionados);
 const planilha=lerPlanilhaXls(arquivo.bytes).tabela;
 assert.equal(arquivo.total,2);assert.equal(arquivo.ignorados.formulasEspeciais,1);
 assert.equal(arquivo.ignorados.zerados,1);assert.equal(arquivo.ignorados.invalidos,1);
 assert.equal(planilha.length,3);assert.equal(planilha[1][1],'000001');assert.equal(planilha[2][1],'000006');
});

test('XLS abrange todas as 100 páginas (10 mil itens) independentemente da página atual',()=>{
 const itens=Array.from({length:10000},(_,i)=>dado(i+1,{quantidadeCorrigida:i%10===0?0:3}));
 const arquivo=gerarConferenciaXls(itens);
 assert.equal(arquivo.total,9000);assert.equal(arquivo.ignorados.zerados,1000);
 const livro=lerPlanilhaXls(arquivo.bytes);
 assert.equal(livro.tabela.length,9001);
 assert.equal(livro.tabela.at(-1)[1],'010000');assert.equal(livro.tabela.at(-1)[5],3);
 assert.equal(livro.tabela[1][4],'30/11/2026');
 assert.ok(livro.registros.some(r=>r.tipo===0x003c),'SST grande tem CONTINUE');
});

test('interface disponibiliza Exportar XLS, sem alterar o botão Copiar Procfit',()=>{
 assert.match(app,/id="compare-xls"[^>]+>Exportar XLS/);
 assert.match(app,/gerarConferenciaXls\(elegiveis\)/);
 assert.match(app,/filtrarMapasParaConferencia\(compareRows\)/);
 assert.match(app,/\/produtos\/formulas/);
 assert.match(app,/link\.download='conferencia-procfit-'.+\.xls'/);
 assert.match(app,/copiarProcfit\(filtrarMapasParaConferencia\(compareRows\)\)/);
 assert.doesNotMatch(app,/Exportar conferência CSV|id="compare-csv"/);
 assert.match(sw,/registro-validades-v41-queima-validade-minima-7-dias/);
 assert.match(sw,/\/assets\/conferencia-xls\.js/);
});
