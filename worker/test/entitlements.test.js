import test from "node:test";
import assert from "node:assert/strict";
import {entitlementLimits,publicEntitlements,usageSummary} from "../src/entitlements.js";

test("member limits are materially higher than free limits",()=>{
  const limits=entitlementLimits();
  assert.equal(limits.guest.tarot,2);
  assert.equal(limits.free.tarot,5);
  assert.equal(limits.member.tarot,30);
  assert.equal(limits.free.astrology,1);
  assert.equal(limits.member.astrology,10);
  assert.equal(limits.free.tts,0);
  assert.equal(limits.member.tts,20);
});

test("annual members receive boosted daily limits",()=>{
  const limits=entitlementLimits();
  assert.equal(limits.annual_member.tarot,60);
  assert.equal(limits.annual_member.astrology,20);
  assert.equal(limits.annual_member.tts,40);
  assert.ok(limits.annual_member.tarot>limits.member.tarot);
  assert.ok(limits.annual_member.astrology>limits.member.astrology);
  assert.ok(limits.annual_member.tts>limits.member.tts);
});

test("voice narration is a paid member entitlement",()=>{
  assert.equal(publicEntitlements("free").benefits.voiceNarration,false);
  assert.equal(publicEntitlements("member").benefits.voiceNarration,true);
  assert.equal(publicEntitlements("annual_member").benefits.voiceNarration,true);
  assert.equal(publicEntitlements("annual_member").benefits.annualBoost,true);
});

test("member usage summary returns acknowledged counts, limits and Thai reset time",async()=>{
  const counts={tarot:7,tts:3,astrology:2};
  const DB={prepare(sql){return {bind(...args){return {async first(){if(sql.includes("tarot_memberships"))return {status:"active",plan_period:"monthly",payment_type:"subscription",current_period_end:"2099-01-01T00:00:00Z"};return {used_count:counts[args.at(-1)]||0}}}}}}};
  const result=await usageSummary({DB},{sub:"auth0|member"});
  assert.equal(result.tier,"member");
  assert.deepEqual(result.usage.tarot,{used:7,limit:30,remaining:23});
  assert.deepEqual(result.usage.tts,{used:3,limit:20,remaining:17});
  assert.deepEqual(result.usage.astrology,{used:2,limit:10,remaining:8});
  assert.ok(Date.parse(result.resetAt)>Date.now());
});
