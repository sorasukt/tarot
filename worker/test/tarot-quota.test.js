import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {withTarotQuota,withFeatureQuota,acknowledgeDelivery} from '../src/tarot-quota.js';

function fixture(){
  const sql=new DatabaseSync(':memory:');
  for(const file of ['0009_member_entitlements.sql','0014_tarot_quota_receipts.sql','0015_quota_deliveries.sql'])sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  const prepare=query=>({query,args:[],bind(...args){this.args=args;return this;},async first(){return sql.prepare(query).get(...this.args)||null;},async run(){return {meta:sql.prepare(query).run(...this.args)};}});
  // Execute the entire batch synchronously: another request cannot interleave inside a D1 transaction.
  const DB={prepare,async batch(statements){sql.exec('BEGIN');try{const results=statements.map(s=>({meta:sql.prepare(s.query).run(...s.args)}));sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
  const request=(requestId='same',question='fixture')=>new Request('https://api.test/api/tarot/reading',{method:'POST',headers:{'CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify({requestId,question,cards:[0,1,2,3,4]})});
  const run=(generate,req=request())=>withTarotQuota(req,{DB},null,{'Content-Type':'application/json'},generate);
  const ack=(response,{session=null,ip='192.0.2.1',outcome='received'}={})=>acknowledgeDelivery(new Request('https://api.test/api/usage/ack',{method:'POST',headers:{'CF-Connecting-IP':ip},body:JSON.stringify({token:response.headers.get('X-Tarot-Delivery'),outcome})}),{DB},session,{});
  return {sql,DB,request,run,ack,count:()=>sql.prepare('SELECT SUM(used_count) AS n FROM ai_daily_quotas').get().n||0};
}
const success=()=>Response.json({success:true,reading:{overallReading:'overview',cards:Array.from({length:5},()=>({interpretation:'meaning'}))}});
const token=response=>response.headers.get('X-Tarot-Delivery');

function memberTables(f){f.sql.exec("CREATE TABLE tarot_memberships(user_sub TEXT,plan_period TEXT,payment_type TEXT,status TEXT,current_period_end TEXT,cancel_at_period_end INT,updated_at TEXT);CREATE TABLE member_profiles(user_sub TEXT,birth_date TEXT,birth_time TEXT,birth_place_id TEXT,updated_at TEXT);");}

test('provider failures, empty cards and incomplete output never create chargeable deliveries',async()=>{
  const f=fixture();
  const generators=[()=>Response.json({success:false},{status:504}),()=>Promise.reject(new Error('fixture')),()=>Response.json({success:true,reading:{cards:[]}}),()=>Response.json({success:true,reading:{cards:[{},{},{},{},{}]}})];
  for(const generate of generators){const result=await f.run(generate);assert.equal(token(result),null);}
  assert.equal(f.count(),0);
  const delivered=await f.run(success);assert.equal(delivered.status,200);assert.equal(f.count(),0);
  await f.ack(delivered);assert.equal(f.count(),1);
});
test('lost response costs zero; retry and duplicate acknowledgements debit exactly once',async()=>{
  const f=fixture();
  const lost=await f.run(success);assert.equal(f.count(),0);
  const retry=await f.run(success);assert.equal(token(retry),token(lost));
  await Promise.all([f.ack(retry),f.ack(retry)]);assert.equal(f.count(),1);
  const changed=await f.run(success,f.request('same','changed question'));assert.notEqual(token(changed),token(retry));
  await f.ack(changed);assert.equal(f.count(),2);
  assert.equal((await f.run(success,f.request('new'))).status,429);
  assert.equal((await f.run(success)).status,200);assert.equal(f.count(),2);
});
test('concurrent generations reserve only remaining capacity without charging; same request shares token',async()=>{
  const f=fixture(),waiting=[];
  const generate=()=>new Promise(resolve=>waiting.push(()=>resolve(success())));
  const first=f.run(generate),duplicate=f.run(generate);
  while(waiting.length<2)await new Promise(resolve=>setImmediate(resolve));
  waiting.shift()();waiting.shift()();
  const [a,b]=await Promise.all([first,duplicate]);assert.equal(token(a),token(b));assert.equal(f.count(),0);
  await f.ack(a);assert.equal(f.count(),1);
  const third=f.run(generate,f.request('third')),fourth=f.run(generate,f.request('fourth'));
  while(waiting.length<2)await new Promise(resolve=>setImmediate(resolve));
  waiting.shift()();waiting.shift()();
  const results=await Promise.all([third,fourth]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(f.count(),1);
  await f.ack(results.find(r=>r.status===200));assert.equal(f.count(),2);
});
test('receipt insert failure rolls back debit and acknowledgement retry recovers',async()=>{
  const f=fixture(),response=await f.run(success);
  f.sql.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON tarot_quota_receipts BEGIN SELECT RAISE(ABORT,'fixture'); END");
  assert.equal((await f.ack(response)).status,503);assert.equal(f.count(),0);
  f.sql.exec('DROP TRIGGER fail_receipt');await f.ack(response);assert.equal(f.count(),1);
});
test('invalid JSON does not generate or charge',async()=>{
  const f=fixture();let calls=0;
  const response=await f.run(()=>{calls++;return success();},new Request('https://api.test/api/tarot/reading',{method:'POST',body:'{'}));
  assert.equal(response.status,400);assert.equal(calls,0);assert.equal(f.count(),0);
});
test('TTS failed or unplayed audio costs zero; completed audio charges once',async()=>{
  const f=fixture();memberTables(f);const session={sub:'owner'};
  const run=generate=>withFeatureQuota(f.request(),{DB:f.DB},session,new Headers(),generate,'tts');let called=false;
  assert.equal((await run(()=>{called=true;return success()})).status,403);assert.equal(called,false);
  f.sql.exec("INSERT INTO tarot_memberships VALUES('owner','monthly','subscription','active','2099-01-01T00:00:00Z',0,CURRENT_TIMESTAMP)");
  for(const generate of [()=>Response.json({success:false},{status:503}),()=>new Response('',{headers:{'Content-Type':'audio/wav'}}),()=>Response.json({success:true})]){assert.equal(token(await run(generate)),null);assert.equal(f.count(),0);}
  const audio=()=>new Response('audio bytes',{headers:{'Content-Type':'audio/wav'}});
  const failedPlayback=await run(audio);assert.equal(f.count(),0);await f.ack(failedPlayback,{session,outcome:'failed'});assert.equal(f.count(),0);
  const completed=await run(audio);assert.notEqual(token(completed),token(failedPlayback));
  await f.ack(completed,{session});await f.ack(completed,{session});assert.equal(f.count(),1);
  // A stale failure report cannot refund a completed playback.
  await f.ack(completed,{session,outcome:'failed'});assert.equal(f.count(),1);
});
test('deep reading requires complete output and receipt distinguishes changed profile',async()=>{
  const f=fixture();memberTables(f);f.sql.exec("INSERT INTO member_profiles VALUES('owner','2000-01-01','','',CURRENT_TIMESTAMP)");
  const session={sub:'owner'},run=generate=>withFeatureQuota(new Request('https://api.test/api/member/astrology'),{DB:f.DB},session,new Headers(),generate,'astrology');
  assert.equal(token(await run(()=>Response.json({},{status:202}))),null);
  assert.equal((await run(()=>Response.json({success:true,reading:{}}))).status,502);assert.equal(f.count(),0);
  const response=await run(()=>Response.json({success:true,reading:{overview:'fixture'}}));assert.equal(f.count(),0);
  await f.ack(response,{session});assert.equal(f.count(),1);
  assert.equal((await run(()=>Response.json({success:true,reading:{overview:'fixture'}}))).status,200);
  f.sql.exec("UPDATE member_profiles SET birth_date='2001-01-01'");assert.equal((await run(success)).status,429);assert.equal(f.count(),1);
});
test('forged, expired and other-user tokens cannot charge; abandoned holds expire free',async()=>{
  const f=fixture(),response=await f.run(success);
  assert.equal((await f.ack(response,{ip:'192.0.2.2'})).status,404);
  const forged=new Response(null,{headers:{'X-Tarot-Delivery':crypto.randomUUID()}});assert.equal((await f.ack(forged)).status,404);
  await f.run(success,f.request('second'));
  assert.equal((await f.run(success,f.request('third'))).status,409);assert.equal(f.count(),0);
  f.sql.exec("UPDATE quota_deliveries SET expires_at='2000-01-01'");
  assert.equal((await f.ack(response)).status,404);assert.equal(f.count(),0);
  const fresh=await f.run(success);assert.equal(fresh.status,200);assert.notEqual(token(fresh),token(response));assert.equal(f.count(),0);
});
test('aborted request and truncated body never issue a delivery token',async()=>{
  const f=fixture(),controller=new AbortController();
  const request=new Request(f.request(),{signal:controller.signal});
  const result=await f.run(()=>{controller.abort();return success()},request);
  assert.equal(result.status,499);assert.equal(token(result),null);assert.equal(f.count(),0);
  const stream=new ReadableStream({start(c){c.error(new Error('connection lost'));}});
  const broken=await f.run(()=>new Response(stream,{headers:{'Content-Type':'application/json'}}));
  assert.equal(broken.status,502);assert.equal(token(broken),null);assert.equal(f.count(),0);
});
test('late acknowledgement charges original day, never the next day allowance',async()=>{
  const f=fixture(),response=await f.run(success);
  f.sql.exec("UPDATE quota_deliveries SET quota_date='2020-01-01'");
  await f.ack(response);assert.equal(f.count(),1);
  assert.equal(f.sql.prepare('SELECT quota_date FROM ai_daily_quotas').get().quota_date,'2020-01-01');
});

test('delivery failure releases an uncharged hold and CORS exposes only the opaque token',async()=>{
  const f=fixture();const a=await f.run(success),b=await f.run(success,f.request('second'));
  assert.equal(a.headers.get('Access-Control-Expose-Headers'),'X-Tarot-Delivery');
  assert.equal(a.headers.get('Cache-Control'),'no-store');
  assert.equal((await f.run(success,f.request('third'))).status,409);
  await f.ack(a,{outcome:'failed'});assert.equal(f.count(),0);
  assert.equal((await f.run(success,f.request('third'))).status,200);
  assert.equal((await f.ack(a)).status,404);await f.ack(b);assert.equal(f.count(),1);
});
