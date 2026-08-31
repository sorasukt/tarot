import assert from "node:assert/strict";
import test from "node:test";
import {syncExistingStripePromotionCode} from "../src/redeem-stripe-sync.js";

function db(){return {prepare(sql){return {bind(){return this},async first(){return sql.includes("SELECT code")?{code:"EXISTING-CODE",plan_period:"yearly",status:"active"}:null},async run(){throw new Error("should not insert")}}}}}

test("returns existing local redeem without reinserting",async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({id:"promo_existing",code:"EXISTING-CODE",active:true,times_redeemed:0,metadata:{plan_period:"yearly"}});
  try{
    const result=await syncExistingStripePromotionCode({DB:db(),STRIPE_SECRET_KEY:"test_key",SITE_URL:"https://sorasukt.com"},{promotionCodeId:"promo_existing"});
    assert.equal(result.status,200);
    assert.equal(result.data.redeem.alreadySynced,true);
  }finally{globalThis.fetch=originalFetch}
});
