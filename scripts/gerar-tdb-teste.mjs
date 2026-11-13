/**
 * Gerador local OPCIONAL para testes controlados, a partir do JSON de conferência.
 *   node scripts/gerar-tdb-teste.mjs preparando.json [saida.TDB] [usuario-procfit]
 * Não importa nem aprova Queima. Não execute em produção sem homologação.
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gerarTdbExperimental} from '../public/assets/procfit-gerador-tdb.js';
const args=process.argv.slice(2);
if(!args[0]){
 console.error('Uso: node scripts/gerar-tdb-teste.mjs preparacao.json [saida.TDB] [ID-usuario-Procfit]');
 process.exitCode=2;
}else{
 try{
  const json=JSON.parse(readFileSync(resolve(args[0]),'utf8'));
  const model=readFileSync(new URL('../public/assets/procfit-modelo-teste.tdb',import.meta.url));
  const r=await gerarTdbExperimental({documento:json},{modeloBytes:model,empresa:json.empresa_contexto,usuarioProcfit:Number(args[2]||'5584')});
  const destino=resolve(args[1]||`PROCFIT_QUEIMA_TESTE_LOJA${r.empresa}.TDB`);
  if(!/\.TDB$/i.test(destino))throw new Error('A extensão de saída deve ser .TDB');
  writeFileSync(destino,r.bytes,{flag:'wx'}); // Não sobrescrever arquivos por engano
  console.log(`TDB EXPERIMENTAL gerado: ${destino}\nItens: ${r.items}\nSolicitação: ${r.solicitacaoTeste}\n${r.aviso}`);
 }catch(e){console.error('Falha:',e.message);process.exitCode=1;}
}
