import test from "node:test";
import assert from "node:assert/strict";
import {entitlementLimits,publicEntitlements} from "../src/entitlements.js";

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
