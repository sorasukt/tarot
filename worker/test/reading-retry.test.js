import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function fixture(){
  const elements=new Map();
  const el=id=>{
    if(!elements.has(id))elements.set(id,{hidden:true,textContent:'',value:'',disabled:false,attrs:{},listeners:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},addEventListener(k,v){this.listeners[k]=v;},focus(){this.focused=true;},replaceChildren(){},append(){},classList:{add(){},remove(){}}});
    return elements.get(id);
  };
  const calls=[];let reject;
  const context={document:{getElementById:el,querySelector:()=>el('main')},window:{TarotPortal:{ai:(_feature,_url,options)=>{calls.push(JSON.parse(options.body));return new Promise((_resolve,no)=>{reject=no;});},renderError(node,error){node.hidden=false;node.textContent=error.message;}}},crypto,console,setInterval:()=>1,clearInterval(){}};
  vm.createContext(context);vm.runInContext(readFileSync(new URL('../../app.js',import.meta.url),'utf8'),context);
  vm.runInContext('state.question="fixture";state.selected=cards.slice(0,5);',context);
  return {context,el,calls,fail:()=>reject(new Error('connection lost'))};
}
test('failure exposes error, keeps cards and retries with same request ID; pending clicks ignored',async()=>{
  const f=fixture();
  const first=vm.runInContext('createReading()',f.context);
  await vm.runInContext('createReading()',f.context);
  assert.equal(f.calls.length,1);assert.equal(f.el('revealButton').disabled,true);assert.ok('inert' in f.el('deckStep').attrs);
  vm.runInContext('toggleCard(cards[0],null,null)',f.context);
  assert.equal(vm.runInContext('state.selected.length',f.context),5);
  f.fail();await first;
  assert.equal(f.el('readingError').hidden,false);assert.equal(f.el('readingError').focused,true);assert.equal(f.el('revealButton').disabled,false);assert.ok(!('inert' in f.el('deckStep').attrs));
  const second=vm.runInContext('createReading()',f.context);
  assert.equal(f.calls[0].requestId,f.calls[1].requestId);assert.deepEqual(f.calls[0].cards,f.calls[1].cards);f.fail();await second;
});
test('error is outside both hidden step sections',()=>{
  const html=readFileSync(new URL('../../reading/index.html',import.meta.url),'utf8');
  const error=html.indexOf('id="readingError"'),result=html.indexOf('id="readingStep"');
  assert.ok(error<result);assert.match(html.slice(0,error),/<\/section>\s*<p class="reading-error" $/);
});
