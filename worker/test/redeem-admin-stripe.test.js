import assert from "node:assert/strict";
import test from "node:test";
import {handleRedeemAdmin} from "../src/redeem-admin.js";

const headers={"Content-Type":"application/json"};
const session={sub:"auth0|admin",roles:["admin"]};

function db(){return {prepare(sql){let values=[];return {bind(...bound){values=bound;return this},async run(){return {meta:{changes:1},sql,values}},async all(){return {results:[]}}}}}}

test("admin can create Stripe promotion code and receive redeem link",async()=>{
  const originalFetch=globalThis.fetch,calls=[];
  globalThis.fetch=async (url,options={})=>{
    calls.push({url:String(url),options});
    if(String(url).endsWith("/coupons"))return Response.json({id:"coupon_test"});
    return Response.json({id:"promo_test",code:"YEAR-TEST2026",active:true});
  };
  try{
    const request=new Request("https://api.sorasukt.com/api/admin/redeem-codes",{method:"POST",headers,body:JSON.stringify({source:"stripe",plan:"yearly",code:"YEAR-TEST2026",note:"Annual gift"})});
    const response=await handleRedeemAdmin(request,{DB:db(),STRIPE_SECRET_KEY:"sk_test",SITE_URL:"https://sorasukt.com"},headers,session);
    const data=await response.json();
    assert.equal(response.status,201);
    assert.equal(data.redeem.source,"stripe");
    assert.equal(data.redeem.code,"YEAR-TEST2026");
    assert.equal(data.redeem.redeemUrl,"https://sorasukt.com/redeem/?code=YEAR-TEST2026&plan=yearly");
    assert.equal(calls.length,2);
    const promo=new URLSearchParams(calls[1].options.body);
    assert.equal(promo.get("promotion[type]"),"coupon");
    assert.equal(promo.get("promotion[coupon]"),"coupon_test");
    assert.equal(promo.get("max_redemptions"),"1");
    assert.equal(promo.get("metadata[plan_period]"),"yearly");
  }finally{globalThis.fetch=originalFetch}
});

test("admin can list Stripe promotion codes with redeem links",async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({data:[{id:"promo_1",code:"MONTH-TEST2026",active:true,created:1788134400,times_redeemed:0,max_redemptions:1,metadata:{plan_period:"monthly"}}]});
  try{
    const response=await handleRedeemAdmin(new Request("https://api.sorasukt.com/api/admin/redeem-codes?source=stripe&limit=25"),{DB:db(),STRIPE_SECRET_KEY:"sk_test",SITE_URL:"https://sorasukt.com"},headers,session);
    const data=await response.json();
    assert.equal(response.status,200);
    assert.equal(data.codes.length,1);
    assert.equal(data.codes[0].source,"stripe");
    assert.equal(data.codes[0].plan_period,"monthly");
    assert.equal(data.codes[0].redeemUrl,"https://sorasukt.com/redeem/?code=MONTH-TEST2026&plan=monthly");
  }finally{globalThis.fetch=originalFetch}
});
