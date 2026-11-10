import test from 'node:test';
import assert from 'node:assert/strict';
import {abrirScannerEAN, fecharScanner} from '../public/assets/scanner.js';

function iniciarAmbiente({getUserMedia}={}){
 const elements = {};
 const modal = new EventTarget();
 modal.open=false;
 modal.showModal=()=>{modal.open=true;};
 modal.close=()=>{modal.open=false;modal.dispatchEvent(new Event('close'));};
 elements['ean-scanner-dialog']=modal;
 elements['ean-scanner-status']={textContent:'',classList:{toggle(){}}};
 elements['ean-scanner-view']={replaceChildren(){},removeAttribute(){}};
 const video=()=>({readyState:4,srcObject:null,autoplay:false,muted:false,playsInline:false,play:async()=>{},pause(){},setAttribute(){}});
 globalThis.document={getElementById:k=>elements[k],createElement:video};
 globalThis.isSecureContext=true;
 Object.defineProperty(globalThis,'navigator',{value:{mediaDevices:{getUserMedia:getUserMedia|| (async()=>({getTracks:()=>[]}))},vibrate(){}},configurable:true});
 let tick=0;const jobs=new Map();
 globalThis.requestAnimationFrame=cb=>{const n=++tick,j=setTimeout(()=>{jobs.delete(n);cb(performance.now()+1000);},10);jobs.set(n,j);return n;};
 globalThis.cancelAnimationFrame=n=>{clearTimeout(jobs.get(n));jobs.delete(n);};
 return {modal,elements};
}
async function until(fn,limit=1500){const started=Date.now();while(!fn()&&Date.now()-started<limit)await new Promise(ok=>setTimeout(ok,20));assert.ok(fn(),'operação esperada não aconteceu');}

test('scanner nativo preenche campo EAN, executa callback uma vez e fecha stream',async()=>{
 let stopped=0,events=[],lookups=[];
 const {modal}=iniciarAmbiente({getUserMedia:async()=>({getTracks:()=>[{stop(){stopped++;}}]})});
 globalThis.BarcodeDetector=class{static async getSupportedFormats(){return ['ean_13'];}async detect(){return [{rawValue:'07891234567895'}];}};
 const field={value:'',isConnected:true,dispatchEvent:e=>events.push(e.type),focus(){}};
 abrirScannerEAN({input:field,onDetected:ean=>lookups.push(ean)});
 await until(()=>field.value==='07891234567895');
 await until(()=>stopped>0);
 assert.deepEqual(lookups,['07891234567895']);
 assert.deepEqual(events,['input','change']);
 assert.equal(modal.open,false);
});

test('cancelar enquanto a permissão está pendente encerra câmera mesmo após resposta tardia',async()=>{
 let ok,stopped=0;
 iniciarAmbiente({getUserMedia:()=>new Promise(resolve=>{ok=resolve;})});
 globalThis.BarcodeDetector=class{static async getSupportedFormats(){return ['ean_13'];}async detect(){return [];}};
 abrirScannerEAN({input:{isConnected:true,dispatchEvent(){},focus(){}},onDetected:()=>{throw new Error('não deveria reconhecer')}});
 await until(()=>typeof ok==='function');
 await fecharScanner();
 ok({getTracks:()=>[{stop(){stopped++;}}]});
 await until(()=>stopped>0);
 assert.equal(stopped,1);
});

test('alternativa para Safari preenche EAN e encerra o leitor sem depender de BarcodeDetector',async()=>{
 let stopCount=0,clearCount=0;
 iniciarAmbiente();
 delete globalThis.BarcodeDetector;
 globalThis.Html5QrcodeSupportedFormats={EAN_13:1,EAN_8:2,UPC_A:3,UPC_E:4,CODE_128:5,CODE_39:6,ITF:7};
 globalThis.Html5Qrcode=class{
   constructor(id){assert.equal(id,'ean-scanner-view');}
   async start(_camera,_options,found){found('7891234567890');}
   async stop(){stopCount++;}
   clear(){clearCount++;}
 };
 const field={value:'',isConnected:true,dispatchEvent(){},focus(){}};
 abrirScannerEAN({input:field});
 await until(()=>field.value==='7891234567890');
 await until(()=>stopCount>0);
 assert.equal(clearCount,1);
 delete globalThis.Html5Qrcode;
 delete globalThis.Html5QrcodeSupportedFormats;
});
