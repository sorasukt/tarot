import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/entry.js';

test('acknowledgement route enforces origin and consent and supports CORS preflight',async()=>{
  const endpoint='https://api.sorasukt.com/api/usage/ack';
  const options=await worker.fetch(new Request(endpoint,{method:'OPTIONS',headers:{Origin:'https://sorasukt.com'}}),{});
  assert.equal(options.status,204);assert.equal(options.headers.get('Access-Control-Allow-Origin'),'https://sorasukt.com');
  assert.equal((await worker.fetch(new Request(endpoint,{method:'POST',headers:{Origin:'https://attacker.test'},body:'{}'}),{})).status,403);
  assert.equal((await worker.fetch(new Request(endpoint,{method:'POST',headers:{Origin:'https://sorasukt.com'},body:'{}'}),{})).status,428);
  const malformed=await worker.fetch(new Request(endpoint,{method:'POST',headers:{Origin:'https://sorasukt.com','X-Tarot-Policy-Version':'2026-08-28-payments1'},body:'{}'}),{});
  assert.equal(malformed.status,400);assert.equal(malformed.headers.get('Access-Control-Allow-Credentials'),'true');
});
