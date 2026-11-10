/* OneSignal Web SDK: assinatura explícita pelo usuário. REST API Key nunca aparece aqui. */
export const ONESIGNAL_APP_ID='2e84a1da-d84f-4f22-a24f-8515dd357558';
let sdkPromise=null;
const errorMessage=e=>String(e?.message||e||'Falha desconhecida');
export function iniciarPush(){
  if(sdkPromise)return sdkPromise;
  sdkPromise=Promise.race([
    new Promise((resolve,reject)=>{
      window.OneSignalDeferred=window.OneSignalDeferred||[];
      window.OneSignalDeferred.push(async function(OneSignal){
        try{
          await OneSignal.init({appId:ONESIGNAL_APP_ID,serviceWorkerPath:'push/onesignal/OneSignalSDKWorker.js',serviceWorkerParam:{scope:'/push/onesignal/'},notifyButton:{enable:false}});
          resolve(OneSignal);
        }catch(err){reject(err);}
      });
    }),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('O SDK do OneSignal não respondeu. Confira a conexão, extensões e configuração Web no painel OneSignal.')),16000))
  ]).catch(e=>{sdkPromise=null;throw e;});
  return sdkPromise;
}
export async function associarPush(user,api){
  if(!user?.id||!user.celularProprio)return;
  try{
    const sdk=await iniciarPush();
    await sdk.login(user.id); // vínculo com a sessão atual; sem permissão automática
    if(sdk.Notifications.permission&&sdk.User.PushSubscription.id){
      await registrar(sdk,api);
    }
  }catch(err){console.warn('Notificações não iniciadas:',errorMessage(err));}
}
async function registrar(sdk,api){
  let id=sdk.User.PushSubscription.id;
  for(let attempt=0;!id&&attempt<12;attempt++){await new Promise(resolve=>setTimeout(resolve,450));id=sdk.User.PushSubscription.id;}
  if(!id)throw new Error('O navegador ainda não criou uma assinatura de notificações. Verifique as permissões e o domínio configurado.');
  const info=navigator.userAgent.slice(0,90);
  return api('/notificacoes/dispositivos',{method:'POST',body:{subscription_id:id,nome_dispositivo:info}});
}
export async function ativarPush(user,api){
  if(!user?.celularProprio)throw new Error('Peça ao administrador para ativar a opção Celular próprio no seu cadastro.');
  if(!window.isSecureContext||!('serviceWorker' in navigator))throw new Error('As notificações exigem HTTPS e um navegador com suporte a push.');
  const sdk=await iniciarPush();
  if(!sdk.Notifications.isPushSupported())throw new Error('Este navegador não suporta push. No iPhone, instale a PWA na Tela de Início e abra por lá.');
  await sdk.login(user.id);
  if(!sdk.Notifications.permission)await sdk.Notifications.requestPermission();
  if(!sdk.Notifications.permission)throw new Error('Permissão de notificações não concedida pelo navegador.');
  return registrar(sdk,api);
}
export async function desassociarPush(api){
  // O logout do SDK deve acontecer mesmo que a chamada ao Supabase falhe.
  // O servidor também valida existência da sessão antes de enviar qualquer alerta.
  let sdk;
  try{
    sdk=await iniciarPush();
    const id=sdk.User.PushSubscription.id;
    if(id)await api('/notificacoes/desativar',{method:'POST',body:{subscription_id:id}});
  }catch(e){console.warn('Não foi possível desativar a assinatura remota:',errorMessage(e));}
  finally{if(sdk)try{await sdk.logout();}catch(e){console.warn('Logout do OneSignal:',errorMessage(e));}}
}
