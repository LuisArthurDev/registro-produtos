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
  if(!res.ok){
    const orientacao=res.status===401||res.status===403?'Verifique a REST API Key no Vercel.':
      res.status===400||res.status===422?'Verifique a assinatura push deste aparelho.':
      res.status===429?'Limite de envios atingido, tente novamente mais tarde.':'Consulte o status do serviço OneSignal.';
    throw falha(`OneSignal HTTP ${res.status}. ${orientacao}`,res.status===429?503:502);
  }
  if(!body.id||body.recipients===0)throw falha('Assinatura sem destinatário ativo no OneSignal. O aparelho deve reativar as notificações.',422);
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
    // Todos os perfis ativos que aceitaram as notificações, sem aprovação de aparelho nem exigência de Celular próprio.
    const [users,devices]=await Promise.all([
      rows('usuarios',{ativo:'eq.true',select:'id,loja_id,nome,perfil'},250,10),
      rows('push_dispositivos',{autorizado:'eq.true',ativo:'eq.true',consentimento_em:'not.is.null',select:'id,loja_id,usuario_id,subscription_id,consentimento_em'},250,10)
    ]);
    const byUser=new Map(users.map(u=>[u.id,u]));
    const approved=devices.filter(d=>{
      const u=byUser.get(d.usuario_id);
      return u && (u.perfil==='geral' || (u.loja_id&&u.loja_id===d.loja_id));
    });
    const janela=janelaOitoHoras();
    if(!approved.length)return {sucesso:true,janela,aparelhos:0,enviados:0,detalhe:'Nenhum usuário ativo aceitou notificações neste aparelho.'};
    const baseHoje=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    // Guardar apenas datas elegíveis; a regra específica da seção é aplicada depois.
    const limite=new Date(Date.parse(baseHoje+'T12:00:00Z')+30*864e5).toISOString().slice(0,10);
    // Um alerta por loja: inclui os mapas de funcionários e todas as abas especiais.
    // O Administrador Geral recebe um resumo das lojas, sem detalhar dados individuais.
    const lojas=[...new Set(users.map(u=>u.loja_id).filter(Boolean))];
    const mapas=[];
    for(const loja of lojas){
      const chunk=await rows('mapa_lancamentos',{
        loja_id:`eq.${loja}`,quantidade:'gt.0',validade:`lte.${limite}`,
        select:'loja_id,quantidade,validade,produtos(secao)'},500,20);
      mapas.push(...chunk);
    }
    const totalPorLoja=new Map();
    let geralTotal=0;
    for(const r of mapas){
      const secao=String(r.produtos?.secao||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
      const limiteDias=/ALIMENT|CONVENI|NUTRI/.test(secao)?15:30;
      if(diasAte(r.validade,baseHoje)>limiteDias)continue;
      const loja=String(r.loja_id||'');
      totalPorLoja.set(loja,(totalPorLoja.get(loja)||0)+1);
      geralTotal++;
    }
    let enviados=0,pulados=0,falhas=0;
    const falhasDetalhadas=[];
    const registrarFalha=(indice,etapa,err)=>{
      falhas++;
      const motivo=String(err?.message||'Falha não identificada').slice(0,160);
      if(falhasDetalhadas.length<15)falhasDetalhadas.push({aparelho:indice,etapa,motivo});
      // Índice ordinal somente; não imprimir usuário, assinatura, token ou chave.
      console.error(`[Aviso 8h] aparelho #${indice}, ${etapa}: ${motivo}`);
    };
    if(approved.length>60)throw falha('Mais de 60 aparelhos inscritos. Configure envio em lotes antes de aumentar a equipe.',413);
    const processar=async(dev,indice)=>{
      const user=byUser.get(dev.usuario_id);
      const total=user?.perfil==='geral'?geralTotal:(totalPorLoja.get(String(user.loja_id))||0);
      if(!total){pulados++;return;}
      let reservation;
      try{
        reservation=await db('rpc/reservar_notificacao_push',{method:'POST',
          body:{p_janela:janela,p_tipo:'vencimentos',p_dispositivo:dev.id,p_quantidade:total}});
        if(!reservation){pulados++;return;}
      }catch(err){registrarFalha(indice,'reservar_envio',err);return;}
      const titulo='Validades — atenção';
      const mensagem=user.perfil==='geral'
        ?`Existem ${total} registro(s) que exigem atenção nas lojas. Acesse o Painel Geral.`
        :`A loja ${user.loja_id} tem ${total} registro(s) próximos do vencimento ou vencidos. Consulte o sistema.`;
      let messageId;
      try{
        messageId=await enviarOneSignal({include_subscription_ids:[dev.subscription_id],
          headings:{pt:titulo,en:titulo},contents:{pt:mensagem,en:mensagem}});
        enviados++;
      }catch(err){
        registrarFalha(indice,'onesignal',err);
        try{await db('notificacao_envios',{method:'PATCH',params:{id:`eq.${reservation}`},
          body:{situacao:'falhou',erro_resumo:String(err?.message||'Falha de envio').slice(0,200),atualizado_em:new Date().toISOString()}});}
        catch(erroDb){console.error('[Aviso 8h] não foi possível registrar falha:',String(erroDb?.message).slice(0,140));}
        return;
      }
      // Envio já aceito pelo OneSignal. Persistir antes de considerar a execução íntegra.
      // A reserva por janela bloqueia envio duplicado, mesmo quando esta atualização falha.
      let gravado=false;
      for(let tentativa=0;tentativa<2;tentativa++){
        try{
          await db('notificacao_envios',{method:'PATCH',params:{id:`eq.${reservation}`},
            body:{situacao:'enviado',onesignal_message_id:messageId,erro_resumo:null,atualizado_em:new Date().toISOString()}});
          gravado=true;break;
        }catch(err){if(tentativa===1)registrarFalha(indice,'registrar_confirmacao_no_banco',err);}
      }
      if(!gravado)console.error(`[Aviso 8h] aparelho #${indice}: OneSignal aceitou o envio, mas o histórico de envio não pôde ser confirmado.`);
    };
    for(let i=0;i<approved.length;i+=5)await Promise.all(approved.slice(i,i+5).map((dev,j)=>processar(dev,i+j+1)));
    return {sucesso:falhas===0,janela,aparelhos:approved.length,enviados,pulados,falhas,falhasDetalhadas};
  }

  const {actor,sessao}=await authenticate(req);
  if(pathname==='/notificacoes/dispositivos'&&req.method==='GET'){
    const adminLoja=actor.perfil==='admin',geral=actor.perfil==='geral';
    const loja=adminLoja?actor.loja_id:geral?(query.get('loja')||''):actor.loja_id;
    // Geral, sem filtro de loja: somente seus aparelhos; admin de loja: aparelhos da loja.
    const params={select:'id,usuario_id,loja_id,nome_dispositivo,autorizado,ativo,consentimento_em,criado_em,atualizado_em',order:'criado_em.desc'};
    if(adminLoja)params.loja_id=`eq.${loja}`;
    else if(geral&&loja){if(!/^\d{1,12}$/.test(loja))throw falha('Loja inválida.',400);params.loja_id=`eq.${loja}`;}
    else params.usuario_id=`eq.${actor.id}`;
    const dispositivos=await rows('push_dispositivos',params,200,10);
    const lista=(adminLoja||(geral&&loja))?await rows('usuarios',{loja_id:`eq.${loja}`,select:'id,nome,ativo'},200,10):[];
    const byId=new Map(lista.map(u=>[u.id,u]));
    return {sucesso:true,dispositivos:dispositivos.map(d=>({...d,funcionario:byId.get(d.usuario_id)?.nome||(d.usuario_id===actor.id?actor.nome:'Usuário da loja')}))};
  }
  if(pathname==='/notificacoes/dispositivos'&&req.method==='POST'){
    if(!actor.ativo)throw falha('Usuário inativo.',403);
    const id=limpa(body.subscription_id);if(!uuid.test(id))throw falha('Assinatura do OneSignal inválida. Autorize as notificações no navegador.',400);
    // A inscrição é criada somente após um clique afirmativo e a permissão nativa.
    const data={usuario_id:actor.id,loja_id:actor.loja_id||null,subscription_id:id,
      nome_dispositivo:limpa(body.nome_dispositivo).slice(0,100)||'Navegador',sessao_token_hash:sessao.token_hash,
      ativo:true,autorizado:true,consentimento_em:new Date().toISOString(),atualizado_em:new Date().toISOString()};
    await db('push_dispositivos',{method:'POST',body:data,params:{on_conflict:'subscription_id'},prefer:'resolution=merge-duplicates,return=minimal'});
    return {sucesso:true,autorizado:true,detalhe:'Notificações ativadas neste aparelho.'};
  }
  if(pathname==='/notificacoes/dispositivos'&&req.method==='PATCH')throw falha('Cada usuário gerencia seu consentimento no próprio aparelho.',405);
  if(pathname==='/notificacoes/desativar'&&req.method==='POST'){
    const id=limpa(body.subscription_id);if(!uuid.test(id))throw falha('Assinatura inválida.');
    await db('push_dispositivos',{method:'PATCH',params:{usuario_id:`eq.${actor.id}`,subscription_id:`eq.${id}`},body:{sessao_token_hash:null,ativo:false,autorizado:false,consentimento_em:null,atualizado_em:new Date().toISOString()}});
    return {sucesso:true};
  }
  if(pathname==='/notificacoes/teste'&&req.method==='POST'){
    admin(actor);
    const loja=actor.perfil==='geral'?(body.loja||''):actor.loja_id;
    const id=limpa(body.id);if(!uuid.test(id))throw falha('Aparelho inválido.');
    const params={id:`eq.${id}`,autorizado:'eq.true',ativo:'eq.true',consentimento_em:'not.is.null'};
    if(actor.perfil==='admin')params.loja_id=`eq.${actor.loja_id}`;
    else if(loja)params.loja_id=`eq.${actorLoja(actor,loja)}`;
    else params.usuario_id=`eq.${actor.id}`;
    const dev=await one('push_dispositivos',params);
    if(!dev)throw falha('Aparelho não autorizado pelo usuário ou fora da loja.',403);
    const user=await one('usuarios',{id:`eq.${dev.usuario_id}`,ativo:'eq.true'});
    if(!user)throw falha('Usuário inativo.',403);
    const mid=await enviarOneSignal({include_subscription_ids:[dev.subscription_id],headings:{pt:'Teste de notificações',en:'Teste de notificações'},contents:{pt:'Este aparelho está conectado ao Registro de Validades.',en:'Este aparelho está conectado ao Registro de Validades.'}});
    await audit(actor,'teste_onesignal',{dispositivo_id:dev.id,message_id:mid});return {sucesso:true,detalhe:'Notificação aceita pelo OneSignal.',mensagem_id:mid};
  }
  throw falha('Rota de notificações não encontrada.',404);
}
