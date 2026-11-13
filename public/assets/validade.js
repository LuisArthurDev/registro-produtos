/* Validade numérica: DD/MM/AA(AA) ou M/AA(AA). Mês/Ano = último dia do mês. */
/* Máscara progressiva da validade digitada. O usuário informa somente números:
 * 30112026 -> 30/11/2026; 301126 -> 30/11/26; 0126 -> 01/26.
 * A versão anterior perdia o primeiro dígito do ano quando o texto já
 * continha a primeira barra (30/11 + 2 -> 30/112).
 * Mantemos mês/ano (01/26, 12/2026) e datas com barras manuais. */
export function mascararValidade(texto){
  const entrada=String(texto ?? '').replace(/[^0-9/]/g,'').slice(0,12);
  const digitos=entrada.replace(/\D/g,'').slice(0,8);
  if(!entrada.includes('/')){
    if(digitos.length<=2)return digitos;
    if(digitos.length<=4)return `${digitos.slice(0,2)}/${digitos.slice(2)}`;
    return `${digitos.slice(0,2)}/${digitos.slice(2,4)}/${digitos.slice(4)}`;
  }
  const partes=entrada.split('/');
  const diaOuMes=partes[0].slice(0,2);
  if(partes.length>=3){
    const mes=partes[1].slice(0,2);
    // Mesmo se o usuário colar uma data com barras, não perder o ano.
    const ano=(partes[1].slice(2)+partes.slice(2).join('')).slice(0,4);
    return `${diaOuMes}/${mes}/${ano}`;
  }
  const resto=partes[1];
  // O primeiro par depois da barra é mês somente se corresponde a 01..12.
  // Se já há o terceiro dígito (ano), acrescenta a segunda barra sozinho.
  // A condição preserva o formato alternativo mês/ano: 01/26 e 12/2026.
  const mes=Number(resto.slice(0,2));
  if(diaOuMes.length===2 && resto.length>2 && mes>=1 && mes<=12){
    return `${diaOuMes}/${resto.slice(0,2)}/${resto.slice(2,6)}`;
  }
  return `${diaOuMes}/${resto.slice(0,4)}`;
}
export function validadeParaISO(entrada){
  const t=String(entrada||'').trim();
  const parts=t.split('/');
  if(parts.length!==2&&parts.length!==3)throw new Error('Validade: informe MM/AA, MM/AAAA, DD/MM/AA ou DD/MM/AAAA.');
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
