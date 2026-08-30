import test from 'node:test';
import assert from 'node:assert/strict';
import {adminAccess} from '../src/admin.js';

test('admin receives all console permissions',()=>{
  const access=adminAccess({roles:['admin']});
  assert.deepEqual(access.roles,['admin']);
  for(const permission of ['overview:read','payments:read','memberships:read','customers:read','support:read','support:write','audit:read','stripe:open'])assert.ok(access.permissions.includes(permission));
});

test('support cannot access billing or audit actions',()=>{
  const access=adminAccess({roles:['support']});
  assert.ok(access.permissions.includes('support:write'));
  assert.ok(access.permissions.includes('customers:read'));
  assert.equal(access.permissions.includes('payments:read'),false);
  assert.equal(access.permissions.includes('audit:read'),false);
  assert.equal(access.permissions.includes('stripe:open'),false);
});

test('billing cannot write support cases',()=>{
  const access=adminAccess({roles:['billing']});
  assert.ok(access.permissions.includes('payments:read'));
  assert.ok(access.permissions.includes('memberships:read'));
  assert.ok(access.permissions.includes('stripe:open'));
  assert.equal(access.permissions.includes('support:write'),false);
});

test('viewer is read only',()=>{
  const access=adminAccess({roles:['viewer']});
  assert.ok(access.permissions.includes('overview:read'));
  assert.ok(access.permissions.includes('support:read'));
  assert.equal(access.permissions.includes('support:write'),false);
  assert.equal(access.permissions.includes('audit:read'),false);
  assert.equal(access.permissions.includes('stripe:open'),false);
});

test('unknown roles fail closed and multiple roles combine permissions',()=>{
  assert.deepEqual(adminAccess({roles:['unknown']}),{roles:[],permissions:[]});
  const combined=adminAccess({roles:['support','billing','unknown','SUPPORT']});
  assert.deepEqual(combined.roles,['support','billing']);
  assert.ok(combined.permissions.includes('support:write'));
  assert.ok(combined.permissions.includes('payments:read'));
});
