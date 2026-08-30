import assert from "node:assert/strict";
import test from "node:test";
import {handleBilling,handleStripeWebhook,verifyStripeSignature} from "../src/stripe.js";

const headers={"Content-Type":"application/json"};

async function signature(payload,secret,timestamp){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signed=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(`${timestamp}.${payload}`));
  return [...new Uint8Array(signed)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}

test("Stripe webhook signature accepts the raw body and rejects tampering or stale events",async()=>{
  const payload=JSON.stringify({id:"evt_test",type:"ping",data:{object:{id:"obj"}}}),secret="whsec_test",now=1_800_000_000;
  const digest=await signature(payload,secret,now);
  assert.equal(await verifyStripeSignature(payload,`t=${now},v1=${digest}`,secret,now),true);
  assert.equal(await verifyStripeSignature(`${payload} `,`t=${now},v1=${digest}`,secret,now),false);
  assert.equal(await verifyStripeSignature(payload,`t=${now-301},v1=${await signature(payload,secret,now-301)}`,secret,now),false);
});

test("support Checkout uses eligible Dashboard payment methods and a required Thailand shipping address",async()=>{
  const originalFetch=globalThis.fetch;let requestBody="";
  globalThis.fetch=async (url,options)=>{assert.equal(url,"https://api.stripe.com/v1/checkout/sessions");requestBody=options.body;return Response.json({id:"cs_test_support",url:"https://checkout.stripe.com/c/pay/test"})};
  try{
    const request=new Request("https://api.sorasukt.com/api/billing/checkout/support",{method:"POST",headers,body:JSON.stringify({amount:399,accepted:true,requestId:"123e4567-e89b-12d3-a456-426614174000"})});
    const response=await handleBilling(request,{STRIPE_SECRET_KEY:"sk_test"},headers);
    assert.equal(response.status,200);
    const params=new URLSearchParams(requestBody);
    assert.equal(params.get("line_items[0][price_data][currency]"),"thb");
    assert.equal(params.get("line_items[0][price_data][unit_amount]"),"39900");
    assert.equal(params.has("payment_method_types[0]"),false);
    assert.equal(params.get("billing_address_collection"),"required");
    assert.equal(params.get("shipping_address_collection[allowed_countries][0]"),"TH");
    assert.equal(params.get("locale"),"auto");
  }finally{globalThis.fetch=originalFetch}
});

test("membership Checkout selects only the server-configured Price ID",async()=>{
  const originalFetch=globalThis.fetch;const calls=[];
  globalThis.fetch=async (url,options={})=>{calls.push({url,body:options.body||""});if(url.endsWith("/prices/price_trusted"))return Response.json({id:"price_trusted",active:true,currency:"thb",unit_amount:25900});if(url.endsWith("/customers"))return Response.json({id:"cus_test_member"});return Response.json({id:"cs_test_member",url:"https://checkout.stripe.com/c/pay/member"})};
  const DB={prepare(sql){return {bind(){return this},async first(){return sql.includes("SELECT stripe_customer_id")?null:null},async run(){return {meta:{changes:1}}}}}};
  try{
    const request=new Request("https://api.sorasukt.com/api/billing/checkout/membership",{method:"POST",headers,body:JSON.stringify({period:"monthly",paymentType:"one_time",priceId:"price_attacker",requestId:"123e4567-e89b-12d3-a456-426614174001"})});
    const env={DB,STRIPE_SECRET_KEY:"sk_test",STRIPE_PRICE_ONETIME_MONTHLY:"price_trusted"};
    const session={sub:"auth0|member",email:"member@example.com",name:"Member"};
    const response=await handleBilling(request,env,headers,session);
    assert.equal(response.status,200);
    const checkout=new URLSearchParams(calls.at(-1).body);
    assert.equal(checkout.get("line_items[0][price]"),"price_trusted");
    assert.notEqual(checkout.get("line_items[0][price]"),"price_attacker");
    assert.equal(checkout.get("metadata[user_sub]"),session.sub);
    assert.equal(checkout.has("payment_method_types[0]"),false);
    assert.equal(checkout.has("excluded_payment_method_types[0]"),false);
    assert.equal(checkout.get("allow_promotion_codes"),"true");
    assert.equal(checkout.get("locale"),"auto");
  }finally{globalThis.fetch=originalFetch}
});

test("PromptPay is excluded from Subscription Checkout",async()=>{
  const originalFetch=globalThis.fetch;let checkoutBody="";
  globalThis.fetch=async (url,options={})=>{if(url.endsWith("/prices/price_subscription"))return Response.json({active:true,currency:"thb",unit_amount:19900,recurring:{interval:"month",interval_count:1}});if(url.endsWith("/customers"))return Response.json({id:"cus_subscription"});checkoutBody=options.body||"";return Response.json({id:"cs_test_subscription",url:"https://checkout.stripe.com/c/pay/subscription"})};
  const DB={prepare(){return {bind(){return this},async first(){return null},async run(){return {meta:{changes:1}}}}}};
  try{
    const request=new Request("https://api.sorasukt.com/api/billing/checkout/membership",{method:"POST",headers,body:JSON.stringify({period:"monthly",paymentType:"subscription",requestId:"123e4567-e89b-12d3-a456-426614174009"})});
    const response=await handleBilling(request,{DB,STRIPE_SECRET_KEY:"sk_test",STRIPE_PRICE_SUB_MONTHLY:"price_subscription"},headers,{sub:"auth0|subscriber"});
    const checkout=new URLSearchParams(checkoutBody);
    assert.equal(response.status,200);
    assert.equal(checkout.has("payment_method_types[0]"),false);
    assert.equal(checkout.get("excluded_payment_method_types[0]"),"promptpay");
    assert.equal(checkout.get("allow_promotion_codes"),"true");
    assert.equal(checkout.get("locale"),"auto");
  }finally{globalThis.fetch=originalFetch}
});

test("Customer Portal uses the package-management configuration and returns to My Account",async()=>{
  const originalFetch=globalThis.fetch;let requestBody="";
  globalThis.fetch=async (url,options={})=>{assert.equal(url,"https://api.stripe.com/v1/billing_portal/sessions");requestBody=options.body||"";return Response.json({url:"https://billing.stripe.com/p/session/test"})};
  const DB={prepare(){return {bind(){return this},async first(){return {stripe_customer_id:"cus_portal"}}}}};
  try{
    const response=await handleBilling(new Request("https://api.sorasukt.com/api/billing/portal",{method:"POST"}),{DB,STRIPE_SECRET_KEY:"sk_test",STRIPE_PORTAL_CONFIGURATION_ID:"bpc_membership"},headers,{sub:"auth0|member"});
    const params=new URLSearchParams(requestBody);
    assert.equal(response.status,200);
    assert.equal(params.get("customer"),"cus_portal");
    assert.equal(params.get("configuration"),"bpc_membership");
    assert.equal(params.get("return_url"),"https://sorasukt.com/tarot/me/?billing=updated");
  }finally{globalThis.fetch=originalFetch}
});

test("support Checkout does not discount a user-defined contribution",async()=>{
  const originalFetch=globalThis.fetch;let checkoutBody="";
  globalThis.fetch=async (_url,options={})=>{checkoutBody=options.body||"";return Response.json({id:"cs_test_support",url:"https://checkout.stripe.com/c/pay/support"})};
  try{
    const request=new Request("https://api.sorasukt.com/api/billing/checkout/support",{method:"POST",headers,body:JSON.stringify({amount:399,accepted:true,requestId:"123e4567-e89b-12d3-a456-426614174010"})});
    const response=await handleBilling(request,{STRIPE_SECRET_KEY:"sk_test"},headers);
    assert.equal(response.status,200);
    assert.equal(new URLSearchParams(checkoutBody).has("allow_promotion_codes"),false);
  }finally{globalThis.fetch=originalFetch}
});

test("membership plans expose the confirmed THB prices",async()=>{
  const response=await handleBilling(new Request("https://api.sorasukt.com/api/billing/plans"),{STRIPE_SECRET_KEY:"sk_test"},headers);
  const data=await response.json(),prices=Object.fromEntries(data.plans.map(plan=>[`${plan.paymentType}:${plan.period}`,plan.amount]));
  assert.equal(response.status,200);
  assert.deepEqual(prices,{"subscription:weekly":5900,"one_time:weekly":7900,"subscription:monthly":19900,"one_time:monthly":25900,"subscription:yearly":169000,"one_time:yearly":179000});
});

test("verified Stripe events are claimed once before processing",async()=>{
  const secret="whsec_test",timestamp=Math.floor(Date.now()/1000),payload=JSON.stringify({id:"evt_once",type:"ping",data:{object:{id:"obj"}}}),digest=await signature(payload,secret,timestamp);
  const seen=new Set();
  const DB={prepare(sql){let values=[];return {bind(...bound){values=bound;return this},async run(){if(sql.startsWith("INSERT OR IGNORE")){if(seen.has(values[0]))return {meta:{changes:0}};seen.add(values[0]);return {meta:{changes:1}}}return {meta:{changes:1}}}}}};
  const makeRequest=()=>new Request("https://api.sorasukt.com/api/stripe/webhook",{method:"POST",headers:{"Stripe-Signature":`t=${timestamp},v1=${digest}`},body:payload});
  const first=await handleStripeWebhook(makeRequest(),{DB,STRIPE_WEBHOOK_SECRET:secret});
  const second=await handleStripeWebhook(makeRequest(),{DB,STRIPE_WEBHOOK_SECRET:secret});
  assert.equal(first.status,200);assert.equal((await first.json()).duplicate,undefined);
  assert.equal(second.status,200);assert.equal((await second.json()).duplicate,true);
});

test("a paid one-time membership is activated once by the verified webhook",async()=>{
  const secret="whsec_test",timestamp=Math.floor(Date.now()/1000);
  const event={id:"evt_membership_once",type:"checkout.session.completed",data:{object:{id:"cs_test_membership",payment_status:"paid",amount_total:29900,currency:"thb",customer:"cus_member",payment_intent:"pi_member",metadata:{kind:"membership",payment_type:"one_time",period:"monthly",user_sub:"auth0|member"}}}};
  const payload=JSON.stringify(event),digest=await signature(payload,secret,timestamp),seen=new Set(),membershipWrites=[];
  const DB={prepare(sql){let values=[];return {bind(...bound){values=bound;return this},async first(){return null},async run(){
    if(sql.startsWith("INSERT OR IGNORE")){if(seen.has(values[0]))return {meta:{changes:0}};seen.add(values[0]);return {meta:{changes:1}}}
    if(sql.includes("INSERT INTO tarot_memberships"))membershipWrites.push(values);
    return {meta:{changes:1}};
  }}}};
  const makeRequest=()=>new Request("https://api.sorasukt.com/api/stripe/webhook",{method:"POST",headers:{"Stripe-Signature":`t=${timestamp},v1=${digest}`},body:payload});
  assert.equal((await handleStripeWebhook(makeRequest(),{DB,STRIPE_WEBHOOK_SECRET:secret})).status,200);
  assert.equal((await handleStripeWebhook(makeRequest(),{DB,STRIPE_WEBHOOK_SECRET:secret})).status,200);
  assert.equal(membershipWrites.length,1);
  assert.deepEqual(membershipWrites[0].slice(0,5),["auth0|member","cus_member","monthly","one_time","active"]);
});

test("a subscription package change updates its period and cancellation state in D1",async()=>{
  const secret="whsec_test",timestamp=Math.floor(Date.now()/1000),membershipWrites=[];
  const event={id:"evt_subscription_change",type:"customer.subscription.updated",data:{object:{id:"sub_member",customer:"cus_member",status:"active",cancel_at_period_end:true,current_period_end:1_900_000_000,metadata:{user_sub:"auth0|member",period:"monthly"},items:{data:[{price:{id:"price_yearly",recurring:{interval:"year"}}}]}}}};
  const payload=JSON.stringify(event),digest=await signature(payload,secret,timestamp);
  const DB={prepare(sql){let values=[];return {bind(...bound){values=bound;return this},async run(){if(sql.includes("INSERT INTO tarot_memberships"))membershipWrites.push(values);return {meta:{changes:1}}}}}};
  const request=new Request("https://api.sorasukt.com/api/stripe/webhook",{method:"POST",headers:{"Stripe-Signature":`t=${timestamp},v1=${digest}`},body:payload});
  const response=await handleStripeWebhook(request,{DB,STRIPE_WEBHOOK_SECRET:secret,STRIPE_PRICE_SUB_YEARLY:"price_yearly"});
  assert.equal(response.status,200);
  assert.equal(membershipWrites.length,1);
  assert.deepEqual(membershipWrites[0].slice(0,8),["auth0|member","cus_member","sub_member","yearly","subscription","active","2030-03-17T17:46:40.000Z",1]);
});

test("membership status refresh reconciles the latest subscription before responding",async()=>{
  const originalFetch=globalThis.fetch;let membership={plan_period:"weekly",payment_type:"subscription",status:"active",current_period_end:null,cancel_at_period_end:0,updated_at:"before"};
  globalThis.fetch=async url=>{assert.match(url,/\/subscriptions\/sub_refresh\?expand\[\]=items\.data\.price$/);return Response.json({id:"sub_refresh",customer:"cus_refresh",status:"active",cancel_at_period_end:false,current_period_end:1_900_000_000,metadata:{user_sub:"auth0|refresh"},items:{data:[{price:{id:"price_monthly",recurring:{interval:"month"}}}]}})};
  const DB={prepare(sql){let values=[];return {bind(...bound){values=bound;return this},async first(){if(sql.includes("stripe_subscription_id,payment_type"))return {stripe_subscription_id:"sub_refresh",payment_type:"subscription"};if(sql.includes("SELECT plan_period"))return membership;return null},async run(){if(sql.includes("INSERT INTO tarot_memberships"))membership={plan_period:values[3],payment_type:values[4],status:values[5],current_period_end:values[6],cancel_at_period_end:values[7],updated_at:"after"};return {meta:{changes:1}}}}}};
  try{
    const response=await handleBilling(new Request("https://api.sorasukt.com/api/billing/status?refresh=1"),{DB,STRIPE_SECRET_KEY:"sk_test",STRIPE_PRICE_SUB_MONTHLY:"price_monthly"},headers,{sub:"auth0|refresh"});
    const data=await response.json();
    assert.equal(response.status,200);
    assert.equal(data.membership.period,"monthly");
    assert.equal(data.membership.active,true);
  }finally{globalThis.fetch=originalFetch}
});
