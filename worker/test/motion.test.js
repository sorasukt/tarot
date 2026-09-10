import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../portal.js',import.meta.url),'utf8');
function setup(reduced=false){
 const jobs=new Map();let id=0;
 const context={window:{matchMedia:()=>({matches:reduced})},getComputedStyle:()=>({getPropertyValue:()=> '150ms'}),setTimeout:fn=>{jobs.set(++id,fn);return id},clearTimeout:id=>jobs.delete(id)};
 vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('  const textSwapJobs'),source.indexOf('  function setLoading'))+'\nthis.swap=swapText;',context);
 const classes=new Set();const node={textContent:'old',offsetWidth:40,classList:{add:(...xs)=>xs.forEach(x=>classes.add(x)),remove:(...xs)=>xs.forEach(x=>classes.delete(x))}};
 return {node,classes,jobs,swap:context.swap,flush(){for(const fn of [...jobs.values()])fn();jobs.clear()}};
}
test('rapid status swaps keep only the latest text',()=>{const x=setup();x.swap(x.node,'first');x.swap(x.node,'latest');x.flush();assert.equal(x.node.textContent,'latest');assert.ok(!x.classes.has('is-exit'));assert.ok(!x.classes.has('is-enter-start'))});
test('clearing pending motion cannot overwrite an error',()=>{const x=setup();x.swap(x.node,'pending');x.swap(x.node,'');x.node.textContent='error';x.flush();assert.equal(x.node.textContent,'error')});
test('reduced motion swaps immediately without timers',()=>{const x=setup(true);x.swap(x.node,'new');assert.equal(x.node.textContent,'new');assert.equal(x.jobs.size,0);assert.ok(!x.classes.has('is-exit'))});
test('loading shimmer escapes quotes in its duplicate text attribute',()=>{const context={};vm.createContext(context);vm.runInContext(source.slice(source.indexOf('  function setLoading'),source.indexOf('  function finishLoading'))+source.slice(source.indexOf('  function escapeHtml'),source.indexOf('\n',source.indexOf('  function escapeHtml')))+'\nthis.load=setLoading;',context);const node={setAttribute(){}};context.load(node,'" <tag>');assert.ok(node.innerHTML.includes('data-text="&quot; &lt;tag&gt;"'));assert.ok(!node.innerHTML.includes('<tag>'))});
