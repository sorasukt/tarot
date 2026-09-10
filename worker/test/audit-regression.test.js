import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {handleHistory} from '../src/history.js';
import {handleFortune} from '../src/fortune.js';
import {handleAdvancedBilling} from '../src/stripe-advanced.js';
const headers={'Content-Type':'application/json'};
const request=(path,body)=>new Request('https://api.test'+path,body?{method:'POST',body:JSON.stringify(body)}:{});

function d1(sql){return {prepare(query){return {args:[],bind(...args){this.args=args;return this},async first(){return sql.prepare(query).get(...this.args)||null},async all(){return {results:sql.prepare(query).all(...this.args)}},async run(){return {meta:sql.prepare(query).run(...this.args)}}}}};}
test('history cursor passes 100 tied timestamps; details enforce owner and expiry',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec(`CREATE TABLE tarot_memberships(user_sub TEXT,plan_period TEXT,payment_type TEXT,status TEXT,current_period_end TEXT,cancel_at_period_end INT,updated_at TEXT);CREATE TABLE tarot_reading_history(id TEXT,user_sub TEXT,question TEXT,category TEXT,cards_json TEXT,preview TEXT,reading_json TEXT,created_at TEXT,expires_at TEXT);`);
 const insert=sql.prepare("INSERT INTO tarot_reading_history VALUES(?,?,'Q','personal','[]','preview',?,CURRENT_TIMESTAMP,datetime('now',?))");
 for(let i=0;i<105;i++)insert.run(String(i).padStart(3,'0'),'owner',JSON.stringify({summary:'full '+i}),'+1 day');
 insert.run('foreign','other','{}','+1 day');insert.run('expired','owner','{}','-1 day');
 const env={DB:d1(sql)},session={sub:'owner'};
 const first=await (await handleHistory(request('/api/member/history?limit=100'),env,headers,session)).json();assert.equal(first.items.length,100);assert.ok(first.nextCursor);
 const second=await (await handleHistory(request('/api/member/history?limit=100&cursor='+encodeURIComponent(first.nextCursor)),env,headers,session)).json();assert.equal(second.items.length,5);assert.equal(second.nextCursor,null);assert.equal(new Set([...first.items,...second.items].map(x=>x.id)).size,105);
 assert.equal((await handleHistory(request('/api/member/history/foreign'),env,headers,session)).status,404);
 assert.equal((await handleHistory(request('/api/member/history/expired'),env,headers,session)).status,404);
 const detail=await (await handleHistory(request('/api/member/history/001'),env,headers,session)).json();assert.equal(detail.item.reading.summary,'full 1');
});
test('fortune async failures return JSON and explicit invalid dates reject',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('fixture')};
 try{
 const failure=await handleFortune(request('/api/fortune/zodiac',{birthDate:'2000-01-01'}),{GEMINI_API_KEY:'fixture'},headers);assert.equal(failure.status,502);assert.equal((await failure.json()).error.code,'AI_GENERATION_FAILED');
 const invalid=await handleFortune(request('/api/fortune/astrology',{birthDate:'2099-01-01'}),{GEMINI_API_KEY:'fixture'},headers,{sub:'owner'},{birth_date:'2000-01-01'});assert.equal(invalid.status,400);
 }finally{globalThis.fetch=original}
});
test('advanced billing async configuration errors retain structured status',async()=>{
 const response=await handleAdvancedBilling(request('/api/billing/invoices'),{},headers,{sub:'owner'});assert.equal(response.status,503);assert.equal((await response.json()).error.code,'STRIPE_NOT_CONFIGURED');
});
test('pending plan does not update DB; distinct plan operations use distinct keys',async()=>{
 let plan='monthly',writes=0,pending=true;const keys=[];
 const env={STRIPE_SECRET_KEY:'fixture',STRIPE_PRICE_SUB_YEARLY:'year',STRIPE_PRICE_SUB_MONTHLY:'month',DB:{prepare(){return {args:[],bind(...a){this.args=a;return this},async first(){return {stripe_subscription_id:'sub_fixture',status:'active',plan_period:plan}},async run(){plan=this.args[0];writes++;return {meta:{changes:1}}}}}}};
 const original=globalThis.fetch;globalThis.fetch=async(_url,options={})=>{const price=options.method==='POST'?new URLSearchParams(options.body).get('items[0][price]'):'month';if(options.method==='POST')keys.push(options.headers['Idempotency-Key']);return Response.json({status:'active',items:{data:[{id:'si_fixture',price:{id:pending?'month':price}}]},...(pending?{pending_update:{expires_at:9999999999}}:{})})};
 try{
 const first=await (await handleAdvancedBilling(request('/api/billing/subscription/change',{period:'yearly',requestId:crypto.randomUUID()}),env,headers,{sub:'owner'})).json();assert.equal(first.pending,true);assert.equal(first.membership.period,'monthly');assert.equal(writes,0);
 pending=false;for(const period of ['yearly','monthly','yearly']){const r=await handleAdvancedBilling(request('/api/billing/subscription/change',{period,requestId:crypto.randomUUID()}),env,headers,{sub:'owner'});assert.equal(r.status,200)}assert.equal(new Set(keys).size,4);assert.equal(plan,'yearly');
 }finally{globalThis.fetch=original}
});
function expose(path,names,context){const source=readFileSync(new URL('../../'+path,import.meta.url),'utf8').replace(/\}\)\(\);\s*$/,`globalThis.audit={${names}};})();`);vm.createContext(context);vm.runInContext(source,context);return context.audit;}
test('payment merge preserves refunds and parses SQL timestamp as UTC',()=>{
 const list={innerHTML:''};const a=expose('me/me-payments.js','renderHistory,parseDate',{document:{readyState:'loading',getElementById:()=>list},addEventListener(){},Intl,Date,URL});
 a.renderHistory([{id:'pi_one',status:'refunded'}],[{paymentIntent:'pi_one',status:'paid'}]);assert.match(list.innerHTML,/คืนเงินแล้ว/);assert.doesNotMatch(list.innerHTML,/ชำระแล้ว/);assert.equal(a.parseDate('2026-09-07 18:00:00').toISOString(),'2026-09-07T18:00:00.000Z');
});
test('TTS fallback remains playing, exposes Stop and cleans up on end',()=>{
 const calls=[];let utterance;const window={speechSynthesis:{cancel(){calls.push('cancel')},speak(u){calls.push('speak');utterance=u},getVoices:()=>[]}};
 const a=expose('tts-reading.js','startFallback',{window,SpeechSynthesisUtterance:class{},addEventListener(){},URL});
 const button={},stop={hidden:true},status={};assert.equal(a.startFallback('hello',button,stop,status),true);assert.equal(calls.at(-1),'speak');assert.equal(stop.hidden,false);assert.equal(button.disabled,true);utterance.onend();assert.equal(stop.hidden,true);assert.equal(button.disabled,false);
});
test('daily waits for consent and exhausted 202 clears busy without showing empty reading',async()=>{
 const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,{dataset:{},hidden:true,setAttribute(){},append(){},style:{}});return elements.get(id)};let accepted=false,calls=0;
 const a=expose('home.js','loadDaily',{document:{getElementById:el,addEventListener(){},createElement:()=>({addEventListener(){}})},window:{TarotPortal:{policyAccepted:()=>accepted,ai:async()=>{calls++;return Response.json({},{status:202})},renderError:(node,e)=>{node.textContent=e.message}}},addEventListener(){},setTimeout:fn=>fn(),setInterval(){},Intl,Date});
 await a.loadDaily();assert.equal(calls,0);accepted=true;await a.loadDaily();assert.equal(calls,21);assert.equal(el('dailyContent').hidden,true);assert.equal(el('memberStatus').dataset.loading,undefined);assert.match(el('memberStatus').textContent,/ยังเตรียม/);
});
test('service worker precache is unique, complete for imports, and deletes only own caches',async()=>{
 const listeners={},deleted=[],added=[];let activated;
 const context={self:{addEventListener:(n,f)=>listeners[n]=f,skipWaiting(){},clients:{claim(){}},location:{origin:'https://sorasukt.com'}},caches:{open:async()=>({addAll:async list=>added.push(...list)}),keys:async()=>['another-app','sorasukt-tarot-shell-v1','sorasukt-tarot-shell-v2-audit','sorasukt-tarot-shell-v3-delivery','sorasukt-tarot-shell-v4-home-reference','sorasukt-tarot-shell-v5-shared-motion','sorasukt-tarot-shell-v6-reading-updates','sorasukt-tarot-shell-v7-membership','sorasukt-tarot-shell-v8-usage'],delete:async key=>deleted.push(key)},Response,URL};
 vm.runInNewContext(readFileSync(new URL('../../service-worker.js',import.meta.url),'utf8'),context);listeners.install({waitUntil:p=>activated=p});await activated;assert.equal(new Set(added).size,added.length);assert.ok(added.includes('/tarot/assets/css/core/portal.css'));
 listeners.activate({waitUntil:p=>activated=p});await activated;assert.deepEqual(deleted,['sorasukt-tarot-shell-v1','sorasukt-tarot-shell-v2-audit','sorasukt-tarot-shell-v3-delivery','sorasukt-tarot-shell-v4-home-reference','sorasukt-tarot-shell-v5-shared-motion','sorasukt-tarot-shell-v6-reading-updates','sorasukt-tarot-shell-v7-membership']);
});
function element(){return {children:[],dataset:{},style:{},hidden:false,textContent:'',value:'',classList:{add(){},remove(){},toggle(){}},append(...nodes){this.children.push(...nodes)},replaceChildren(...nodes){this.children=[...nodes]},after(){},addEventListener(){},setAttribute(){},remove(){},querySelector(){return element()}}}
test('timeline ignores an older filter response arriving last',async()=>{
 const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)};el('rangeFilter').value='30';const responses=[];
 const context={document:{getElementById:el,createElement:element},Headers,URLSearchParams,Intl,Date,fetch:()=>new Promise(resolve=>responses.push(resolve))};
 const source=readFileSync(new URL('../../history/history.js',import.meta.url),'utf8').replace('void loadAll();','').replace(/\}\)\(\);\s*$/,'globalThis.audit={loadTimeline};})();');vm.createContext(context);vm.runInContext(source,context);
 const first=context.audit.loadTimeline(),second=context.audit.loadTimeline();responses[1](Response.json({success:true,items:[{id:'new',cards:[]}]}));await second;responses[0](Response.json({success:true,items:[{id:'old',cards:[]}]}));await first;assert.deepEqual(el('timelineList').children.map(e=>e.dataset.id),['new']);
});
test('admin submit retains form after dispatch, prevents duplicate and resets after success',async()=>{
 let posts=0,release,resets=0;const nodes=new Map();const el=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)};
 const context={document:{addEventListener(){},getElementById:el},FormData:class{entries(){return [['subject','fixture']]}},fetch:async(_url,options)=>{if(options.method==='POST'){posts++;await new Promise(resolve=>release=resolve);return Response.json({success:true})}return Response.json({cases:[]})},setTimeout(){},console};vm.createContext(context);vm.runInContext(readFileSync(new URL('../../admin/admin.js',import.meta.url),'utf8'),context);
 const form=element();form.reset=()=>resets++;context.event={preventDefault(){},currentTarget:form};const first=vm.runInContext('createCase(event)',context);await vm.runInContext('createCase(event)',context);context.event.currentTarget=null;release();await first;assert.equal(posts,1);assert.equal(resets,1);assert.equal(form.dataset.pending,undefined);
});
