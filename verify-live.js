/* Live verification: e2e + screenshots through proxy */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9233;
const LIVE = 'https://getbpmfinder.lincyang85.workers.dev/';
const WAV = '/Users/mac/work/personal-chuhai-site/bpm-finder/test-128bpm-house.wav'; // truth: 128 BPM
function getJson(p){return new Promise((res,rej)=>{http.get({host:'127.0.0.1',port:PORT,path:p},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));}).on('error',rej);});}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-first-run','--autoplay-policy=no-user-gesture-required','--proxy-server=http://127.0.0.1:7897','--remote-debugging-port='+PORT,'about:blank'],{stdio:'ignore'});
  let targets=null;for(let i=0;i<50;i++){try{targets=await getJson('/json/list');break;}catch{await sleep(200);}}
  const page=targets.find(t=>t.type==='page');
  const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
  let id=0;const pending=new Map();let ctxId=null;
  ws.onmessage=ev=>{const m=JSON.parse(ev.data);
    if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}
    else if(m.method==='Runtime.executionContextCreated'&&m.params.context.auxData&&m.params.context.auxData.isDefault)ctxId=m.params.context.id;};
  const send=(method,params)=>new Promise(res=>{const mid=++id;pending.set(mid,res);ws.send(JSON.stringify({id:mid,method,params}));});
  const ev=async(expression)=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,contextId:ctxId});
    if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||'eval failed');return r.result?.result?.value;};
  const shot=async(name)=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
    fs.writeFileSync(path.join('/Users/mac/work/getbpmfinder',name),Buffer.from(r.result.data,'base64'));console.log('saved',name);};
  await send('Page.enable',{});await send('Runtime.enable',{});
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:LIVE});
  await sleep(4000);
  console.log('title:', await ev('document.title'));
  console.log('h1:', await ev('document.querySelector("h1").textContent'));
  console.log('trust badges:', await ev('document.querySelectorAll(".trust-badges span").length'));
  // inject 128 BPM wav
  const b64=fs.readFileSync(WAV).toString('base64');
  await ev(`(async()=>{const bin=atob('${b64}');const buf=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)buf[i]=bin.charCodeAt(i);
    const dt=new DataTransfer();dt.items.add(new File([buf],'house.wav',{type:'audio/wav'}));
    const input=document.getElementById('fileInput');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));return 1;})()`);
  let state='';
  for(let i=0;i<60;i++){
    state=await ev(`JSON.stringify({results:!document.getElementById('toolResults').classList.contains('hidden'),
      bpm:document.getElementById('bpmNumber').textContent,key:document.getElementById('keyValue').textContent,
      camelot:document.getElementById('camelotValue').textContent,conf:document.getElementById('confidenceValue').textContent,
      dur:document.getElementById('durationValue').textContent,
      alts:Array.from(document.querySelectorAll('#resultActions button')).map(b=>b.textContent),
      hit:document.querySelector('.bpm-table tr.row-hit td')?.textContent||'none'})`);
    if(JSON.parse(state).results)break;await sleep(500);
  }
  console.log('UPLOAD RESULT:', state);
  await shot('live-results.png');
  // tap tempo
  console.log('TAP:', await ev(`(async()=>{const btn=document.getElementById('tapBtn');
    for(let i=0;i<4;i++){btn.click();await new Promise(r=>setTimeout(r,480));}
    return document.getElementById('bpmNumber').textContent+' | '+document.getElementById('tapHint').textContent;})()`));
  console.log('row after tap:', await ev(`document.querySelector('.bpm-table tr.row-hit td')?.textContent||'none'`));
  // error path: oversized file
  console.log('OVERSIZE:', await ev(`(async()=>{const big=new File([new ArrayBuffer(31*1024*1024)],'big.wav',{type:'audio/wav'});
    const dt=new DataTransfer();dt.items.add(big);const input=document.getElementById('fileInput');input.files=dt.files;
    input.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,300));
    return document.getElementById('errorMsg').textContent;})()`));
  // network requests audit: no external requests besides fonts
  const perf = await ev(`performance.getEntriesByType('resource').map(r=>r.name).filter(n=>!n.startsWith('${LIVE}')&&!n.startsWith('blob:')).join('\\n')||'(none)'`);
  console.log('EXTERNAL REQUESTS:\\n'+perf);
  // mobile shot
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await sleep(800);
  await shot('live-mobile.png');
  ws.close();chrome.kill();process.exit(0);
})().catch(e=>{console.error('FAIL:',e.message);process.exit(1);});
