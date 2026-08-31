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
    const request=new Request("https://api.sorasukt.com/api/tts/reading",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:"อ่านสั้น ๆ",padding:"x".repeat(13_000)})});
    const response=await handleTts(request,{GEMINI_API_KEY:"configured"},new Headers());
    assert.equal(response.status,413);
    assert.equal((await response.json()).error.code,"REQUEST_TOO_LARGE");
    assert.equal(calls,0);
  }finally{globalThis.fetch=originalFetch}
});
