import assert from "node:assert/strict";
import test from "node:test";
import {handleUsage,POLICY_VERSION,purgeExpiredUserData,savePolicyAcceptance} from "../src/usage.js";

const headers={"Content-Type":"application/json"};

test("usage endpoint requires the current policy version",async()=>{
  const request=new Request("https://api.sorasukt.com/api/usage",{method:"POST",headers,body:"{}"});
  const response=await handleUsage(request,{DB:{}},headers);
  assert.equal(response.status,428);
  assert.equal((await response.json()).error.code,"POLICY_ACCEPTANCE_REQUIRED");
});

test("anonymous usage is hashed and raw form data is discarded",async()=>{
  let values=[];
  const env={DB:{prepare(){return {bind(...bound){values=bound;return this},async run(){return {success:true}}}}}};
  const anonymousId="anonymous-browser-id-123456";
  const request=new Request("https://api.sorasukt.com/api/usage",{method:"POST",headers:{...headers,"X-Tarot-Policy-Version":POLICY_VERSION},body:JSON.stringify({eventName:"action_completed",feature:"tarot",pagePath:"/tarot/reading/",status:"cached",durationMs:912,anonymousId,metadata:{cached:true,question:"must not be stored"}})});
  const response=await handleUsage(request,env,headers);
  assert.equal(response.status,200);
  assert.equal(values[1],null);
  assert.match(values[2],/^[a-f0-9]{64}$/);
  assert.notEqual(values[2],anonymousId);
  assert.equal(values[8],JSON.stringify({cached:true}));
  assert.equal(values.join("|").includes("must not be stored"),false);
});

test("member policy acceptance is persisted",async()=>{
  let values=[];
  const env={DB:{prepare(){return {bind(...bound){values=bound;return this},async run(){return {success:true}}}}}};
  const request=new Request("https://api.sorasukt.com/api/member/consent",{method:"POST",headers,body:JSON.stringify({accepted:true,policyVersion:POLICY_VERSION})});
  const response=await savePolicyAcceptance(request,env,headers,"auth0|member");
  assert.equal(response.status,200);
  assert.deepEqual(values,["auth0|member",POLICY_VERSION]);
});

test("scheduled cleanup removes all user data past 60 days",async()=>{
  const statements=[];
  const env={DB:{prepare(sql){statements.push(sql);return {sql}},async batch(batch){assert.equal(batch.length,3)}}};
  await purgeExpiredUserData(env);
  assert.ok(statements.some(sql=>sql.includes("usage_events")));
  assert.ok(statements.some(sql=>sql.includes("member_ai_results")));
  assert.ok(statements.some(sql=>sql.includes("daily_readings")&&sql.includes("-60 days")));
});

