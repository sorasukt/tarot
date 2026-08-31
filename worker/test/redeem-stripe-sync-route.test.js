import assert from "node:assert/strict";
import test from "node:test";
import {handleRedeemAdmin} from "../src/redeem-admin.js";

const headers={"Content-Type":"application/json"};
const session={sub:"auth0|admin",roles:["admin"]};

function db(){return {prepare(){return {bind(){return this},async first(){return null},async run(){return {meta:{changes:1}}},async all(){return {results:[]}}}}}}

test("admin route can sync an existing Stripe promotion code",async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({id:"promo_friend",code:"SORASUKTFRIENDS4EVER",active:true,times_redeemed:0,metadata:{plan_period:"yearly"}});
  try{
    const request=new Request("https://api.sorasukt.com/api/admin/redeem-codes",{method:"POST",headers,body:JSON.stringify({source:"stripe_sync",promotionCodeId:"promo_friend"})});
    const response=await handleRedeemAdmin(request,{DB:db(),STRIPE_SECRET_KEY:"test_key",SITE_URL:"https://sorasukt.com"},headers,session);
    const data=await response.json();
    assert.equal(response.status,201);
    assert.equal(data.redeem.code,"SORASUKTFRIENDS4EVER");
    assert.equal(data.redeem.redeemUrl,"https://sorasukt.com/tarot/redeem/?code=SORASUKTFRIENDS4EVER&plan=yearly");
  }finally{globalThis.fetch=originalFetch}
});
