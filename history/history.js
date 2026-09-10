(() => {
  const API="https://api.sorasukt.com";
  const POLICY_VERSION="2026-08-28-payments1";
  const categories={personal:"ส่วนตัว",work:"งาน",love:"ความรัก",study:"การเรียน",money:"การเงิน",other:"อื่น ๆ"};
  const $=id=>document.getElementById(id);
  const range=$("rangeFilter"),category=$("categoryFilter"),status=$("timelineStatus"),list=$("timelineList"),recurring=$("recurringCards"),recurringSection=$("recurringSection");

  let timelineSequence=0,insightSequence=0,nextCursor=null,loading=false,visibleCount=0;
  const weekly=$("weeklyReflection"),weeklyButton=$("weeklyReflectionButton");weeklyButton.addEventListener("click",()=>void loadWeekly(true));
  const more=document.createElement('button');more.type='button';more.textContent='โหลดคำอ่านเพิ่มเติม';more.hidden=true;list.after(more);more.addEventListener('click',()=>{if(!loading)void loadTimeline(true)});
  range.addEventListener("change",loadAll);
  category.addEventListener("change",()=>loadTimeline());
  void loadAll();

  async function api(path,options={}){
    const headers=new Headers(options.headers||{});headers.set("X-Tarot-Policy-Version",POLICY_VERSION);
    return fetch(`${API}${path}`,{...options,headers,credentials:"include"});
  }

  async function loadAll(){await Promise.all([loadTimeline(),loadInsights(),loadWeekly(false)])}

  async function loadWeekly(generate){weeklyButton.disabled=true;weekly.textContent=generate?"กำลังสร้างบททบทวน…":"กำลังรวบรวมสัปดาห์นี้…";try{const response=await api('/api/member/reflections/weekly',{method:generate?'POST':'GET'}),data=await response.json();if(response.status===401){weekly.textContent='ลงชื่อใช้งานเพื่อดูสรุปรายสัปดาห์';return}if(!response.ok)throw new Error(data?.error?.message||'โหลดสรุปรายสัปดาห์ไม่สำเร็จ');renderWeekly(data);weeklyButton.hidden=!data.aiAvailable||Boolean(data.summary)}catch(error){weekly.textContent=error?.message||'โหลดสรุปรายสัปดาห์ไม่สำเร็จ'}finally{weeklyButton.disabled=false}}
  function renderWeekly(data){weekly.replaceChildren();const stats=data.stats||{},numbers=document.createElement('div');numbers.className='weekly-numbers';[['คำอ่าน',stats.readings||0],['บันทึก',stats.journals||0],['ไพ่ซ้ำ',stats.recurringCards?.length||0]].forEach(([label,value])=>{const item=document.createElement('div'),strong=document.createElement('strong'),span=document.createElement('span');strong.textContent=value;span.textContent=label;item.append(strong,span);numbers.append(item)});weekly.append(numbers);if(data.summary){const summary=document.createElement('div');summary.className='weekly-summary';const h=document.createElement('h3');h.textContent=data.summary.title||'บททบทวนของสัปดาห์นี้';const p=document.createElement('p');p.textContent=data.summary.reflection||'';summary.append(h,p);if(data.summary.themes?.length){const ul=document.createElement('ul');data.summary.themes.forEach(value=>{const li=document.createElement('li');li.textContent=value;ul.append(li)});summary.append(ul)}if(data.summary.previousWeek){const compare=document.createElement('p');compare.textContent=data.summary.previousWeek;summary.append(compare)}if(data.summary.question){const question=document.createElement('blockquote');question.textContent=data.summary.question;summary.append(question)}weekly.append(summary)}else if(!stats.readings){const empty=document.createElement('p');empty.textContent='เมื่อบันทึกคำอ่านแล้ว สรุปของสัปดาห์จะแสดงที่นี่';weekly.append(empty)}}

  async function loadTimeline(append=false){
    const sequence=++timelineSequence;loading=true;more.disabled=true;
    status.textContent="กำลังโหลดไทม์ไลน์…";if(!append){list.replaceChildren();visibleCount=0;nextCursor=null;more.hidden=true;}
    try{
      const query=new URLSearchParams({range:range.value,limit:"100"});if(category.value)query.set("category",category.value);if(append&&nextCursor)query.set("cursor",nextCursor);
      const response=await api(`/api/member/history?${query}`);
      const data=await response.json().catch(()=>null);
      if(sequence!==timelineSequence)return;
      if(response.status===401){renderSignedOut();return}
      if(!response.ok||!data?.success)throw new Error(data?.error?.message||"โหลดไทม์ไลน์ไม่สำเร็จ");
      const access=data.access||{};
      visibleCount+=data.items.length;nextCursor=data.nextCursor||null;more.hidden=!nextCursor;
      status.textContent=visibleCount?`แสดง ${visibleCount} คำอ่าน · ประวัติที่เข้าถึงได้สูงสุด ${access.days||30} วัน`:"ยังไม่มีคำอ่านที่บันทึกไว้ในช่วงเวลานี้";
      data.items.forEach(renderItem);
    }catch(error){if(sequence===timelineSequence)status.textContent=error?.message||"โหลดไทม์ไลน์ไม่สำเร็จ";}finally{if(sequence===timelineSequence){loading=false;more.disabled=false;}}
  }

  async function loadInsights(){
    const sequence=++insightSequence;
    recurring.replaceChildren();recurringSection.hidden=true;
    try{
      const response=await api(`/api/member/history/insights?range=${encodeURIComponent(range.value)}`);
      const data=await response.json().catch(()=>null);if(sequence!==insightSequence||!response.ok||!data?.success)return;
      if(!data.items.length)return;
      recurringSection.hidden=false;
      data.items.forEach(item=>{const card=document.createElement("article");card.className="recurring-card";const count=document.createElement("strong");count.textContent=`${item.count}×`;const name=document.createElement("span");name.textContent=item.cardName;card.append(count,name);recurring.append(card)});
    }catch{}
  }

  function renderItem(item){
    const article=document.createElement("article");article.className="timeline-item";article.dataset.id=item.id;
    const top=document.createElement("div");top.className="timeline-item-top";
    const meta=document.createElement("div");const date=document.createElement("time");date.dateTime=item.created_at;date.textContent=formatDate(item.created_at);const question=document.createElement("h3");question.textContent=item.question||"คำอ่านไพ่";meta.append(date,question);
    const selector=document.createElement("select");selector.className="collection-select";selector.setAttribute("aria-label","เปลี่ยนหมวดคำอ่าน");Object.entries(categories).forEach(([value,label])=>{const option=document.createElement("option");option.value=value;option.textContent=label;option.selected=value===item.category;selector.append(option)});selector.addEventListener("change",()=>updateCategory(item.id,selector.value,selector));
    top.append(meta,selector);
    const cards=document.createElement("p");cards.className="timeline-cards";cards.textContent=(item.cards||[]).map(card=>card.name).join(" · ");
    const preview=document.createElement("p");preview.className="timeline-preview";preview.textContent=item.preview||"";
    const actions=document.createElement("div");actions.className="timeline-actions";const remove=document.createElement("button");remove.type="button";remove.className="text-button danger";remove.textContent="ลบจากไทม์ไลน์";remove.addEventListener("click",()=>deleteItem(item.id,article));actions.append(remove);
    const detail=document.createElement('details'),summary=document.createElement('summary'),full=document.createElement('div');summary.textContent='อ่านคำทำนายฉบับเต็ม';detail.append(summary,full);let detailLoading=false,detailLoaded=false;
    detail.addEventListener('toggle',async()=>{if(!detail.open||detailLoading||detailLoaded)return;detailLoading=true;full.textContent='กำลังโหลด…';try{const response=await api(`/api/member/history/${encodeURIComponent(item.id)}`),data=await response.json();if(!response.ok)throw new Error(data?.error?.message||'โหลดคำอ่านไม่สำเร็จ');const r=data.item?.reading;if(!r)throw new Error('ไม่พบคำอ่านฉบับเต็ม');full.replaceChildren();const section=(title,text)=>{if(!text)return;const h=document.createElement('h4'),p=document.createElement('p');h.textContent=title;p.textContent=text;p.style.whiteSpace='pre-line';full.append(h,p)};section(r.readingTitle||'ภาพรวม',r.overallReading||r.summary);(r.cards||[]).forEach(card=>section(card.cardName,card.interpretation));(r.patterns||[]).forEach(pattern=>section(pattern.title,pattern.description));section('แนวทาง',(r.guidance||[]).join('\n'));section('คำถามสำหรับคิดต่อ',r.reflectionQuestion);detailLoaded=true}catch(error){full.textContent=error.message+' · ปิดแล้วเปิดอีกครั้งเพื่อลองใหม่'}finally{detailLoading=false}});
    const journal=journalEditor(item.id);article.append(top,cards,preview,detail,journal,actions);list.append(article);
  }

  function journalEditor(id){const details=document.createElement('details'),summary=document.createElement('summary'),box=document.createElement('div');details.className='journal-editor';summary.textContent='บันทึกส่วนตัว';box.className='journal-editor-body';details.append(summary,box);let loaded=false;details.addEventListener('toggle',async()=>{if(!details.open||loaded)return;box.textContent='กำลังโหลดบันทึก…';try{const response=await api(`/api/member/reflections/${encodeURIComponent(id)}`),data=await response.json();if(!response.ok)throw new Error(data?.error?.message||'โหลดบันทึกไม่สำเร็จ');buildJournalForm(box,id,data.reflection||{});loaded=true}catch(error){box.textContent=error.message}});return details}
  function buildJournalForm(box,id,value){box.replaceChildren();const moodSelect=(label,current)=>{const wrap=document.createElement('label'),select=document.createElement('select');wrap.append(document.createTextNode(label));[['','ไม่ระบุ'],['calm','สงบ'],['hopeful','มีความหวัง'],['uncertain','ยังไม่แน่ใจ'],['heavy','หนักใจ'],['curious','อยากรู้']].forEach(([key,text])=>{const option=document.createElement('option');option.value=key;option.textContent=text;option.selected=key===current;select.append(option)});wrap.append(select);return {wrap,select}};const before=moodSelect('ก่อนเปิดไพ่',value.mood_before||value.moodBefore||''),after=moodSelect('หลังอ่าน',value.mood_after||value.moodAfter||''),noteLabel=document.createElement('label'),note=document.createElement('textarea');noteLabel.append(document.createTextNode('บันทึก'));note.rows=4;note.maxLength=1000;note.value=value.note||'';noteLabel.append(note);const controls=document.createElement('div'),save=document.createElement('button'),remove=document.createElement('button'),message=document.createElement('p');controls.className='journal-controls';save.type='button';save.textContent='บันทึก';remove.type='button';remove.className='text-button danger';remove.textContent='ลบบันทึก';remove.hidden=!value.note&&!value.mood_before&&!value.mood_after;message.setAttribute('role','status');save.addEventListener('click',async()=>{save.disabled=true;try{const response=await api(`/api/member/reflections/${encodeURIComponent(id)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({note:note.value,moodBefore:before.select.value,moodAfter:after.select.value})}),data=await response.json();if(!response.ok)throw new Error(data?.error?.message||'บันทึกไม่สำเร็จ');message.textContent='บันทึกแล้ว';remove.hidden=false;await loadWeekly(false)}catch(error){message.textContent=error.message}finally{save.disabled=false}});remove.addEventListener('click',async()=>{if(!confirm('ลบบันทึกส่วนตัวนี้หรือไม่?'))return;remove.disabled=true;try{const response=await api(`/api/member/reflections/${encodeURIComponent(id)}`,{method:'DELETE'});if(!response.ok)throw new Error('ลบบันทึกไม่สำเร็จ');note.value='';before.select.value='';after.select.value='';remove.hidden=true;message.textContent='ลบบันทึกแล้ว';await loadWeekly(false)}catch(error){message.textContent=error.message}finally{remove.disabled=false}});controls.append(save,remove,message);box.append(before.wrap,after.wrap,noteLabel,controls)}

  async function updateCategory(id,value,select){
    select.disabled=true;
    try{const response=await api(`/api/member/history/${encodeURIComponent(id)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({category:value})});const data=await response.json().catch(()=>null);if(!response.ok)throw new Error(data?.error?.message||"เปลี่ยนหมวดไม่สำเร็จ");if(category.value&&category.value!==value)await loadTimeline();status.textContent=`ย้ายไปหมวด ${categories[value]} แล้ว`;}
    catch(error){status.textContent=error?.message||"เปลี่ยนหมวดไม่สำเร็จ";await loadTimeline();}
    finally{select.disabled=false;}
  }

  async function deleteItem(id,node){
    if(!confirm("ลบคำอ่านนี้ออกจากไทม์ไลน์หรือไม่? การลบไม่สามารถย้อนกลับได้"))return;
    try{const response=await api(`/api/member/history/${encodeURIComponent(id)}`,{method:"DELETE"});const data=await response.json().catch(()=>null);if(!response.ok)throw new Error(data?.error?.message||"ลบคำอ่านไม่สำเร็จ");node.remove();status.textContent="ลบคำอ่านออกจากไทม์ไลน์แล้ว";await loadInsights();}
    catch(error){status.textContent=error?.message||"ลบคำอ่านไม่สำเร็จ";}
  }

  function renderSignedOut(){
    status.textContent="ลงชื่อใช้งานเพื่อดู Tarot Timeline ของคุณ";list.replaceChildren();const button=document.createElement("button");button.type="button";button.className="primary";button.textContent="ลงชื่อใช้งาน";button.addEventListener("click",()=>location.assign(`${API}/auth/login?returnTo=${encodeURIComponent(location.href)}`));list.append(button);recurringSection.hidden=true;
  }

  function formatDate(value){try{return new Intl.DateTimeFormat("th-TH",{timeZone:"Asia/Bangkok",dateStyle:"medium",timeStyle:"short"}).format(new Date(`${value}Z`))}catch{return value||""}}
})();
