(() => {
  const $=selector=>document.querySelector(selector);

  async function hydrateFromMember(){
    try{const member=await window.TarotPortal.getMember();if(member?.profile?.birth_date&&!$('#astroBirthDate').value)$('#astroBirthDate').value=member.profile.birth_date;if(member?.profile?.birth_time&&!$('#astroBirthTime').value)$('#astroBirthTime').value=member.profile.birth_time;}catch{}
  }

  $('#astroForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const birthDate=$('#astroBirthDate').value,birthTime=$('#astroBirthTime').value;
    const form=$('#astroForm'),button=form.querySelector('button[type="submit"]'),box=$('#astroResult');
    if(!birthDate)return;
    window.TarotPortal.setButtonBusy(button,true,'กำลังเตรียม…');
    window.TarotPortal.setLoading(box,'กำลังเตรียมภาพรวมของคุณ กรุณารอสักครู่');
    try{
      const r=await window.TarotPortal.ai('astrology','/api/fortune/astrology',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({birthDate,birthTime})});
      const d=await r.json();if(!r.ok)throw window.TarotPortal.apiError(d,'ไม่สามารถวิเคราะห์ได้');
      const x=d.result||{};
      box.innerHTML=`<h2>${escapeHtml(x.title||'ภาพรวมของคุณ')}</h2><p>${escapeHtml(x.summary||'')}</p>${(x.insights||[]).map(v=>`<p>• ${escapeHtml(v)}</p>`).join('')}<h3>คำถามสำหรับคิดต่อ</h3><p>${escapeHtml(x.reflection||'')}</p><button id="astroDeep" type="button">ดูเชิงลึกสำหรับสมาชิก</button><p class="profile-note">ใช้ภาพรวมนี้เพื่อสำรวจมุมมองและทบทวนตัวเอง ไม่ใช่การยืนยันเหตุการณ์ในอนาคต</p>`;
      $('#astroDeep').onclick=loadDeep;
    }catch(err){window.TarotPortal.renderError(box,err,{title:'ยังวิเคราะห์ไม่ได้'});}
    finally{window.TarotPortal.finishLoading(box);window.TarotPortal.setButtonBusy(button,false);box.focus({preventScroll:true});}
  });

  async function loadDeep(){
    const member=await window.TarotPortal.getMember({refresh:true});
    if(!member){location.assign(`https://api.sorasukt.com/auth/login?returnTo=${encodeURIComponent(location.href)}`);return;}
    const box=$('#astroResult');
    if(!member.completion?.readyForDaily){box.innerHTML='<h2>เพิ่มข้อมูลเกิดก่อน</h2><p>กรุณาบันทึกวันเดือนปีเกิดในหน้า “ฉัน” ก่อนเปิดการอ่านเชิงลึก</p><p><a class="deep-button" href="../me/">ไปที่หน้า ฉัน</a></p>';return;}
    window.TarotPortal.setLoading(box,'กำลังเตรียมรายละเอียดจากข้อมูลที่คุณบันทึกไว้');
    try{
      const r=await window.TarotPortal.ai('astrology','/api/member/astrology');
      const data=await r.json();
      if(r.status===409&&data?.error?.code==='PROFILE_REQUIRED'){box.innerHTML=`<h2>ต้องมีข้อมูลเกิดก่อน</h2><p>${escapeHtml(data.error.message)}</p><p><a class="deep-button" href="../me/">ไปที่หน้า ฉัน</a></p>`;return;}
      if(!r.ok)throw window.TarotPortal.apiError(data,'ไม่สามารถอ่านเชิงลึกได้');
      const x=data.reading||{};
      box.innerHTML=`<h2>${escapeHtml(x.title||'การอ่านเชิงลึก')}</h2><p>${escapeHtml(x.overview||'')}</p><h3>จุดแข็ง</h3><p>${(x.strengths||[]).map(v=>'• '+escapeHtml(v)).join('<br>')}</p><h3>พื้นที่สำหรับเติบโต</h3><p>${(x.growth||[]).map(v=>'• '+escapeHtml(v)).join('<br>')}</p><h3>ความสัมพันธ์</h3><p>${escapeHtml(x.relationships||'')}</p><h3>คำถามสำหรับคิดต่อ</h3><p>${escapeHtml(x.reflection||'')}</p><p class="profile-note">การอ่านนี้เป็นมุมมองเชิงสัญลักษณ์เพื่อการทบทวนตัวเอง</p>`;
    }catch(e){window.TarotPortal.renderError(box,e,{title:'ยังอ่านเชิงลึกไม่ได้'});}
    finally{window.TarotPortal.finishLoading(box);box.focus({preventScroll:true});}
  }
  function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  addEventListener('DOMContentLoaded',hydrateFromMember);
})();
