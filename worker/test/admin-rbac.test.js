import test from "node:test";
import assert from "node:assert/strict";
import {adminAccess} from "../src/admin.js";

test("admin requires both the Auth0 admin role and sorasukt.com email",()=>{
  const access=adminAccess({email:"owner@sorasukt.com",roles:["admin"]});
  assert.equal(access.authorized,true);
  assert.deepEqual(access.roles,["admin"]);
  for(const permission of ["overview:read","payments:read","memberships:read","customers:read","support:read","support:write","audit:read","stripe:open"])
    assert.ok(access.permissions.includes(permission));
});

test("admin role on an external email fails closed",()=>{
  const access=adminAccess({email:"owner@example.com",roles:["admin"]});
  assert.deepEqual(access,{authorized:false,roles:[],permissions:[]});
});

test("sorasukt.com email without admin role fails closed",()=>{
  const access=adminAccess({email:"owner@sorasukt.com",roles:["support","billing"]});
  assert.deepEqual(access,{authorized:false,roles:[],permissions:[]});
});

test("lookalike and subdomain addresses are rejected",()=>{
  for(const email of ["owner@sorasukt.com.evil.test","owner@admin.sorasukt.com","sorasukt.com@example.com",""]){
    const access=adminAccess({email,roles:["admin"]});
    assert.equal(access.authorized,false);
  }
});
