import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {withTarotQuota} from '../src/tarot-quota.js';

function fixture(){
  const sql=new DatabaseSync(':memory:');
  for(const file of ['0009_member_entitlements.sql','0014_tarot_quota_receipts.sql'])sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  const prepare=query=>({args:[],bind(...args){this.args=args;return this;},async first(){return sql.prepare(query).get(...this.args)||null;},async run(){return {meta:sql.prepare(query).run(...this.args)};}});
  const DB={prepare,async batch(statements){sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
  const request=(requestId='same',question='fixture')=>new Request('https://api.test/api/tarot/reading',{method:'POST',headers:{'CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify({requestId,question,cards:[0,1,2,3,4]})});
  const run=(generate,req=request())=>withTarotQuota(req,{DB},null,{'Content-Type':'application/json'},generate);
  return {sql,DB,request,run,count:()=>sql.prepare('SELECT SUM(used_count) AS n FROM ai_daily_quotas').get().n||0};
}
const success=()=>Response.json({success:true,reading:{cards:[{},{},{},{},{}]}});

test('provider failure, rejection and malformed success do not consume quota',async()=>{
  const f=fixture();
  for(const generate of [()=>Response.json({success:false},{status:504}),()=>Promise.reject(new Error('fixture')),()=>Response.json({success:true,reading:{cards:[]}})])await f.run(generate);
  assert.equal(f.count(),0);
  assert.equal((await f.run(success)).status,200);assert.equal(f.count(),1);
});
test('lost response retry consumes one slot; different payload cannot reuse receipt',async()=>{
  const f=fixture();
  await f.run(success); // Pretend client never receives this response.
  await f.run(success);
  assert.equal(f.count(),1);
  await f.run(success,f.request('same','changed question'));
  assert.equal(f.count(),2);
  assert.equal((await f.run(success,f.request('new'))).status,429);
  assert.equal((await f.run(success)).status,200);assert.equal(f.count(),2);
});
test('overlapping retries debit once and distinct requests cannot exceed final slot',async()=>{
  const f=fixture();const waiting=[];
  const generate=()=>new Promise(resolve=>waiting.push(()=>resolve(success())));
  const first=f.run(generate),second=f.run(generate);
  while(waiting.length<2)await new Promise(resolve=>setImmediate(resolve));
  waiting.shift()();await first;waiting.shift()();await second;assert.equal(f.count(),1);
  const third=f.run(generate,f.request('third')),fourth=f.run(generate,f.request('fourth'));
  while(waiting.length<2)await new Promise(resolve=>setImmediate(resolve));
  waiting.shift()();assert.equal((await third).status,200);
  waiting.shift()();assert.equal((await fourth).status,429);assert.equal(f.count(),2);
});
test('receipt insert failure rolls back debit',async()=>{
  const f=fixture();f.sql.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON tarot_quota_receipts BEGIN SELECT RAISE(ABORT,'fixture'); END");
  assert.equal((await f.run(success)).status,503);assert.equal(f.count(),0);
});
test('invalid JSON does not generate or charge',async()=>{
  const f=fixture();let calls=0;
  const response=await f.run(()=>{calls++;return success();},new Request('https://api.test/api/tarot/reading',{method:'POST',body:'{'}));
  assert.equal(response.status,400);assert.equal(calls,0);assert.equal(f.count(),0);
});
