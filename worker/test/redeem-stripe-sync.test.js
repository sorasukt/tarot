import assert from "node:assert/strict";
import test from "node:test";
import {syncExistingStripePromotionCode} from "../src/redeem-stripe-sync.js";

function db(existing=null){return {prepare(sql){let values=[];return {bind(...bound){values=bound;return this},async first(){return existing},async run(){return {meta:{changes:1},sql,values}}}}}}

test("syncs an unused Stripe promotion code into yearly redeem",async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({id:"promo_friend",code:"SORASUKTFRIENDS4EVER",active:true,times_redeemed:0,metadata:{}});
  try{
    const result=await syncExistingStripePromotionCode({DB:db(),STRIPE_SECRET_KEY:"test_key",SITE_URL:"https://sorasukt.com"},{promotionCodeId:"promo_friend",plan:"YEARLY"});
    assert.equal(result.status,201);
    assert.equal(result.data.redeem.code,"SORASUKTFRIENDS4EVER");
    assert.equal(result.data.redeem.plan,"yearly");
    assert.equal(result.data.redeem.redeemUrl,"https://sorasukt.com/tarot/redeem/?code=SORASUKTFRIENDS4EVER&plan=yearly");
  }finally{globalThis.fetch=originalFetch}
});

test("rejects a Stripe promotion code already redeemed in Stripe",async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({id:"promo_used",code:"USED-CODE2026",active:true,times_redeemed:1,metadata:{plan_period:"yearly"}});
  try{
    const result=await syncExistingStripePromotionCode({DB:db(),STRIPE_SECRET_KEY:"test_key"},{promotionCodeId:"promo_used"});
    assert.equal(result.status,409);
    assert.equal(result.data.error.code,"CODE_ALREADY_USED_IN_STRIPE");
  }finally{globalThis.fetch=originalFetch}
});
