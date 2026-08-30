(() => {
  const $=id=>document.getElementById(id);
  const form=$("colorForm"),result=$("colorResult"),dateInput=$("colorDate");
  dateInput.value=localDate();
  hydrateMember();
  form.addEventListener("submit",async event=>{
    event.preventDefault();
    const date=dateInput.value,button=form.querySelector('button[type="submit"]');
    if(!date)return;
    window.TarotPortal.setButtonBusy(button,true,"กำลังเตรียม…");
    window.TarotPortal.setLoading(result,"กำลังเตรียมสีและความหมายสำหรับวันที่เลือก");
    try{
      const response=await window.TarotPortal.ai("colors","/api/fortune/colors",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({date})});
      const data=await response.json();
      if(!response.ok)throw window.TarotPortal.apiError(data,"ไม่สามารถดูสีมงคลได้");
      render(data.result||{},data.date||date);
    }catch(error){window.TarotPortal.renderError(result,error,{title:"ยังเตรียมสีให้ไม่ได้"})}
    finally{window.TarotPortal.finishLoading(result);window.TarotPortal.setButtonBusy(button,false);result.focus({preventScroll:true})}
  });
  async function hydrateMember(){
    try{const member=await window.TarotPortal.getMember();if(member?.success&&member.profile?.birth_date)$("colorProfileNote").textContent="ใช้ข้อมูลวันเกิดที่บันทึกไว้ประกอบผลลัพธ์สำหรับคุณแล้ว"}catch{}
  }
  function render(value,date){
    const hex=/^#[0-9A-Fa-f]{6}$/.test(value.hex||"")?value.hex:"#d8d2c4";
    result.innerHTML=`<div class="color-result-head"><div class="color-swatch-large" aria-hidden="true"></div><div><p class="color-date">${esc(formatDate(date))}</p><h2 class="color-name">${esc(value.colorName||"สีประจำวัน")}</h2><p>${esc(value.title||"")}</p></div></div><p>${esc(value.meaning||"")}</p><h3>ลองนำไปใช้</h3><ul class="color-suggestions">${(value.suggestions||[]).map(item=>`<li>${esc(item)}</li>`).join("")}</ul><h3>ชวนคิดต่อ</h3><p>${esc(value.reflection||"")}</p><p class="profile-note">ใช้เป็นมุมมองเชิงสัญลักษณ์ ไม่ใช่คำรับรองว่าเหตุการณ์จะเป็นไปตามสีที่เลือก</p>`;
    result.querySelector(".color-swatch-large").style.backgroundColor=hex;
  }
  function localDate(){const parts=new Intl.DateTimeFormat("en-CA",{year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()),values=Object.fromEntries(parts.map(part=>[part.type,part.value]));return `${values.year}-${values.month}-${values.day}`}
  function formatDate(value){try{return new Intl.DateTimeFormat("th-TH",{dateStyle:"long"}).format(new Date(`${value}T00:00:00`))}catch{return value}}
  function esc(value){return String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]))}
})();
