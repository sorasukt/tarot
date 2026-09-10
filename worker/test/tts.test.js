import test from "node:test";
import assert from "node:assert/strict";
import {handleTts,ttsModelChain,tarotVoiceChain} from "../src/tts.js";

test("TTS uses every currently supported Gemini TTS model",()=>{
  assert.deepEqual(ttsModelChain(),[
    "gemini-3.1-flash-tts-preview",
    "gemini-2.5-flash-preview-tts",
    "gemini-2.5-pro-preview-tts"
  ]);
});

test("Tarot narration has a broad voice fallback pool",()=>{
  const voices=tarotVoiceChain();
  assert.ok(voices.length>=12);
  assert.equal(voices[0],"Sulafat");
  assert.ok(voices.includes("Vindemiatrix"));
  assert.ok(voices.includes("Achernar"));
  assert.equal(new Set(voices).size,voices.length);
});

test("TTS rejects an oversized streamed request before calling Gemini",async()=>{
  const originalFetch=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls+=1;throw new Error("Gemini must not be called")};
  try{
    const request=new Request("https://api.sorasukt.com/api/tts/reading",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:"อ่านสั้น ๆ",padding:"x".repeat(33_000)})});
    const response=await handleTts(request,{GEMINI_API_KEY:"configured"},new Headers());
    assert.equal(response.status,413);
    assert.equal((await response.json()).error.code,"REQUEST_TOO_LARGE");
    assert.equal(calls,0);
  }finally{globalThis.fetch=originalFetch}
});

test('TTS reads model_output steps and returns the audio bytes',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(_url,options)=>{calls++;const payload=JSON.parse(options.body);assert.equal(payload.response_format.mime_type,'audio/wav');return Response.json({status:'completed',steps:[{type:'user_input',content:[{type:'audio',data:btoa('wrong')}]},{type:'model_output',content:[{type:'audio',mime_type:'audio/wav',data:btoa('RIFF fixture audio')}]}]})};
 try{const response=await handleTts(new Request('https://api.test/api/tts/reading',{method:'POST',body:JSON.stringify({text:'อ่านไพ่'})}),{GEMINI_API_KEY:'fixture'},new Headers());assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'audio/wav');assert.equal(await response.text(),'RIFF fixture audio');assert.equal(calls,1);}finally{globalThis.fetch=original}
});
test('TTS 400 logs safe provider codes without logging provider message or retrying unrelated voices',async()=>{
 const original=globalThis.fetch,warn=console.warn;const logs=[];let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({error:{status:'INVALID_ARGUMENT',message:'private submitted text',details:[{reason:'INVALID_REQUEST'}]}},{status:400})};console.warn=text=>logs.push(JSON.parse(text));
 try{const response=await handleTts(new Request('https://api.test/api/tts/reading',{method:'POST',body:JSON.stringify({text:'อ่านไพ่'})}),{GEMINI_API_KEY:'fixture'},new Headers());assert.equal(response.status,400);assert.equal(calls,1);assert.equal(logs[0].providerStatus,'INVALID_ARGUMENT');assert.equal(logs[0].providerReason,'INVALID_REQUEST');assert.ok(!JSON.stringify(logs).includes('private submitted text'));}finally{globalThis.fetch=original;console.warn=warn}
});
test('TTS failed interaction never returns embedded partial audio as success',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({status:'failed',steps:[{type:'model_output',content:[{type:'audio',mime_type:'audio/wav',data:btoa('partial')}]}]});
 try{const response=await handleTts(new Request('https://api.test/api/tts/reading',{method:'POST',body:JSON.stringify({text:'อ่านไพ่'})}),{GEMINI_API_KEY:'fixture'},new Headers());assert.equal(response.status,503);}finally{globalThis.fetch=original}
});
