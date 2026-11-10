/* Notificações OneSignal — somente backend Vercel. Nunca publicar a REST API Key no browser. */
const APP_ID = '2e84a1da-d84f-4f22-a24f-8515dd357558';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const limpa = x => String(x ?? '').trim();
const falha = (msg, status=400) => Object.assign(new Error(msg),{status});

export function janelaOitoHoras(date=new Date()) {
  const n=Date.parse(date.toISOString());
  return new Date(Math.floor(n/(8*3600e3))*8*3600e3).toISOString();
}
export function diasAte(validade, hoje) {
  const d=String(validade||'').slice(0,10);
  if(!/^\d{4}-\d\d-\d\d$/.test(d))return Infinity;
  const a=Date.parse(d+'T12:00:00Z');const b=Date.parse(hoje+'T12:00:00Z');
  return Number.isFinite(a)&&Number.isFinite(b)?Math.round((a-b)/864e5):Infinity;
}
export function elegiveisPorUsuario(maps,usuarios,hoje) {
  const byId=new Map(usuarios.map(u=>[u.id,{id:u.id,loja:u.loja_id,contagem:0,vencidos:0,aVencer:0}]));
  for(const r of maps){
    if(r.tipo_mapa!=='funcionario'||Number(r.quantidade)<=0)continue;
    const entry=byId.get(r.funcionario_id);
    if(!entry||String(r.loja_id)!==String(entry.loja))continue;
    const secao=String(r.produtos?.secao||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
    const limite=/ALIMENT|CONVENI|NUTRI/.test(secao)?15:30;
    const dias=diasAte(r.validade,hoje);
    if(dias>limite)continue;
    entry.contagem++;
    if(dias<=0)entry.vencidos++;else entry.aVencer++;
  }
  return byId;
}

function confereSecret(recebido,esperado){
  // Comparação de tamanho e conteúdo em tempo constante no código chamador.
  return recebido===esperado && esperado.length>=32;
}
async function enviarOneSignal(payload){
  const app=process.env.ONESIGNAL_APP_ID||APP_ID;
  const key=process.env.ONESIGNAL_REST_API_KEY;
  if(!key)throw falha('ONESIGNAL_REST_API_KEY não configurada no Vercel.',503);
  if(app!==APP_ID)throw falha('ONESIGNAL_APP_ID diferente do projeto esperado.',503);
  const res=await fetch('https://api.onesignal.com/notifications',{
    method:'POST',signal:AbortSignal.timeout(13000),
    headers:{'Authorization':`Key ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify({app_id:app,target_channel:'push',...payload})
  });
  const raw=await res.text();let body={};try{body=JSON.parse(raw)}catch{}
  if(!res.ok)throw falha(`OneSignal recusou o envio (HTTP ${res.status}).`,502);
  if(!body.id)throw falha('OneSignal não encontrou uma assinatura apta para receber a mensagem.',422);
  return body.id;
}

export async function tratarNotificacoes(req,{pathname,body,query,db,rows,one,authenticate,admin,actorLoja,audit}){
  const {timingSafeEqual}=await import('node:crypto');
  const autorizadoCron=()=>{
    const esperado=process.env.NOTIFICATION_CRON_SECRET||process.env.CRON_SECRET||'';
    const token=String(req.headers.authorization||'').match(/^Bearer (.+)$/)?.[1]||'';
    const a=Buffer.from(token),b=Buffer.from(esperado);
    if(esperado.length<32||a.length!==b.length||!timingSafeEqual(a,b)||!confereSecret(token,esperado))throw falha('Agendador não autorizado.',401);
  };
  if(pathname==='/notificacoes/cron'){
    if(req.method!=='POST')throw falha('Método não permitido.',405);
    autorizadoCron();
    if(process.env.NOTIFICATIONS_ENABLED!=='true')return {sucesso:true,habilitado:false,detalhe:'O envio está desativado. Configure NOTIFICATIONS_ENABLED=true após a homologação.'};
    if(!process.env.ONESIGNAL_REST_API_KEY)throw falha('REST API Key do OneSignal não configurada.',503);
    // Apenas os usuários ativos + celular próprio + aparelhos aprovados + sessão ainda válida.
    const [users,devices,sessions]=await Promise.all([
      rows('usuarios',{perfil:'eq.funcionario',ativo:'eq.true',celular_proprio:'eq.true',select:'id,loja_id,nome'},250,10),
      rows('push_dispositivos',{autorizado:'eq.true',ativo:'eq.true',select:'id,loja_id,usuario_id,subscription_id,sessao_token_hash'},250,10),
      rows('sessoes',{select:'token_hash,expira_em'},500,10)
    ]);
    const activeSessions=new Set(sessions.filter(s=>Date.parse(s.expira_em)>Date.now()).map(s=>s.token_hash));
    const approved=devices.filter(d=>d.sessao_token_hash&&activeSessions.has(d.sessao_token_hash)&&users.some(u=>u.id===d.usuario_id&&u.loja_id===d.loja_id));
    const janela=janelaOitoHoras();
    if(!approved.length)return {sucesso:true,janela,aparelhos:0,enviados:0,detalhe:'Nenhum aparelho aprovado com sessão ativa.'};
    const baseHoje=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    // Guardar apenas datas elegíveis; a regra específica da seção é aplicada depois.
    const limite=new Date(Date.parse(baseHoje+'T12:00:00Z')+30*864e5).toISOString().slice(0,10);
    const stores=[...new Set(approved.map(x=>x.loja_id))];
    const mapas=[];
    for(const loja of stores){
      const chunk=await rows('mapa_lancamentos',{
        loja_id:`eq.${loja}`,tipo_mapa:'eq.funcionario',quantidade:'gt.0',validade:`lte.${limite}`,
        select:'funcionario_id,loja_id,tipo_mapa,quantidade,validade,produtos(secao)'},500,20);
      mapas.push(...chunk);
    }
    const resumo=elegiveisPorUsuario(mapas,users,baseHoje);
    let enviados=0,pulados=0,falhas=0;
    // Limite por execução: evita timeout e mensagens incontroláveis com muitas lojas.
    if(approved.length>60)throw falha('Mais de 60 aparelhos elegíveis. Divida o envio por lotes antes de ativar.',413);
    const processar=async dev=>{
      const item=resumo.get(dev.usuario_id);
      if(!item?.contagem)return;
      try{
        const reservation=await db('rpc/reservar_notificacao_push',{method:'POST',body:{p_janela:janela,p_tipo:'vencimentos',p_dispositivo:dev.id,p_quantidade:item.contagem}});
        if(!reservation){pulados++;return;}
        const titulo='Mapa de Validade — atenção';
        const mensagem=`Você tem ${item.contagem} registro(s) que exigem atenção no seu mapa. Consulte os prazos no sistema.`;
        try{
          const messageId=await enviarOneSignal({include_subscription_ids:[dev.subscription_id],headings:{pt:titulo,en:titulo},contents:{pt:mensagem,en:mensagem}});
          await db('notificacao_envios',{method:'PATCH',params:{id:`eq.${reservation}`},body:{situacao:'enviado',onesignal_message_id:messageId,atualizado_em:new Date().toISOString()}});
          enviados++;
        }catch(e){
          falhas++;
          await db('notificacao_envios',{method:'PATCH',params:{id:`eq.${reservation}`},body:{situacao:'falhou',erro_resumo:String(e.message).slice(0,200),atualizado_em:new Date().toISOString()}});
        }
      }catch(e){falhas++;console.error('Reserva de notificacao falhou:',String(e.message).slice(0,180));}
    };
    // Até 5 chamadas em paralelo para evitar atingir o timeout da função Vercel.
    for(let i=0;i<approved.length;i+=5)await Promise.all(approved.slice(i,i+5).map(processar));
    return {sucesso:falhas===0,janela,aparelhos:approved.length,enviados,pulados,falhas};
  }

  const {actor,sessao}=await authenticate(req);
  if(pathname==='/notificacoes/dispositivos'&&req.method==='GET'){
    const adminLoja=actor.perfil==='admin',geral=actor.perfil==='geral';
    const loja=adminLoja?actor.loja_id:geral?(query.get('loja')||''):actor.loja_id;
    if(geral&&!/^\d{1,12}$/.test(loja))throw falha('Informe a loja para consultar aparelhos.',400);
    const params={loja_id:`eq.${loja}`,select:'id,usuario_id,loja_id,nome_dispositivo,autorizado,ativo,criado_em,atualizado_em',order:'criado_em.desc'};
    if(actor.perfil==='funcionario')params.usuario_id=`eq.${actor.id}`;
    const dispositivos=await rows('push_dispositivos',params,200,10);
    const lista=(adminLoja||geral)?await rows('usuarios',{loja_id:`eq.${loja}`,select:'id,nome,celular_proprio,ativo'},200,10):[];
    const byId=new Map(lista.map(u=>[u.id,u]));
    return {sucesso:true,dispositivos:dispositivos.map(d=>({...d,funcionario:byId.get(d.usuario_id)?.nome||'Minha conta',celular_proprio:byId.get(d.usuario_id)?.celular_proprio??actor.celular_proprio}))};
  }
  if(pathname==='/notificacoes/dispositivos'&&req.method==='POST'){
    if(!actor.ativo||!actor.celular_proprio)throw falha('Seu perfil não está habilitado como celular próprio.',403);
    const id=limpa(body.subscription_id);if(!uuid.test(id))throw falha('Assinatura do OneSignal inválida. Ative a permissão no navegador.',400);
    const existing=await one('push_dispositivos',{subscription_id:`eq.${id}`});
    const mudou=existing && existing.usuario_id!==actor.id;
    const data={usuario_id:actor.id,loja_id:actor.loja_id,subscription_id:id,
      nome_dispositivo:limpa(body.nome_dispositivo).slice(0,100)||'Navegador',sessao_token_hash:sessao.token_hash,
      ativo:true,autorizado:mudou?false:!!existing?.autorizado,atualizado_em:new Date().toISOString()};
    await db('push_dispositivos',{method:'POST',body:data,params:{on_conflict:'subscription_id'},prefer:'resolution=merge-duplicates,return=minimal'});
    return {sucesso:true,autorizado:data.autorizado,detalhe:data.autorizado?'Aparelho autorizado.':'Cadastro realizado. Peça autorização ao administrador da sua loja.'};
  }
  if(pathname==='/notificacoes/dispositivos'&&req.method==='PATCH'){
    admin(actor);const id=limpa(body.id);if(!uuid.test(id))throw falha('Aparelho inválido.');
    const loja=actorLoja(actor,body.loja);
    const dev=await one('push_dispositivos',{id:`eq.${id}`,loja_id:`eq.${loja}`});
    if(!dev)throw falha('Aparelho não encontrado nesta loja.',404);
    const usuario=await one('usuarios',{id:`eq.${dev.usuario_id}`,loja_id:`eq.${loja}`});
    if(!usuario?.ativo||!usuario.celular_proprio)throw falha('Marque o funcionário como ativo e com celular próprio antes de autorizar.',409);
    await db('push_dispositivos',{method:'PATCH',params:{id:`eq.${id}`,loja_id:`eq.${loja}`},body:{autorizado:body.autorizado===true,atualizado_em:new Date().toISOString()}});
    await audit(actor,body.autorizado?'autorizar_dispositivo_push':'revogar_dispositivo_push',{id,usuario_id:dev.usuario_id});
    return {sucesso:true};
  }
  if(pathname==='/notificacoes/desativar'&&req.method==='POST'){
    const id=limpa(body.subscription_id);if(!uuid.test(id))throw falha('Assinatura inválida.');
    await db('push_dispositivos',{method:'PATCH',params:{usuario_id:`eq.${actor.id}`,subscription_id:`eq.${id}`},body:{sessao_token_hash:null,ativo:false,atualizado_em:new Date().toISOString()}});
    return {sucesso:true};
  }
  if(pathname==='/notificacoes/teste'&&req.method==='POST'){
    admin(actor);const loja=actorLoja(actor,body.loja);
    const id=limpa(body.id);if(!uuid.test(id))throw falha('Aparelho inválido.');
    const dev=await one('push_dispositivos',{id:`eq.${id}`,loja_id:`eq.${loja}`,autorizado:'eq.true',ativo:'eq.true'});
    if(!dev)throw falha('Aparelho não autorizado.',403);
    const user=await one('usuarios',{id:`eq.${dev.usuario_id}`,loja_id:`eq.${loja}`,ativo:'eq.true',celular_proprio:'eq.true'});
    if(!user)throw falha('Funcionário sem autorização de celular próprio.',403);
    const mid=await enviarOneSignal({include_subscription_ids:[dev.subscription_id],headings:{pt:'Teste de notificações',en:'Teste de notificações'},contents:{pt:'Este aparelho está conectado ao Registro de Validades.',en:'Este aparelho está conectado ao Registro de Validades.'}});
    await audit(actor,'teste_onesignal',{dispositivo_id:dev.id,message_id:mid});return {sucesso:true,detalhe:'Notificação aceita pelo OneSignal.',mensagem_id:mid};
  }
  throw falha('Rota de notificações não encontrada.',404);
}
