(() => {
  const $=id=>document.getElementById(id),periods=["weekly","monthly","yearly"],labels={weekly:"รายสัปดาห์",monthly:"รายเดือน",yearly:"รายปี"};
  let plans=[],member=null;
  addEventListener("DOMContentLoaded",()=>{document.querySelectorAll('input[name="paymentType"]').forEach(input=>input.addEventListener("change",renderPlans));$("portalButton").addEventListener("click",accountAction);load()});
  async function load(){
    member=await window.TarotPortal.getMember();renderStatus(member?.membership||null);
    try{const response=await window.TarotPortal.api("/api/billing/plans",{timeout:15000}),data=await response.json();if(!response.ok)throw window.TarotPortal.apiError(data,"โหลดราคาไม่สำเร็จ");plans=data.plans||[];renderPlans()}catch(error){window.TarotPortal.renderError($("planGrid"),error,{title:"ยังโหลดแผนไม่ได้"})}
    if(new URLSearchParams(location.search).has("canceled"))$("billingMessage").textContent="ยังไม่มีการเรียกเก็บเงิน คุณสามารถเลือกแผนใหม่เมื่อพร้อม";
  }
  function renderStatus(value){
    if(!member?.success){$("membershipTitle").textContent="ลงชื่อใช้งานเพื่อเริ่มสมาชิกพิเศษ";$("membershipDetail").textContent="บัญชีฟรีเปิดไพ่ได้ 5 ครั้งต่อวัน และลองดวงดาวเชิงลึกได้ 1 ครั้งต่อวัน";$("portalButton").textContent="ลงชื่อใช้งาน";$("portalButton").hidden=false;return}
    if(!value?.active){$("membershipTitle").textContent="บัญชีฟรีของคุณพร้อมใช้งาน";$("membershipDetail").textContent="เปิดไพ่ได้ 5 ครั้งต่อวัน · ดวงดาวเชิงลึก 1 ครั้งต่อวัน · อัปเกรดเพื่อเสียงอ่านไพ่และลิมิตที่สูงขึ้น";$("portalButton").textContent="ดูข้อมูลสมาชิกในหน้า ฉัน";$("portalButton").hidden=false;return}
    const annual=value.period==="yearly";
    $("membershipTitle").textContent=annual?"สมาชิก Annual กำลังใช้งาน":"Tarot for your daily กำลังใช้งาน";
    $("membershipDetail").textContent=`${annual?"เปิดไพ่ 60 ครั้ง/วัน · เสียงอ่านไพ่ 40 ครั้ง/วัน · ดวงดาวเชิงลึก 20 ครั้ง/วัน · สิทธิ์ Annual Boost":"เปิดไพ่ 30 ครั้ง/วัน · เสียงอ่านไพ่ 20 ครั้ง/วัน · ดวงดาวเชิงลึก 10 ครั้ง/วัน"}${value.currentPeriodEnd?` · ใช้ได้ถึง ${formatDate(value.currentPeriodEnd)}`:""}${value.cancelAtPeriodEnd?" · จะไม่ต่ออายุ":""}`;
    $("portalButton").textContent=value.paymentType==="subscription"?"จัดการการชำระเงิน":"ดูข้อมูลสมาชิกในหน้า ฉัน";$("portalButton").hidden=false;
  }
  function renderPlans(){
    const type=document.querySelector('input[name="paymentType"]:checked')?.value||"subscription";$("planGrid").replaceChildren();
    periods.forEach(period=>{
      const plan=findPlan(period,type),card=document.createElement("article");card.className=`plan-card${period==="yearly"?" is-featured":""}`;
      const title=document.createElement("h2");title.textContent=labels[period];
      const eyebrow=document.createElement("p");eyebrow.className="eyebrow";eyebrow.textContent=period.toUpperCase();
      if(period==="yearly"){const badge=document.createElement("span");badge.className="plan-badge";badge.textContent="Annual Boost";card.append(badge)}
      const price=document.createElement("p");price.className="plan-price";price.textContent=plan?.amount&&plan.currency?formatMoney(plan.amount,plan.currency):"ยังไม่เปิดขาย";
      const comparison=document.createElement("p");comparison.className="plan-compare";comparison.textContent=planMessage(period,type);
      const detail=document.createElement("p");detail.className="plan-detail";detail.textContent=!plan?.configured||!plan.active?"ยังไม่เปิดรับชำระ":period==="yearly"?"ลิมิตสูงสุดสำหรับสมาชิก · ใช้สิทธิ์ตลอดปี":type==="subscription"?"ต่ออายุอัตโนมัติ":"ชำระครั้งเดียว · ไม่ต่ออายุ";
      const hasSubscription=type==="subscription"&&member?.membership?.paymentType==="subscription"&&member.membership.status!=="canceled";
      const button=document.createElement("button");button.type="button";button.textContent=hasSubscription?"เปลี่ยนแพ็กเกจในหน้า ฉัน":type==="subscription"?"สมัครสมาชิก":"ซื้อสิทธิ์ครั้งเดียว";button.disabled=!plan?.configured||!plan.active;button.addEventListener("click",()=>hasSubscription?location.assign("../me/?manage=membership"):checkout(period,type,button));
      card.append(eyebrow,title,price,comparison,detail,button);$("planGrid").append(card)
    });
  }
  function findPlan(period,paymentType){return plans.find(item=>item.period===period&&item.paymentType===paymentType)}
  function planMessage(period,paymentType){
    if(period==="weekly")return paymentType==="subscription"?"เริ่มต้นง่าย เหมาะกับการลองใช้สิทธิ์สมาชิก":"ใช้สิทธิ์เต็ม 7 วันโดยไม่ต่ออายุ";
    if(period==="monthly")return "30 ไพ่/วัน · 20 เสียง/วัน · ดวงดาว 10 ครั้ง/วัน";
    return "Annual Boost: 60 ไพ่/วัน · 40 เสียง/วัน · ดวงดาว 20 ครั้ง/วัน";
  }
  async function checkout(period,paymentType,button){
    if(!member?.success){location.assign(`https://api.sorasukt.com/auth/login?returnTo=${encodeURIComponent(location.href)}`);return}
    window.TarotPortal.setButtonBusy(button,true,"กำลังเปิดหน้าชำระเงิน…");$("billingMessage").textContent="กำลังพาคุณไปยังหน้าชำระเงินที่ปลอดภัย";
    try{const response=await billingApi("/api/billing/checkout/membership",{period,paymentType,requestId:crypto.randomUUID()}),data=await response.json();if(!response.ok)throw window.TarotPortal.apiError(data,"เริ่มชำระเงินไม่สำเร็จ");if(!/^https:\/\/checkout\.stripe\.com\//.test(data.url||""))throw new Error("ลิงก์ชำระเงินไม่ถูกต้อง");location.assign(data.url)}catch(error){if(error?.code==="MANAGE_EXISTING_SUBSCRIPTION"){location.assign("../me/?manage=membership");return}window.TarotPortal.renderError($("billingMessage"),error);window.TarotPortal.setButtonBusy(button,false)}
  }
  async function accountAction(){
    if(!member?.success){location.assign(`https://api.sorasukt.com/auth/login?returnTo=${encodeURIComponent(location.href)}`);return}
    if(member?.membership?.paymentType!=="subscription"){location.assign("../me/");return}
    const button=$("portalButton");window.TarotPortal.setButtonBusy(button,true,"กำลังเปิด…");
    try{const response=await window.TarotPortal.api("/api/billing/portal",{method:"POST",timeout:15000}),data=await response.json();if(!response.ok)throw window.TarotPortal.apiError(data,"เปิดหน้าจัดการการชำระเงินไม่สำเร็จ");if(!/^https:\/\/billing\.stripe\.com\//.test(data.url||""))throw new Error("ลิงก์จัดการการชำระเงินไม่ถูกต้อง");location.assign(data.url)}catch(error){window.TarotPortal.renderError($("billingMessage"),error);window.TarotPortal.setButtonBusy(button,false)}
  }
  function billingApi(path,body){return window.TarotPortal.api(path,{method:"POST",headers:policyHeaders(),body:JSON.stringify(body),timeout:20000})}
  function policyHeaders(){return {"Content-Type":"application/json","X-Tarot-Policy-Version":window.TarotPortal.policyVersion}}
  function formatMoney(amount,currency){if(!Number.isFinite(amount)||!currency)return "—";return new Intl.NumberFormat("th-TH",{style:"currency",currency:currency.toUpperCase(),maximumFractionDigits:2}).format(amount/100)}
  function formatDate(value){try{return new Intl.DateTimeFormat("th-TH",{dateStyle:"long",timeZone:"Asia/Bangkok"}).format(new Date(value))}catch{return value}}
})();
