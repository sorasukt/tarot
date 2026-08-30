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

test("voice narration is a member-only entitlement",()=>{
  assert.equal(publicEntitlements("free").benefits.voiceNarration,false);
  assert.equal(publicEntitlements("member").benefits.voiceNarration,true);
});
