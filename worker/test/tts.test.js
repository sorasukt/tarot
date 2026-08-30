import test from "node:test";
import assert from "node:assert/strict";
import {ttsModelChain,tarotVoiceChain} from "../src/tts.js";

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
