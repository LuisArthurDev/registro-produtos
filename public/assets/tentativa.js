// Regra do painel legado: de 3 a 9 MESES DE CALENDÁRIO, inclusivos.
export function somarMesesLimitandoDia(iso,meses){
 const [ano,mes,dia]=String(iso).slice(0,10).split('-').map(Number);
 if(!ano||!mes||!dia||mes<1||mes>12)return null;
 const base=new Date(Date.UTC(ano,mes-1,1));base.setUTCMonth(base.getUTCMonth()+meses);
 const fim=new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()+1,0)).getUTCDate();
 return `${base.getUTCFullYear()}-${String(base.getUTCMonth()+1).padStart(2,'0')}-${String(Math.min(dia,fim)).padStart(2,'0')}`;
}
export function elegivelTentativaVenda(validade,hoje){
 const d=String(validade||'').slice(0,10),h=String(hoje||'').slice(0,10);
 if(!/^\d{4}-\d\d-\d\d$/.test(d)||!/^\d{4}-\d\d-\d\d$/.test(h))return false;
 const de=somarMesesLimitandoDia(h,3),ate=somarMesesLimitandoDia(h,9);
 return !!de&&d>=de&&d<=ate;
}
