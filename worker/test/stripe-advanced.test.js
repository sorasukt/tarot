import assert from "node:assert/strict";
import test from "node:test";
import {handleAdvancedAdmin} from "../src/stripe-advanced.js";

const headers={"Content-Type":"application/json"};

test("admin refund retries reuse the same Stripe operation and return the recorded result",async()=>{
  const originalFetch=globalThis.fetch,calls=[],refunds=new Map();
  globalThis.fetch=async (_url,options={})=>{calls.push(options);return Response.json({id:"re_test",amount:5000,currency:"thb",status:"succeeded",reason:"requested_by_customer"})};
  const DB={
    prepare(sql){let values=[];return {sql,get values(){return values},bind(...bound){values=bound;return this},async first(){
      if(sql.includes("FROM stripe_payments"))return {stripe_checkout_session_id:"cs_test",user_sub:"auth0|customer",amount:10000,currency:"thb",payment_status:"paid",stripe_payment_intent_id:"pi_test"};
      if(sql.includes("SUM(amount)"))return {refunded:[...refunds.values()].reduce((sum,row)=>sum+row.amount,0)};
      if(sql.includes("WHERE request_id=?"))return refunds.get(values[0])||null;
      return null;
    },async run(){return {meta:{changes:1}}}}},
    async batch(statements){for(const statement of statements){if(statement.sql.includes("INSERT INTO stripe_refunds")){const v=statement.values;refunds.set(v[9],{stripe_refund_id:v[0],amount:v[4],currency:v[5],status:v[6]})}}return statements.map(()=>({success:true}))}
  };
  const body={paymentIntentId:"pi_test",amount:5000,requestId:"123e4567-e89b-12d3-a456-426614174111"};
  const session={sub:"auth0|admin",email:"admin@example.com",roles:["admin"]};
  try{
    const first=await handleAdvancedAdmin(new Request("https://api.sorasukt.com/api/admin/payments/refund",{method:"POST",headers,body:JSON.stringify(body)}),{DB,STRIPE_SECRET_KEY:"sk_test"},headers,session);
    const second=await handleAdvancedAdmin(new Request("https://api.sorasukt.com/api/admin/payments/refund",{method:"POST",headers,body:JSON.stringify(body)}),{DB,STRIPE_SECRET_KEY:"sk_test"},headers,session);
    assert.equal(first.status,200);assert.equal(second.status,200);
    assert.equal((await second.json()).replayed,true);
    assert.equal(calls.length,1);
    assert.match(calls[0].headers["Idempotency-Key"],/^refund-[a-f0-9]{64}$/);
    assert.equal(new URLSearchParams(calls[0].body).get("metadata[request_id]"),body.requestId);
  }finally{globalThis.fetch=originalFetch}
});
