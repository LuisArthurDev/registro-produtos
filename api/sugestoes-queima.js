/** Prioriza evidências reais, sempre limitadas à loja e funcionários ativos pelo chamador.
 * Apenas sugestões: nenhuma função deste módulo modifica lançamentos ou atribuições.
 */
export function ordenarSugestoesQueima({funcionarios=[],mapasProduto=[],mapasGrupo=[],responsavelGrupoId=null,validadeProduto='',limite=6}={}) {
  const permitidos=new Map(funcionarios.filter(u=>u.perfil==='funcionario'&&u.ativo===true&&!u.excluido_em).map(u=>[String(u.id),u]));
  const candidatos=new Map();
  const contar=(id,chave)=>{
    if(!permitidos.has(String(id)))return;
    if(!candidatos.has(String(id)))candidatos.set(String(id),{id:String(id),nome:permitidos.get(String(id)).nome,mesmaValidade:0,mesmoEan:0,mesmoGrupo:0,grupoOrganizado:false});
    const c=candidatos.get(String(id));c[chave]+=1;
  };
  for(const m of mapasProduto){
    if(!m.funcionario_id)continue;
    contar(m.funcionario_id,String(m.validade||'').slice(0,10)===String(validadeProduto||'').slice(0,10)?'mesmaValidade':'mesmoEan');
  }
  for(const m of mapasGrupo){if(m.funcionario_id)contar(m.funcionario_id,'mesmoGrupo');}
  const idGrupo=String(responsavelGrupoId||'');
  if(permitidos.has(idGrupo)){
    if(!candidatos.has(idGrupo))candidatos.set(idGrupo,{id:idGrupo,nome:permitidos.get(idGrupo).nome,mesmaValidade:0,mesmoEan:0,mesmoGrupo:0,grupoOrganizado:false});
    candidatos.get(idGrupo).grupoOrganizado=true;
  }
  return [...candidatos.values()].map(x=>{
    // Ranking relativo, não é probabilidade de acerto.
    const pontos=(x.mesmaValidade?100+Math.min(x.mesmaValidade,9):0)
      +(x.grupoOrganizado?85:0)+(x.mesmoEan?55+Math.min(x.mesmoEan,9):0)
      +(x.mesmoGrupo?12+Math.min(x.mesmoGrupo,20):0);
    const evidencias=[];
    if(x.mesmaValidade)evidencias.push(`${x.mesmaValidade} mapa(s) do mesmo EAN e validade`);
    if(x.grupoOrganizado)evidencias.push('Responsável definido na organização do grupo');
    if(x.mesmoEan)evidencias.push(`${x.mesmoEan} mapa(s) do mesmo EAN em outras validades`);
    if(x.mesmoGrupo)evidencias.push(`${x.mesmoGrupo} mapa(s) de outros produtos do mesmo grupo`);
    return {...x,pontos,nivel:x.mesmaValidade?'Correspondência direta':x.grupoOrganizado?'Organização do grupo':x.mesmoEan?'Histórico do produto':'Histórico do grupo',evidencias};
  }).sort((a,b)=>b.pontos-a.pontos||a.nome.localeCompare(b.nome,'pt-BR')).slice(0,Math.max(1,Math.min(10,limite)));
}
