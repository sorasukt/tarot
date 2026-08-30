(() => {
  const $=id=>document.getElementById(id);
  let authenticated=false;

  async function load(){
    const status=$("memberStatus"), shell=$("dailyMember"), guest=$("dailyGuest");
    closeBirthModal();
    try{
      const member=await window.TarotPortal.getMember();
      authenticated=Boolean(member?.success);
      if(!authenticated){ shell.hidden=true; guest.hidden=false; closeBirthModal(); return; }
      shell.hidden=false; guest.hidden=true;
      const profile=member.profile;
      if(profile?.birth_date){
        $("quickBirthDate").value=profile.birth_date;
        $("modalBirthDate").value=profile.birth_date;
        $("modalBirthTime").value=profile.birth_time||"";
      }
      if(!profile){ openBirthModal(); status.textContent="เพิ่มวันเดือนปีเกิดเพื่อเริ่มดวงประจำวันของคุณ"; return; }

      closeBirthModal();
      await loadDaily();
    }catch(e){ closeBirthModal(); status.textContent="เชื่อมต่อดวงประจำวันไม่สำเร็จ กรุณาลองอีกครั้ง"; }
  }

  async function loadDaily(){
    const status=$("memberStatus");
    status.dataset.loading="true";status.setAttribute("role","status");status.setAttribute("aria-live","polite");status.textContent="กำลังเตรียมข้อความประจำวันของคุณ…";
    let r=await window.TarotPortal.ai("daily","/api/member/daily");
    for(let attempt=0;r.status===202&&attempt<20;attempt+=1){
      status.textContent="กำลังจัดทำข้อความประจำวันของคุณ…";
      await new Promise(resolve=>setTimeout(resolve,2000));
      r=await window.TarotPortal.ai("daily","/api/member/daily");
    }
    const data=await r.json();
    delete status.dataset.loading;
    if(r.status===409&&data?.error?.code==="PROFILE_REQUIRED"){ if(authenticated)openBirthModal(); return; }
    if(!r.ok){ window.TarotPortal.renderError(status,window.TarotPortal.apiError(data,"ไม่สามารถโหลดดวงวันนี้ได้")); return; }
    $("dailyDate").textContent=data.date||"";
    $("dailyCard").textContent=data.card?.name||"";
    $("dailyTitle").textContent=data.horoscope?.title||"ดวงของคุณวันนี้";
    $("dailySummary").textContent=data.horoscope?.summary||"";
    $("dailyEnergy").textContent=data.horoscope?.energy||"";
    $("dailyFocus").textContent=data.horoscope?.focus||"";
    $("dailyAvoid").textContent=data.horoscope?.avoid||"";
    $("dailyAdvice").textContent=data.horoscope?.advice||"";
    const colorHex=/^#[0-9A-Fa-f]{6}$/.test(data.horoscope?.luckyColorHex||"")?data.horoscope.luckyColorHex:"#d8d2c4";
    $("dailyLuckyColor").textContent=data.horoscope?.luckyColor||"สีสำหรับวันนี้";
    $("dailyLuckySwatch").style.backgroundColor=colorHex;
    $("dailyLuckyMeaning").textContent=data.horoscope?.luckyColorMeaning||"";
    $("dailyLuckyUse").textContent=data.horoscope?.luckyColorUse||"";
    $("dailyContent").hidden=false; status.textContent="";
  }

  function openBirthModal(){
    if(!authenticated)return;
    const modal=$("birthModal");
    modal.hidden=false;
    document.body.classList.add("modal-open");
    requestAnimationFrame(()=>$("modalBirthDate").focus());
  }
  function closeBirthModal(){
    const modal=$("birthModal");
    if(!modal)return;
    modal.hidden=true;
    document.body.classList.remove("modal-open");
  }

  async function saveBirth(event){
    event.preventDefault();
    if(!authenticated){ closeBirthModal(); return; }
    const status=$("modalStatus"), button=$("modalSave");
    const birthDate=$("modalBirthDate").value, birthTime=$("modalBirthTime").value;
    if(!birthDate){status.textContent="กรุณาระบุวันเดือนปีเกิด";return;}
    button.disabled=true; status.textContent="กำลังบันทึก…";
    try{
      const r=await window.TarotPortal.api("/api/member/profile",{method:"POST",headers:{"Content-Type":"text/plain;charset=UTF-8"},body:JSON.stringify({birthDate,birthTime})});
      const data=await r.json(); if(!r.ok)throw new Error(data?.error?.message||"บันทึกข้อมูลไม่สำเร็จ");
      window.TarotPortal.clearMemberCache();
      $("quickBirthDate").value=birthDate;
      closeBirthModal(); $("memberStatus").textContent=""; await loadDaily();
    }catch(e){status.textContent=e?.message||"บันทึกข้อมูลไม่สำเร็จ";}finally{button.disabled=false;}
  }

  function quickCalculate(event){
    event.preventDefault();
    const date=$("quickBirthDate").value;
    if(!date)return;
    const d=new Date(`${date}T00:00:00`), zodiac=getZodiac(d.getDate(),d.getMonth()+1), lifePath=reduceNumber(date.replaceAll("-",""));
    $("quickResult").hidden=false;
    $("quickResult").innerHTML=`<h3>${zodiac.name} · เลขเส้นทางชีวิต ${lifePath}</h3><p>${zodiac.copy}</p><p>เลข ${lifePath} ใช้เป็นมุมมองเชิงสัญลักษณ์เกี่ยวกับแนวโน้ม วิธีคิด และสิ่งที่คุณอาจให้ความสำคัญ</p><button class="deep-button" id="deepResultButton" type="button">ดูรายละเอียดเชิงลึก</button>`;
    $("deepResultButton").onclick=()=>{
      if(authenticated) location.assign("./astrology/");
      else location.assign(`https://api.sorasukt.com/auth/login?returnTo=${encodeURIComponent(location.origin+"/tarot/astrology/")}`);
    };
  }

  function reduceNumber(value){let n=[...value].reduce((s,x)=>s+Number(x||0),0);while(n>9&&![11,22,33].includes(n))n=[...String(n)].reduce((s,x)=>s+Number(x),0);return n;}
  function getZodiac(day,month){
    const list=[[[1,20],[2,18],"กุมภ์","มักเชื่อมโยงกับความคิดอิสระ การมองสิ่งต่าง ๆ ในมุมใหม่ และความเป็นตัวของตัวเอง"],[[2,19],[3,20],"มีน","มักเชื่อมโยงกับความละเอียดอ่อน จินตนาการ และการรับรู้อารมณ์รอบตัว"],[[3,21],[4,19],"เมษ","มักเชื่อมโยงกับการเริ่มต้น ความกล้า และแรงผลักดันในการลงมือทำ"],[[4,20],[5,20],"พฤษภ","มักเชื่อมโยงกับความมั่นคง ความสม่ำเสมอ และคุณค่าที่จับต้องได้"],[[5,21],[6,20],"เมถุน","มักเชื่อมโยงกับการสื่อสาร ความอยากรู้อยากเห็น และการปรับตัว"],[[6,21],[7,22],"กรกฎ","มักเชื่อมโยงกับความผูกพัน ความรู้สึกปลอดภัย และการดูแลคนรอบตัว"],[[7,23],[8,22],"สิงห์","มักเชื่อมโยงกับการแสดงออก ความมั่นใจ และความสร้างสรรค์"],[[8,23],[9,22],"กันย์","มักเชื่อมโยงกับความละเอียด การจัดระบบ และการพัฒนาสิ่งต่าง ๆ ให้ดีขึ้น"],[[9,23],[10,22],"ตุล","มักเชื่อมโยงกับสมดุล ความสัมพันธ์ และการมองหลายด้านก่อนตัดสินใจ"],[[10,23],[11,21],"พิจิก","มักเชื่อมโยงกับความลึกซึ้ง การเปลี่ยนแปลง และความจริงใจต่อความรู้สึก"],[[11,22],[12,21],"ธนู","มักเชื่อมโยงกับการค้นหา การเรียนรู้ และการมองภาพที่กว้างขึ้น"],[[12,22],[1,19],"มังกร","มักเชื่อมโยงกับเป้าหมาย ความรับผิดชอบ และการค่อย ๆ สร้างสิ่งที่ยั่งยืน"]];
    for(const [start,end,name,copy] of list){if((month===start[0]&&day>=start[1])||(month===end[0]&&day<=end[1]))return{name,copy};}
    return{name:"—",copy:""};
  }

  addEventListener("DOMContentLoaded",()=>{
    closeBirthModal();
    $("birthModalForm").addEventListener("submit",saveBirth);
    $("modalLater").addEventListener("click",event=>{event.preventDefault();closeBirthModal();});
    $("quickBirthForm").addEventListener("submit",quickCalculate);
    load();
  });
})();
