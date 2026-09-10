import {fetchPage} from './feed.mjs';
const format=new Intl.DateTimeFormat('th-TH',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Bangkok'});
for(const kind of ['merged','future']){
 const root=document.getElementById(kind),list=root.querySelector('ul'),status=root.querySelector('[role="status"]'),button=root.querySelector('button');
 let page=1,busy=false,hasNext=true;const items=new Map();
 function render(){
  const fragment=document.createDocumentFragment();
  [...items.values()].sort((a,b)=>(Date.parse(b.date)||0)-(Date.parse(a.date)||0)||b.number-a.number).forEach(item=>{
   const li=document.createElement('li'),link=document.createElement('a'),title=document.createElement('span'),meta=document.createElement('small');
   link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label',`${item.title} · เปิด GitHub ในแท็บใหม่`);
   title.textContent=item.title;meta.textContent=`#${item.number} · ${item.date?format.format(new Date(item.date)):'ไม่ระบุวันที่'}${item.draft?' · กำลังร่าง':''}`;
   link.append(title,meta);li.append(link);fragment.append(li);
  });list.replaceChildren(fragment);
 }
 async function load(){
  if(busy||!hasNext)return;busy=true;button.disabled=true;root.setAttribute('aria-busy','true');status.textContent='กำลังโหลด…';
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
   const result=await fetchPage(kind,page,{signal:controller.signal});
   result.items.forEach(item=>items.set(item.number,item));page++;hasNext=result.hasNext;render();
   status.textContent=items.size?'':hasNext?'ยังไม่มีรายการในชุดนี้ กดโหลดเพิ่มเพื่อดูรายการก่อนหน้า':kind==='merged'?'ยังไม่มีการอัปเดต':'ยังไม่มีการอัปเดตในอนาคต';
   button.textContent='โหลดเพิ่ม';button.hidden=!hasNext;
  }catch(error){status.textContent=error.name==='AbortError'?'ใช้เวลานานกว่าปกติ กรุณาลองอีกครั้ง':error.message;button.textContent='ลองใหม่';button.hidden=false;}
  finally{clearTimeout(timer);busy=false;button.disabled=false;root.setAttribute('aria-busy','false');}
 }
 button.addEventListener('click',load);void load();
}
