import assert from "node:assert/strict";
import test from "node:test";
import {handleRedeemAdmin} from "../src/redeem-admin.js";

const headers={"Content-Type":"application/json"};
const session={sub:"auth0|admin",roles:["admin"]};

function db(){return {prepare(){return {bind(){return this},async run(){return {meta:{changes:1}}},async all(){return {results:[]}}}}}}

test("local redeem links stay under the Tarot base path",async()=>{
  const request=new Request("https://api.sorasukt.com/api/admin/redeem-codes",{method:"POST",headers,body:JSON.stringify({plan:"yearly",code:"LOCAL-YEAR2026"})});
  const response=await handleRedeemAdmin(request,{DB:db(),SITE_URL:"https://sorasukt.com"},headers,session);
  const data=await response.json();
  assert.equal(response.status,201);
  assert.equal(data.redeem.redeemUrl,"https://sorasukt.com/tarot/redeem/?code=LOCAL-YEAR2026&plan=yearly");
});
