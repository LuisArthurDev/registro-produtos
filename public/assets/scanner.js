/**
 * Leitor de EAN por câmera, usado no formulário de Lançamentos e no modal do Painel Conferente.
 * Não envia imagens ou vídeo ao servidor e nunca grava o produto sozinho.
 * API nativa primeiro; html5-qrcode (versão fixada) para Safari/iOS e outros navegadores.
 */
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];
const LIBRARY_URLS = [
  'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js',
];
let active = null;
let loaderPromise = null;
let generation = 0;

export function normalizarEAN(texto) {
  const codigo = String(texto ?? '').trim();
  // Preserva zeros à esquerda: nunca converter para Number/parseInt.
  return /^\d{8,14}$/.test(codigo) ? codigo : '';
}

export function mensagemErroCamera(erro) {
  const code = String(erro?.name || erro?.message || erro || '');
  if (/NotAllowed|PermissionDenied|denied|permission/i.test(code)) return 'Câmera bloqueada. Autorize o acesso à câmera nas configurações do navegador e tente novamente.';
  if (/NotFound|DevicesNotFound|no camera|not found/i.test(code)) return 'Nenhuma câmera foi encontrada neste dispositivo.';
  if (/NotReadable|TrackStart|Could not start|in use/i.test(code)) return 'A câmera está sendo usada por outro aplicativo. Feche-o e tente novamente.';
  if (/Overconstrained/i.test(code)) return 'Não foi possível selecionar a câmera traseira neste dispositivo.';
  if (/timeout|script|library|carregar leitor|rede/i.test(code)) return 'Não foi possível carregar o leitor neste navegador. Confira a conexão e tente novamente.';
  return 'Não foi possível iniciar o leitor. Confira a permissão da câmera e tente novamente.';
}

function setStatus(text, isError=false) {
  const el=document.getElementById('ean-scanner-status');
  if(el){el.textContent=text;el.classList.toggle('danger-text',!!isError);}
}
function dialog(){return document.getElementById('ean-scanner-dialog');}
function view(){return document.getElementById('ean-scanner-view');}

function addScript(url){
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=url;script.async=true;
    const timer=setTimeout(()=>{script.remove();reject(new Error('timeout carregar leitor'));},12000);
    script.onload=()=>{clearTimeout(timer);resolve();};
    script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error('library unavailable'));};
    document.head.append(script);
  });
}
async function carregarBiblioteca(){
  if(globalThis.Html5Qrcode)return;
  if(!loaderPromise)loaderPromise=(async()=>{
    for(const url of LIBRARY_URLS){
      try{await addScript(url);if(globalThis.Html5Qrcode)return;}catch{}
    }
    throw new Error('Não foi possível carregar leitor pela rede');
  })().catch(e=>{loaderPromise=null;throw e;});
  return loaderPromise;
}

async function parar(session){
  if(!session)return;
  session.stopping=true;session.cancelled=true;
  if(session.frame)cancelAnimationFrame(session.frame);
  if(session.stream){for(const track of session.stream.getTracks())track.stop();session.stream=null;}
  if(session.video){session.video.pause();session.video.srcObject=null;session.video=null;}
  if(session.html5){
    // Se o start() ainda estiver aguardando permissão, o término será feito ao resolvê-lo.
    if(session.html5Started&&!session.html5Stopped){session.html5Stopped=true;try{await session.html5.stop();}catch{}try{session.html5.clear();}catch{}}
  }
  if(active===session)active=null;
}
export async function fecharScanner(){
  const old=active;
  if(dialog()?.open)dialog().close();
  await parar(old);
}

function reconhecer(session, raw){
  if(active!==session||session.cancelled||session.detected)return;
  const ean=normalizarEAN(raw);
  if(!ean){setStatus('Código lido não é um EAN de 8 a 14 dígitos. Posicione o código de barras novamente.');return;}
  session.detected=true;
  const input=session.input;
  if(input?.isConnected){
    input.value=ean;
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.dispatchEvent(new Event('change',{bubbles:true}));
    session.onDetected?.(ean);
    input.focus({preventScroll:true});
  }
  try{navigator.vibrate?.(60);}catch{}
  void fecharScanner();
}

async function iniciarNativo(session){
  if(typeof globalThis.BarcodeDetector!=='function')return false;
  let formatos=[];
  try{formatos=(await BarcodeDetector.getSupportedFormats()).filter(x=>FORMATS.includes(x));}catch{return false;}
  if(!formatos.length)return false;
  const detector=new BarcodeDetector({formats:formatos});
  setStatus('Solicitando permissão para a câmera…');
  const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
  session.stream=stream;
  if(session.cancelled){await parar(session);return true;}
  const video=document.createElement('video');video.autoplay=true;video.muted=true;video.playsInline=true;video.setAttribute('playsinline','');
  session.video=video;video.srcObject=stream;view().replaceChildren(video);
  try{await video.play();}catch(e){if(session.cancelled)return true;throw e;}
  if(session.cancelled){await parar(session);return true;}
  setStatus('Aponte a câmera para o EAN na embalagem.');
  let busy=false,last=0;
  const tick=async t=>{
    if(session.cancelled||active!==session||session.detected)return;
    session.frame=requestAnimationFrame(tick);
    if(busy||t-last<130||video.readyState<2)return;
    last=t;busy=true;
    try{const found=await detector.detect(video);if(found.length)reconhecer(session,found[0].rawValue);}catch(e){
      // Problemas momentâneos na captura não devem desligar a câmera.
      if(/NotSupported|NotImplemented/i.test(String(e)))setStatus('Leitor nativo indisponível. Feche e reabra a câmera para tentar novamente.',true);
    }finally{busy=false;}
  };
  session.frame=requestAnimationFrame(tick);
  return true;
}

async function iniciarAlternativo(session){
  setStatus('Carregando leitor de código de barras compatível com este navegador…');
  await carregarBiblioteca();
  if(session.cancelled||active!==session)return;
  const supported=globalThis.Html5QrcodeSupportedFormats;
  if(!supported)throw new Error('Leitor incompatível');
  const formats=['EAN_13','EAN_8','UPC_A','UPC_E','CODE_128','CODE_39','ITF'].map(k=>supported[k]).filter(x=>x!==undefined);
  const reader=new Html5Qrcode('ean-scanner-view',{formatsToSupport:formats,verbose:false});
  session.html5=reader;
  setStatus('Solicitando permissão para a câmera…');
  try{
    await reader.start({facingMode:'environment'}, {fps:10,qrbox:(w,h)=>({width:Math.round(Math.min(340,w*.9)),height:Math.round(Math.min(160,h*.55))})},raw=>reconhecer(session,raw),()=>{});
    session.html5Started=true;
    if(session.cancelled||active!==session){await parar(session);return;}
    setStatus('Aponte para o código de barras EAN. A leitura é automática.');
  }catch(e){
    // Alguns aparelhos não aceitam facingMode; tenta uma câmera disponível.
    if(session.cancelled)return;
    try{
      const devices=await Html5Qrcode.getCameras(), id=devices[0]?.id;
      if(!id)throw e;
      await reader.start(id,{fps:10},raw=>reconhecer(session,raw),()=>{});
      session.html5Started=true;
      if(session.cancelled){await parar(session);return;}
      setStatus('Aponte para o EAN. A leitura é automática.');
    }catch{throw e;}
  }
}

export function abrirScannerEAN({input,onDetected}={}){
  if(!input?.isConnected)throw new Error('Campo EAN não está disponível.');
  if(!globalThis.isSecureContext||!navigator.mediaDevices?.getUserMedia){
    throw new Error('A câmera precisa de HTTPS e de um navegador que permita acesso à câmera.');
  }
  if(active||dialog()?.open)return;
  const d=dialog();if(!d)throw new Error('Janela do scanner não foi encontrada.');
  const session={id:++generation,input,onDetected,cancelled:false,detected:false,stopping:false,stream:null,video:null,html5:null,html5Started:false,frame:null};
  active=session;
  view().replaceChildren();view().removeAttribute('style');setStatus('Preparando câmera…');
  d.showModal();
  const fechar=()=>{void parar(session);};
  d.addEventListener('close',fechar,{once:true});
  void (async()=>{
    try{const ok=await iniciarNativo(session);if(!ok&&!session.cancelled)await iniciarAlternativo(session);}
    catch(e){
      if(!session.cancelled&&active===session){setStatus(mensagemErroCamera(e),true);await parar(session);}
    }
  })();
}
