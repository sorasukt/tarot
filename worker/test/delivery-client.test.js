import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function expose(path,names,context){
  if(path==='portal.js'){
    context.URL=URL;context.location=context.window.location;
    Object.assign(context.document,{querySelectorAll:()=>[],createElement:()=>({dataset:{}}),head:{insertBefore(){},querySelector(){return null}}});
  }
  const source=readFileSync(new URL('../../'+path,import.meta.url),'utf8').replace(/\}\)\(\);\s*$/,`globalThis.exposed={${names}};})();`);
  vm.createContext(context);vm.runInContext(source,context);return context.exposed;
}
const response=()=>new Response('audio',{headers:{'Content-Type':'audio/wav','X-Tarot-Delivery':crypto.randomUUID()}});

test('confirmation waits for render, sends no text, and retries lost acknowledgements with the same token',async()=>{
  const frames=[],calls=[];
  const context={window:{location:{href:'https://sorasukt.com/tarot/reading/'}},document:{visibilityState:'visible'},addEventListener(){},Headers,AbortController,
    requestAnimationFrame:fn=>frames.push(fn),setTimeout(fn,ms){if(ms<5000)queueMicrotask(fn);return 1},clearTimeout(){},
    fetch:async(url,options)=>{calls.push({url,...options});if(calls.length===1)throw new Error('network lost');return Response.json({success:true});}};
  const {confirmDelivery}=expose('portal.js','confirmDelivery',context),r=response();
  const work=confirmDelivery(r);assert.equal(calls.length,0);frames.shift()();assert.equal(calls.length,0);frames.shift()();await work;
  assert.equal(calls.length,2);assert.equal(calls[0].body,calls[1].body);
  assert.deepEqual(JSON.parse(calls[0].body),{token:r.headers.get('X-Tarot-Delivery'),outcome:'received'});
  assert.equal(calls[0].credentials,'include');assert.equal(calls[0].keepalive,true);
});
test('hidden reading is not acknowledged; completed background audio can be acknowledged',async()=>{
  const calls=[];
  const context={window:{location:{href:'https://sorasukt.com/tarot/reading/'}},document:{visibilityState:'hidden'},addEventListener(){},Headers,AbortController,
    requestAnimationFrame:fn=>fn(),setTimeout:()=>1,clearTimeout(){},fetch:async(_url,options)=>{calls.push(options);return Response.json({success:true});}};
  const {confirmDelivery}=expose('portal.js','confirmDelivery',context);
  await confirmDelivery(response());assert.equal(calls.length,0);
  await confirmDelivery(response(),'received',{visual:false});assert.equal(calls.length,1);
  await confirmDelivery(new Response('legacy'));assert.equal(calls.length,1);
});

function audioFixture({playError=false,bodyError=false}={}){
  let audio;const confirmations=[];
  const r=response();if(bodyError)r.blob=async()=>{throw new Error('truncated body')};
  const context={window:{TarotPortal:{ai:async()=>r,confirmDelivery:async(_r,outcome,options)=>confirmations.push({outcome,options})}},
    document:{getElementById:()=>({textContent:'reading',innerText:'reading'})},
    Audio:class{constructor(){audio=this;}async play(){if(playError)throw new Error('autoplay blocked')}pause(){}},
    URL:{createObjectURL:()=> 'blob:fixture',revokeObjectURL(){}},addEventListener(){}};
  const api=expose('tts-reading.js','playReading,stopAudio',context);
  const button={},stop={},status={};
  return {api,button,stop,status,confirmations,get audio(){return audio},play:()=>api.playReading(button,stop,status)};
}
test('audio is charged on successful end, never on download or play start',async()=>{
  const f=audioFixture();await f.play();assert.equal(f.confirmations.length,0);
  f.audio.onended();assert.equal(f.confirmations.length,1);assert.equal(f.confirmations[0].outcome,'received');assert.equal(f.confirmations[0].options.visual,false);
});
test('autoplay rejection, decode failure, truncated download and Stop release without charging',async()=>{
  for(const mode of ['autoplay','decode','body','stop']){
    const f=audioFixture({playError:mode==='autoplay',bodyError:mode==='body'});await f.play();
    if(mode==='decode')f.audio.onerror();
    if(mode==='stop')f.api.stopAudio(f.button,f.stop,f.status);
    assert.deepEqual(f.confirmations.map(c=>c.outcome),['failed'],mode);
  }
});

function readingFixture(renderFails=false){
  const elements=new Map(),confirmed=[];
  const el=id=>{if(!elements.has(id))elements.set(id,{hidden:true,value:'',style:{},classList:{add(){},remove(){}},setAttribute(){},removeAttribute(){},addEventListener(){},focus(){},append(){},replaceChildren(){if(renderFails&&id==='readingGrid')throw new Error('render failed')}});return elements.get(id)};
  const context={document:{getElementById:el,querySelector:()=>el('main'),createElement:()=>el(crypto.randomUUID())},window:{scrollTo(){},TarotPortal:{
    ai:async()=>Response.json({success:true,reading:{cards:Array.from({length:5},()=>({interpretation:'meaning',keywords:[]})),overallReading:'overview'}},{headers:{'X-Tarot-Delivery':crypto.randomUUID()}}),
    confirmDelivery:async(_r,outcome='received')=>confirmed.push({outcome,visible:!el('readingStep').hidden,copy:el('readingCopy')}),
    renderError:node=>{node.hidden=false},apiError:()=>new Error('fixture')}},crypto,console,setInterval:()=>1,clearInterval(){}};
  vm.createContext(context);vm.runInContext(readFileSync(new URL('../../app.js',import.meta.url),'utf8'),context);
  vm.runInContext('state.selected=cards.slice(0,5);state.question="fixture";',context);
  return {context,confirmed,el};
}
test('reading acknowledgement follows render; render failure keeps cards and does not confirm success',async()=>{
  const success=readingFixture();await vm.runInContext('createReading()',success.context);
  assert.equal(success.confirmed[0].outcome,'received');assert.equal(success.confirmed[0].visible,true);
  const failed=readingFixture(true);await vm.runInContext('createReading()',failed.context);
  assert.deepEqual(failed.confirmed.map(c=>c.outcome),['failed']);assert.equal(failed.el('deckStep').hidden,false);assert.equal(failed.el('readingStep').hidden,true);
});

test('unavailable acknowledgement service never rejects the displayed result',async()=>{
  let calls=0;
  const context={window:{location:{href:'https://sorasukt.com/tarot/reading/'}},document:{visibilityState:'visible'},addEventListener(){},Headers,AbortController,
    requestAnimationFrame:fn=>fn(),setTimeout(fn,ms){if(ms<5000)queueMicrotask(fn);return 1},clearTimeout(){},fetch:async()=>{calls++;return Response.json({success:false},{status:503});}};
  const {confirmDelivery}=expose('portal.js','confirmDelivery',context);
  await assert.doesNotReject(confirmDelivery(response()));assert.equal(calls,3);
});
