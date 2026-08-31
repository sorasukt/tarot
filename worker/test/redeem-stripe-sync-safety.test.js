import assert from "node:assert/strict";
import test from "node:test";
import {syncExistingStripePromotionCode} from "../src/redeem-stripe-sync.js";

function db(){return {prepare(){return {bind(){return this},async first(){return null},async run(){return {meta:{changes:1}}}}}}}

test("requires an explicit access period when Stripe metadata has none",async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({id:"promo_noplan2026",code:"FRIEND-CODE2026",active:true,times_redeemed:0,metadata:{}});
  try{
    const result=await syncExistingStripePromotionCode({DB:db(),STRIPE_SECRET_KEY:"test_key"},{promotionCodeId:"promo_noplan2026"});
    assert.equal(result.status,400);
    assert.equal(result.data.error.code,"INVALID_PLAN");
  }finally{globalThis.fetch=originalFetch}
});
