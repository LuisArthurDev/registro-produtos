import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {prepararDadosProcfitTdb} from '../public/assets/procfit-preparacao-tdb.js';
import {gerarTdbExperimental,CONFIG_TDB_TESTE,obterModeloTdb} from '../public/assets/procfit-gerador-tdb.js';
const modelo=new Uint8Array(readFileSync(new URL('../public/assets/procfit-modelo-teste.tdb',import.meta.url)));
const PG=4096,BASE=380,pay=n=>BASE+n*PG+40,header=n=>BASE+n*PG;
const r32=(a,o)=>new DataView(a.buffer,a.byteOffset,a.byteLength).getInt32(o,true);
const r16=(a,o)=>new DataView(a.buffer,a.byteOffset,a.byteLength).getUint16(o,true);
const r64=(a,o)=>new DataView(a.buffer,a.byteOffset,a.byteLength).getFloat64(o,true);
const registro=(lote,i=0)=>({codigoInterno:'97362',ean:'0789896271147',lote:lote||'L-012',validade:'2026-11-30',quantidadeCorrigida:2,formulaEspecial:false});
const preparar=(list)=>prepararDadosProcfitTdb(list,{empresa:'151',mes:'2026-11',geradoEm:'2026-11-13T12:00:00.000Z'});
const gerar=(preparacao,opts={})=>gerarTdbExperimental(preparacao,{modeloBytes:modelo,empresa:'151',usuarioProcfit:5584,sequencia:730000001,geradoEm:new Date('2026-11-13T12:00:00.000Z'),...opts});

test('v37: modelo TDB público sanitizado não contém dados privados do registro original',()=>{
 assert.equal(modelo.length,90492);
 assert.equal(modelo.subarray(0,18).toString(),new TextEncoder().encode('ABS0LUTEDATABASEL\0').toString());
 assert.equal(new TextDecoder().decode(modelo).includes('SEM PROMO'),false);
 assert.equal(new TextDecoder().decode(modelo).includes('4305'),false);
 assert.equal(modelo[pay(10)],0);assert.equal(modelo[pay(16)],0);
 assert.equal(r32(modelo,pay(8)+10+76-4),0);
});
test('v37: TDB tem cabeçalho e item ligados, com apenas seis campos da Queima + chaves internas, aprovação nula',async()=>{
 const p=preparar([registro()]);const {bytes,items,solicitacaoTeste,paginas}=await gerar(p);
 assert.equal(items,1);assert.equal(paginas,1);assert.equal(solicitacaoTeste,730000001);
 assert.equal(bytes.length,90492);assert.equal(new TextDecoder().decode(bytes.subarray(0,17)),'ABS0LUTEDATABASEL');
 assert.equal(new TextDecoder().decode(bytes.subarray(header(16),header(16)+4)),'ABSP');
 assert.equal(r32(bytes,pay(8)+10+76-4),1);assert.equal(r32(bytes,pay(14)+10+220-4),1);
 assert.equal(r16(bytes,pay(15)+14),1);assert.equal(r32(bytes,pay(15)+18),16);assert.equal(r16(bytes,pay(15)+22),1);
 const hi=pay(10)+8,ii=pay(16)+2;
 assert.equal(r64(bytes,hi+1),solicitacaoTeste);
 assert.equal(r64(bytes,ii+4),solicitacaoTeste+100000);
 assert.equal(r64(bytes,ii+44),solicitacaoTeste); // ponte: QUEIMA_ESTOQUE
 assert.equal(r64(bytes,ii+66),97362); // PRODUTO: 4 flags + six 8-byte doubles + 14 EAN
 assert.equal(new TextDecoder('windows-1252').decode(bytes.subarray(ii+52,ii+65)).replace(/\0+$/,''),'0789896271147');
 assert.equal(r64(bytes,ii+98),2); // QUANTIDADE após validade
 assert.equal(r64(bytes,ii+134),4); // MOTIVO 4
 assert.ok(bytes[ii+1] & 0x20); // APROVADO (índice 13) nulo
});
test('v37: 17 produtos ocupam duas páginas e atualizam index + bitmap de ocupação',async()=>{
 const n=17,rows=Array.from({length:n},(_,i)=>registro('LOT'+i));
 const {bytes}=await gerar(preparar(rows));
 assert.equal(r32(bytes,pay(14)+10+220-4),n);
 assert.equal(r16(bytes,pay(15)+14),2);
 assert.equal(r32(bytes,pay(15)+18),16);assert.equal(r16(bytes,pay(15)+22),16);
 assert.equal(r32(bytes,pay(15)+24),17);assert.equal(r16(bytes,pay(15)+28),1);
 assert.equal(bytes[pay(16)],255);assert.equal(bytes[pay(16)+1],255);
 assert.equal(bytes[pay(17)],1);
 assert.equal(new TextDecoder().decode(bytes.subarray(header(17),header(17)+4)),'ABSP');
 assert.equal(r32(bytes,header(17)+22),14);
});
test('v37: 10.000 registros atravessam centenas de páginas e mantêm índice e geometria',async()=>{
 const n=10000,rows=Array.from({length:n},(_,i)=>registro('L'+i));
 const {bytes,paginas}=await gerar(preparar(rows));
 assert.equal(paginas,625);
 assert.equal(r16(bytes,pay(15)+14),625);
 assert.equal(r32(bytes,pay(14)+10+220-4),10000);
 assert.equal(r32(bytes,34),640);
 assert.ok(r32(bytes,30)>=641);
 assert.equal(bytes.length,380+r32(bytes,30)*4096);
 assert.equal(r32(bytes,pay(15)+18+(625-1)*6),640);
 assert.equal(r16(bytes,pay(15)+18+(625-1)*6+4),16);
});
test('v37: EAN-14 e lote longo são rejeitados sem truncamento, e não geram arquivo falso',async()=>{
 await assert.rejects(()=>gerar(preparar([{...registro(),ean:'12345678901234'}])),/EAN: ultrapassa 13/);
 await assert.rejects(()=>gerar(preparar([{...registro(),lote:'ABCDEFGHIJKLMNOP'}])),/LOTE: ultrapassa 15/);
});
test('v37: Fórmulas Especiais, saldo zero e não conferidos não entram no TDB',async()=>{
 const rows=[registro(),{...registro('B'),formulaEspecial:true},{...registro('C'),quantidadeCorrigida:0}];
 const p=preparar(rows);assert.equal(p.total,1);
 const {items}=await gerar(p);assert.equal(items,1);
});
test('v37: integridade do modelo é exigida e arquivo original não é modificado',async()=>{
 const altered=modelo.slice();altered[123]=altered[123]^1;
 await assert.rejects(()=>gerar(preparar([registro()]),{modeloBytes:altered}),/modelo binário não corresponde/i);
 const readAgain=readFileSync(new URL('../public/assets/procfit-modelo-teste.tdb',import.meta.url));
 assert.deepEqual(new Uint8Array(readAgain),modelo);
});
test('v37: o botão está habilitado e realiza download de um TDB binário experimental',()=>{
 const app=readFileSync(new URL('../public/assets/app.js',import.meta.url),'utf8');
 const index=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const sw=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
 assert.match(app,/Gerar arquivo \.TDB \(teste\)/);assert.match(app,/gerarTdbExperimental\(resultado/);
 assert.match(index,/Gerar e baixar \.TDB de teste/);assert.match(index,/id="procfit-export-download"/);
 assert.match(sw,/procfit-modelo-teste\.tdb/);
});
