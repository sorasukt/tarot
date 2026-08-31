import assert from "node:assert/strict";
import test from "node:test";
import {syncExistingStripePromotionCode} from "../src/redeem-stripe-sync.js";

function db(){return {prepare(){return {bind(){return this},async first(){return null},async run(){return {meta:{changes:1}}}}}}}

test("rejects expired Stripe promotion codes",async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({id:"promo_expired",code:"EXPIRED-CODE",active:true,times_redeemed:0,expires_at:1,metadata:{plan_period:"yearly"}});
  try{
    const result=await syncExistingStripePromotionCode({DB:db(),STRIPE_SECRET_KEY:"test_key"},{promotionCodeId:"promo_expired"});
    assert.equal(result.status,409);
    assert.equal(result.data.error.code,"CODE_EXPIRED");
  }finally{globalThis.fetch=originalFetch}
});
