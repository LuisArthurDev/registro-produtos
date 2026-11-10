/* OneSignal Web SDK v16 — consentimento por dispositivo para todos os perfis. */
export const ONESIGNAL_APP_ID='2e84a1da-d84f-4f22-a24f-8515dd357558';
export const PUSH_CHOICE_KEY='rv_notificacoes_escolha_v3';
let sdkPromise=null;
const errorMessage=e=>String(e?.message||e||'Falha desconhecida');
// A escolha é por usuário, não herdada por outro funcionário que use o mesmo aparelho.
// Antes de autenticar, o consentimento é temporário e transferido somente à conta que entrar.
const keyUser=user=>`${PUSH_CHOICE_KEY}:${user.id}`;
export function escolhaPush(user){
  return user?.id ? localStorage.getItem(keyUser(user)) : sessionStorage.getItem(PUSH_CHOICE_KEY+':prelogin');
}
export function salvarEscolhaPush(value,user){
  if(value!=='sim'&&value!=='nao')return;
  if(user?.id)localStorage.setItem(keyUser(user),value);
  else sessionStorage.setItem(PUSH_CHOICE_KEY+':prelogin',value);
}
export function transferirEscolhaParaConta(user){
  if(!user?.id)return;
  const pending=escolhaPush();
  // Cada escolha feita antes do login só pode pertencer ao próximo login.
  // Remover mesmo quando esta conta já tem preferência evita herdá-la por outra.
  sessionStorage.removeItem(PUSH_CHOICE_KEY+':prelogin');
  if(pending&&!escolhaPush(user))salvarEscolhaPush(pending,user);
}
const SDK_URL='https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
let sdkReady=null;
const ERRO_CDN='Não foi possível carregar o OneSignal. Confira a conexão e desative o bloqueio de rastreadores deste site (Brave Shields ou extensões) para testar novamente.';
function carregarSDK(reject){
  let script=document.getElementById('onesignal-sdk');
  if(window.__oneSignalLoadError && script){script.remove();script=null;window.__oneSignalLoadError=false;}
  if(!script){
    script=document.createElement('script');script.id='onesignal-sdk';script.src=SDK_URL;script.defer=true;
    document.head.appendChild(script);
  }
  script.addEventListener('load',()=>{window.__oneSignalLoaded=true;},{once:true});
  script.addEventListener('error',()=>{window.__oneSignalLoadError=true;reject(new Error(ERRO_CDN));},{once:true});
  if(window.__oneSignalLoadError)reject(new Error(ERRO_CDN));
}
export function iniciarPush(){
  if(sdkReady)return Promise.resolve(sdkReady);
  if(sdkPromise)return sdkPromise;
  if(!window.isSecureContext || !('serviceWorker' in navigator))
    return Promise.reject(new Error('As notificações exigem HTTPS e suporte a Service Worker.'));
  sdkPromise=new Promise((resolve,reject)=>{
    let finalizado=false;
    const finalizar=(err,sdk)=>{
      if(finalizado)return;
      finalizado=true;clearTimeout(timer);
      if(err)reject(err);else {sdkReady=sdk;resolve(sdk);}
    };
    const timer=setTimeout(()=>finalizar(new Error(
      window.__oneSignalLoadError ? ERRO_CDN :
      window.__oneSignalLoaded ? 'O SDK foi carregado, mas não iniciou. Confira Site URL, App ID e Service Worker no painel OneSignal.' :
      'O SDK do OneSignal não respondeu. Confira HTTPS, conexão, Brave Shields ou extensões de bloqueio.'
    )),16000);
    window.OneSignalDeferred=window.OneSignalDeferred||[];
    window.OneSignalDeferred.push(async function(OneSignal){
      if(finalizado)return;
      try{
        await OneSignal.init({
          appId:ONESIGNAL_APP_ID,
          serviceWorkerPath:'push/onesignal/OneSignalSDKWorker.js',
          serviceWorkerParam:{scope:'/push/onesignal/'},
          notifyButton:{enable:false}
        });
        finalizar(null,OneSignal);
      }catch(err){
        finalizar(new Error('Falha ao iniciar o OneSignal: '+errorMessage(err)+'. Confira a URL do site e o Service Worker no painel OneSignal.'));
      }
    });
    carregarSDK(err=>finalizar(err));
  }).catch(err=>{sdkPromise=null;throw err;});
  return sdkPromise;
}
// Carregamento antecipado sem pedir permissão: evita esperar o CDN depois do clique.
export function prepararPush(){
  if(window.isSecureContext&&'serviceWorker' in navigator)
    void iniciarPush().catch(()=>{});
}
function verificarSuporte(sdk){
  if(!window.isSecureContext||!('serviceWorker' in navigator))throw new Error('Notificações exigem HTTPS e suporte a Service Worker.');
  if(!sdk.Notifications.isPushSupported())throw new Error('Este navegador não suporta Web Push. No iPhone, adicione o sistema à Tela de Início e abra-o pelo ícone.');
}
async function registrar(sdk,api){
  let id=sdk.User.PushSubscription.id;
  for(let i=0;!id&&i<12;i++){await new Promise(resolve=>setTimeout(resolve,450));id=sdk.User.PushSubscription.id;}
  if(!id)throw new Error('Assinatura não criada. Confira as permissões e o domínio configurado no OneSignal.');
  return api('/notificacoes/dispositivos',{method:'POST',body:{subscription_id:id,nome_dispositivo:navigator.userAgent.slice(0,90)}});
}
/** Chamada por gesto do usuário. Funciona antes do login; o vínculo da conta ocorre ao autenticar. */
export async function permitirPush(user,api){
  // Pedido nativo inicia diretamente no clique. Aguardar o carregamento remoto do
  // SDK antes de pedir permissão pode perder o gesto do usuário em navegadores móveis.
  if(!window.isSecureContext||!('serviceWorker' in navigator)||!('Notification' in window))
    throw new Error('Notificações indisponíveis. Use HTTPS; no iPhone instale o app na Tela de Início.');
  if(Notification.permission==='denied')throw new Error('Permissão bloqueada no navegador. Abra as configurações deste site e permita notificações.');
  if(Notification.permission==='default'){
    const consent=await Notification.requestPermission();
    if(consent!=='granted')throw new Error('Permissão não concedida. Você pode habilitá-la depois no navegador.');
  }
  const sdk=await iniciarPush();verificarSuporte(sdk);
  if(!sdk.Notifications.permission)await sdk.Notifications.requestPermission();
  if(!sdk.Notifications.permission)throw new Error('Permissão nativa concedida, mas o OneSignal não conseguiu registrar a assinatura. Confira o domínio e o Service Worker.');
  if(!sdk.User.PushSubscription.optedIn)await sdk.User.PushSubscription.optIn();
  salvarEscolhaPush('sim',user);
  if(user?.id&&api){await sdk.login(user.id);return registrar(sdk,api);}
  return {sucesso:true,detalhe:'Notificações permitidas. O aparelho será associado após o login.'};
}
export async function associarPush(user,api){
  transferirEscolhaParaConta(user);
  if(!user?.id)return;
  const preferencia=escolhaPush(user);
  if(preferencia!=='sim'){
    if(preferencia!=='nao')return; // A pergunta de consentimento ainda está aberta.
    // Em dispositivo compartilhado, interromper a associação anterior mesmo
    // quando o novo usuário ainda não autorizou notificações.
    try{
      const sdk=await iniciarPush();
      if(sdk.User.PushSubscription.optOut)await sdk.User.PushSubscription.optOut();
      if(sdk.logout)await sdk.logout();
    }catch(err){console.warn('Limpeza de push no aparelho:',errorMessage(err));}
    return;
  }
  try{
    const sdk=await iniciarPush();verificarSuporte(sdk);
    if(!sdk.Notifications.permission)return;
    await sdk.login(user.id);
    if(!sdk.User.PushSubscription.optedIn)await sdk.User.PushSubscription.optIn();
    return await registrar(sdk,api);
  }catch(err){console.warn('Não foi possível associar push:',errorMessage(err));}
}
/** Pausa o envio neste aparelho sem revogar a permissão do navegador. */
export async function recusarPush(user,api){
  salvarEscolhaPush('nao',user);
  try{
    const sdk=await iniciarPush();
    const id=sdk.User.PushSubscription.id;
    if(user?.id&&api&&id)await api('/notificacoes/desativar',{method:'POST',body:{subscription_id:id}});
    if(sdk.User.PushSubscription.optOut)await sdk.User.PushSubscription.optOut();
  }catch(err){console.warn('Desativação do push:',errorMessage(err));}
  return {sucesso:true};
}
export const ativarPush=permitirPush;
export async function desassociarPush(api){
  // Ao sair, desvincula o usuário do aparelho. A preferência local permanece salva.
  let sdk;
  try{
    sdk=await iniciarPush();
    const id=sdk.User.PushSubscription.id;
    if(id)await api('/notificacoes/desativar',{method:'POST',body:{subscription_id:id}});
  }catch(err){console.warn('Desvinculação do push:',errorMessage(err));}
  finally{if(sdk)try{await sdk.logout();}catch(err){console.warn('Logout do OneSignal:',errorMessage(err));}}
}

/** Diagnóstico sem segredos: identifica worker ausente, origem e bloqueio do CDN. */
export async function diagnosticarPush(){
 const resultado={origem:location.origin,appId:ONESIGNAL_APP_ID,https:window.isSecureContext,
  navegador:typeof Notification==='undefined'?'Sem API Notification':Notification.permission,
  sdk:window.__oneSignalLoadError?'Carregamento bloqueado':window.__oneSignalLoaded?'Script carregado':'Não confirmado',
  worker:'Não verificado'};
 try{
  const res=await fetch('/push/onesignal/OneSignalSDKWorker.js',{cache:'no-store',signal:AbortSignal.timeout(6500)});
  if(!res.ok){resultado.worker=`HTTP ${res.status}`;return resultado;}
  const text=await res.text();resultado.worker=text.includes('OneSignalSDK.sw.js')?'Disponível':'Conteúdo incorreto (esperado JavaScript)';
 }catch(e){resultado.worker='Falha de rede: '+String(e.name==='TimeoutError'?'tempo esgotado':e.message).slice(0,110);}
 return resultado;
}
