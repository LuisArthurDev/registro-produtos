/* Validade numérica: DD/MM/AA(AA) ou M/AA(AA). Mês/Ano = último dia do mês. */
export function mascararValidade(texto){
  const t=String(texto||'').replace(/[^0-9/]/g,'').slice(0,12);
  const digits=t.replace(/\D/g,'').slice(0,8);
  if(t.includes('/')) {
    const ps=t.split('/').slice(0,3).map((x,i)=>x.replace(/\D/g,'').slice(0,i===2?4:2));
    return ps.join('/');
  }
  if(digits.length<=2)return digits;
  if(digits.length<=4)return digits.slice(0,2)+'/'+digits.slice(2);
  return digits.slice(0,2)+'/'+digits.slice(2,4)+'/'+digits.slice(4);
}
export function validadeParaISO(entrada){
  const t=String(entrada||'').trim();
  const parts=t.split('/');
  if(parts.length!==2&&parts.length!==3)throw new Error('Validade: digite MM/AA ou DD/MM/AA.');
  if(parts.some(p=>!/^\d{1,4}$/.test(p)))throw new Error('Validade inválida. Use somente números e / .');
  let dia,mes,ano;
  if(parts.length===2){[mes,ano]=parts.map(Number);}
  else {[dia,mes,ano]=parts.map(Number);}
  const yearText=parts.at(-1);
  if(yearText.length!==2&&yearText.length!==4)throw new Error('Informe o ano com 2 ou 4 dígitos.');
  if(yearText.length===2)ano=2000+ano;
  if(ano<2000||ano>2199||mes<1||mes>12)throw new Error('Mês ou ano inválido.');
  const fim=new Date(Date.UTC(ano,mes,0)).getUTCDate();
  if(parts.length===2)dia=fim;
  if(dia<1||dia>fim)throw new Error('Dia inválido para o mês informado.');
  return `${ano}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
}
