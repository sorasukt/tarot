import assert from "node:assert/strict";
import test from "node:test";
import {createCacheKey,getMemberAiResult,saveMemberAiResult} from "../src/ai-cache.js";

test("cache key is stable when object key order changes",async()=>{
  const first=await createCacheKey("fortune:zodiac:v1",{birthDate:"2000-01-02",profile:{birthTime:"09:30",birthPlace:"Bangkok"}});
  const second=await createCacheKey("fortune:zodiac:v1",{profile:{birthPlace:"Bangkok",birthTime:"09:30"},birthDate:"2000-01-02"});
  assert.equal(first,second);
  assert.match(first,/^[a-f0-9]{64}$/);
});

test("authenticated member result is read from D1",async()=>{
  let bound=[];
  const env={DB:{prepare(){return {bind(...values){bound=values;return this},async first(){return {result_json:JSON.stringify({title:"saved"})}}}}}};
  const result=await getMemberAiResult(env,"auth0|member","fortune:zodiac:v1",{birthDate:"2000-01-02"});
  assert.equal(result.cached,true);
  assert.deepEqual(result.value,{title:"saved"});
  assert.equal(bound[0],"auth0|member");
  assert.equal(bound[1],"fortune:zodiac:v1");
});

test("generated member result is upserted with finite retention",async()=>{
  let bound=[];
  let ran=false;
  const env={DB:{prepare(){return {bind(...values){bound=values;return this},async run(){ran=true}}}}};
  await saveMemberAiResult(env,"auth0|member","tarot:reading:v1","abc123",{readingTitle:"saved"});
  assert.equal(ran,true);
  assert.deepEqual(bound,["auth0|member","tarot:reading:v1","abc123",JSON.stringify({readingTitle:"saved"}),"+60 days"]);
});
