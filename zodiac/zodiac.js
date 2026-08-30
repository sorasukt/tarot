(() => {
  const $=id=>document.getElementById(id);
  const form=$('zodiacForm'),result=$('zodiacResult');
  hydrateMember();
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const birthDate=$('zodiacBirthDate').value;
    const button=form.querySelector('button[type="submit"]');
    if(!birthDate)return;
    window.TarotPortal.setButtonBusy(button,true,'กำลังเตรียม…');
    window.TarotPortal.setLoading(result,'กำลังเตรียมคำอ่านราศีของคุณ');
    try{
      const r=await window.TarotPortal.ai('zodiac','/api/fortune/zodiac',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({birthDate})});
      const d=await r.json();if(!r.ok)throw window.TarotPortal.apiError(d,'ไม่สามารถวิเคราะห์ราศีได้');
      render(d.result||{});
    }catch(err){window.TarotPortal.renderError(result,err,{title:'ยังวิเคราะห์ไม่ได้'});}
    finally{window.TarotPortal.finishLoading(result);window.TarotPortal.setButtonBusy(button,false);result.focus({preventScroll:true});}
  });
  function render(x){result.innerHTML=`<h2>${esc(x.title||'คำอ่านราศีของคุณ')}</h2><p>${esc(x.summary||'')}</p>${(x.insights||[]).map(v=>`<p>• ${esc(v)}</p>`).join('')}<h3>คำถามสำหรับคิดต่อ</h3><p>${esc(x.reflection||'')}</p><p class="profile-note">ใช้ผลลัพธ์นี้เป็นมุมมองประกอบการทบทวนตัวเอง ไม่ใช่ข้อสรุปตายตัวเกี่ยวกับบุคลิกหรืออนาคต</p>`;}
  async function hydrateMember(){
    try{const member=await window.TarotPortal.getMember();if(member?.profile?.birth_date&&!$('zodiacBirthDate').value)$('zodiacBirthDate').value=member.profile.birth_date;}catch{}
  }
  function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
})();
