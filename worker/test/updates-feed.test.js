import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePull,fetchPage} from '../../updates/feed.mjs';
test('feed distinguishes merged, open, and closed-unmerged changes',()=>{
 const base={number:1,title:'Update',updated_at:'2026-09-10T00:00:00Z'};
 assert.equal(normalizePull({...base,state:'closed',merged_at:null},'merged'),null);
 assert.equal(normalizePull({...base,state:'closed',merged_at:'2026-09-09T00:00:00Z'},'merged').date,'2026-09-09T00:00:00Z');
 assert.equal(normalizePull({...base,state:'closed'},'future'),null);
 assert.equal(normalizePull({...base,state:'open',draft:true},'future').draft,true);
});
test('source cannot inject navigation URLs; malformed entries are omitted',()=>{
 assert.equal(normalizePull({number:2,title:'<script>',state:'open',html_url:'javascript:alert(1)'},'future').url,'https://github.com/sorasukt/tarot/pull/2');
 assert.equal(normalizePull({number:'2',title:'x',state:'open'},'future'),null);
});
test('pagination follows GitHub next relation after filtering closed-unmerged rows',async()=>{
 let requested;const result=await fetchPage('merged',2,{fetcher:async(url)=>{requested=url;return Response.json([{number:2,title:'Closed',state:'closed',merged_at:null}],{headers:{Link:'<https://api.github.com/next>; rel="next", <https://api.github.com/last>; rel="last"'}})}});
 assert.match(requested,/state=closed/);assert.match(requested,/page=2/);assert.deepEqual(result.items,[]);assert.equal(result.hasNext,true);
});
test('rate limit and invalid response stay errors rather than empty success',async()=>{
 await assert.rejects(fetchPage('future',1,{fetcher:async()=>new Response('',{status:403})}),/บ่อยเกินไป/);
 await assert.rejects(fetchPage('future',1,{fetcher:async()=>Response.json({message:'bad'})}),/ไม่สมบูรณ์/);
});
test('fetch passes cancellation and detects the last page',async()=>{
 const signal=new AbortController().signal;
 const result=await fetchPage('future',1,{signal,fetcher:async(url,options)=>{assert.equal(options.signal,signal);return Response.json([])}});
 assert.equal(result.hasNext,false);
});
