import assert from "node:assert/strict";
import test from "node:test";
import {capacityError,generateGeminiJson,GeminiCapacityError,geminiModelChain} from "../src/gemini.js";

const options={system:"system",prompt:"prompt",schema:{type:"object",additionalProperties:false,required:["title"],properties:{title:{type:"string"}}},timeoutMs:1000};
const success=()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({title:"ready"})}]}}]}),{status:200,headers:{"Content-Type":"application/json"}});

test("429 falls back through the requested Gemini model order",async()=>{
  const originalFetch=globalThis.fetch;
  const models=[];
  globalThis.fetch=async url=>{
    models.push(new URL(url).pathname.match(/models\/([^:]+)/)?.[1]);
    return models.length<3?new Response(null,{status:429}):success();
  };
  try{
    const generated=await generateGeminiJson({GEMINI_API_KEY:"test",GEMINI_MODEL:"gemini-3.6-flash"},options);
    assert.deepEqual(models,["gemini-3.6-flash","gemini-2.5-flash","gemini-2.5-flash-lite"]);
    assert.deepEqual(generated.result,{title:"ready"});
    assert.equal(generated.model,"gemini-2.5-flash-lite");
  }finally{globalThis.fetch=originalFetch}
});

test("Gemini 3.5 Flash Lite is the final fallback and exhaustion is explicit",async()=>{
  const originalFetch=globalThis.fetch;
  const models=[];
  globalThis.fetch=async url=>{models.push(new URL(url).pathname.match(/models\/([^:]+)/)?.[1]);return new Response(null,{status:429})};
  try{
    await assert.rejects(generateGeminiJson({GEMINI_API_KEY:"test",GEMINI_MODEL:"gemini-3.6-flash"},options),GeminiCapacityError);
    assert.deepEqual(models,["gemini-3.6-flash","gemini-2.5-flash","gemini-2.5-flash-lite","gemini-3.5-flash","gemini-3.1-flash-lite","gemini-3.5-flash-lite"]);
  }finally{globalThis.fetch=originalFetch}
});

test("upstream 5xx continues to the next model within the same request",async()=>{
  const originalFetch=globalThis.fetch;
  const models=[];
  globalThis.fetch=async url=>{models.push(new URL(url).pathname.match(/models\/([^:]+)/)?.[1]);return models.length===1?new Response(null,{status:503}):success()};
  try{const generated=await generateGeminiJson({GEMINI_API_KEY:"test"},options);assert.equal(generated.model,"gemini-2.5-flash");assert.equal(models.length,2)}
  finally{globalThis.fetch=originalFetch}
});

test("a per-model timeout continues automatically without a second user request",async()=>{
  const originalFetch=globalThis.fetch;
  const models=[];
  globalThis.fetch=async (url,{signal})=>{
    models.push(new URL(url).pathname.match(/models\/([^:]+)/)?.[1]);
    if(models.length>1)return success();
    return new Promise((resolve,reject)=>signal.addEventListener("abort",()=>reject(new DOMException("timed out","AbortError")),{once:true}));
  };
  try{
    const generated=await generateGeminiJson({GEMINI_API_KEY:"test"},{...options,timeoutMs:200,perModelTimeoutMs:20});
    assert.equal(generated.model,"gemini-2.5-flash");
    assert.deepEqual(models,["gemini-3.6-flash","gemini-2.5-flash"]);
  }finally{globalThis.fetch=originalFetch}
});

test("invalid or incomplete JSON continues to the next model but authentication errors stop",async()=>{
  const originalFetch=globalThis.fetch;
  let requests=0;
  globalThis.fetch=async()=>{requests+=1;return requests===1?new Response("not-json",{status:200}):success()};
  try{const generated=await generateGeminiJson({GEMINI_API_KEY:"test"},options);assert.equal(generated.model,"gemini-2.5-flash");assert.equal(requests,2)}
  finally{globalThis.fetch=originalFetch}

  requests=0;globalThis.fetch=async()=>{requests+=1;return requests===1?new Response(JSON.stringify({candidates:[{content:{parts:[{text:"{}"}]}}]}),{status:200,headers:{"Content-Type":"application/json"}}):success()};
  try{const generated=await generateGeminiJson({GEMINI_API_KEY:"test"},options);assert.equal(generated.model,"gemini-2.5-flash");assert.equal(requests,2)}
  finally{globalThis.fetch=originalFetch}

  requests=0;globalThis.fetch=async()=>{requests+=1;return new Response(null,{status:401})};
  try{await assert.rejects(generateGeminiJson({GEMINI_API_KEY:"test"},options),/status 401/);assert.equal(requests,1)}
  finally{globalThis.fetch=originalFetch}
});

test("duplicate configured models are removed and capacity response includes Stripe support",()=>{
  assert.deepEqual(geminiModelChain({GEMINI_MODEL:"gemini-2.5-flash"}),["gemini-2.5-flash","gemini-2.5-flash-lite","gemini-3.5-flash","gemini-3.1-flash-lite","gemini-3.5-flash-lite"]);
  const error=capacityError({SUPPORT_URL:"https://buy.stripe.com/example"});
  assert.equal(error.code,"AI_CAPACITY_EXHAUSTED");
  assert.equal(error.supportUrl,"https://buy.stripe.com/example");
});
