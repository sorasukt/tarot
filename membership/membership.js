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
    if(!member?.success){$("membershipTitle").textContent="ลงชื่อใช้งานเพื่อเริ่มสมาชิกพิเศษ";$("membershipDetail").textContent="ลงชื่อเข้าใช้เพื่อสมัครและดูสิทธิ์ของคุณได้ทุกเมื่อ";$("portalButton").textContent="ลงชื่อใช้งานเพื่อสมัคร";$("portalButton").hidden=false;return}
    if(!value){$("membershipTitle").textContent="ยังไม่มีสมาชิกพิเศษ";$("membershipDetail").textContent="เลือกแผนด้านล่างเพื่อเริ่มใช้งาน";$("portalButton").hidden=true;return}
    $("membershipTitle").textContent=value.active?"Tarot for your daily กำลังใช้งาน":"สถานะสมาชิก: "+statusLabel(value.status);
    $("membershipDetail").textContent=`${labels[value.period]||"แผนสมาชิก"}${value.currentPeriodEnd?` · ใช้ได้ถึง ${formatDate(value.currentPeriodEnd)}`:""}${value.cancelAtPeriodEnd?" · จะไม่ต่ออายุ":""}`;
    $("portalButton").textContent="ดูข้อมูลสมาชิกในหน้า ฉัน";$("portalButton").hidden=false;
  }
  function renderPlans(){
    const type=document.querySelector('input[name="paymentType"]:checked')?.value||"subscription";$("planGrid").replaceChildren();
    periods.forEach(period=>{
      const plan=findPlan(period,type),card=document.createElement("article");card.className=`plan-card${period==="yearly"?" is-featured":""}`;
      const title=document.createElement("h2");title.textContent=labels[period];
      const eyebrow=document.createElement("p");eyebrow.className="eyebrow";eyebrow.textContent=period.toUpperCase();
      if(period==="yearly"){const badge=document.createElement("span");badge.className="plan-badge";badge.textContent="คุ้มที่สุด";card.append(badge)}
      const price=document.createElement("p");price.className="plan-price";price.textContent=plan?.amount&&plan.currency?formatMoney(plan.amount,plan.currency):"ยังไม่เปิดขาย";
      const comparison=document.createElement("p");comparison.className="plan-compare";comparison.textContent=comparisonText(period,type);
      const detail=document.createElement("p");detail.className="plan-detail";detail.textContent=!plan?.configured||!plan.active?"ยังไม่เปิดรับชำระ":type==="subscription"?"ต่ออายุอัตโนมัติ":"ชำระครั้งเดียว";
      const hasSubscription=type==="subscription"&&member?.membership?.paymentType==="subscription"&&member.membership.status!=="canceled";
      const button=document.createElement("button");button.type="button";button.textContent=hasSubscription?"เปลี่ยนแพ็กเกจในหน้า ฉัน":type==="subscription"?"สมัครสมาชิก":"ซื้อสิทธิ์ครั้งเดียว";button.disabled=!plan?.configured||!plan.active;button.addEventListener("click",()=>hasSubscription?location.assign("../me/?manage=membership"):checkout(period,type,button));
      card.append(eyebrow,title,price,comparison,detail,button);$("planGrid").append(card)
    });
    renderComparison();
  }
  function findPlan(period,paymentType){return plans.find(item=>item.period===period&&item.paymentType===paymentType)}
  function comparisonText(period,paymentType){const plan=findPlan(period,paymentType),weekly=findPlan("weekly",paymentType),monthly=findPlan("monthly",paymentType);if(!plan?.amount||!weekly?.amount||!monthly?.amount)return "เลือกช่วงเวลาที่เหมาะกับคุณ";if(period==="weekly")return "เหมาะกับการเริ่มต้นระยะสั้น";const saving=period==="monthly"?weekly.amount*52-monthly.amount*12:monthly.amount*12-plan.amount;return `ประหยัด ${formatMoney(saving,plan.currency)} ต่อปี เมื่อเทียบ${period==="monthly"?"แผนรายสัปดาห์":"แผนรายเดือน"}`}
  function renderComparison(){
    const body=$("priceComparisonBody");body.replaceChildren();
    const paymentType=document.querySelector('input[name="paymentType"]:checked')?.value||"subscription",ready=periods.every(period=>findPlan(period,paymentType)?.amount);$("priceComparison").hidden=!ready;if(!ready)return;
    const methodLabel=paymentType==="subscription"?"Subscription":"Pay as you go",weekly=findPlan("weekly",paymentType),monthly=findPlan("monthly",paymentType),yearly=findPlan("yearly",paymentType),weeklyAnnual=weekly.amount*52;
    $("priceComparisonTitle").textContent=`เปรียบเทียบแผน ${methodLabel}`;$("priceComparisonDescription").textContent=`เปรียบเทียบรายสัปดาห์ รายเดือน และรายปีภายใน ${methodLabel} เท่านั้น`;$("priceComparisonCaption").textContent=`เปรียบเทียบช่วงเวลาของ ${methodLabel}`;
    periods.forEach(period=>{const plan=findPlan(period,paymentType),annualCost=period==="weekly"?weeklyAnnual:period==="monthly"?plan.amount*12:plan.amount,monthlyAverage=annualCost/12,saving=weeklyAnnual-annualCost,row=document.createElement("tr");[labels[period],formatMoney(plan.amount,plan.currency),formatMoney(monthlyAverage,plan.currency),saving>0?formatMoney(saving,plan.currency):"—"].forEach((value,index)=>{const cell=document.createElement(index===0?"th":"td");if(index===0)cell.scope="row";cell.textContent=value;row.append(cell)});body.append(row)});
    const annualSaving=monthly.amount*12-yearly.amount;$("yearlySaving").textContent=`${methodLabel} รายปีเฉลี่ย ${formatMoney(yearly.amount/12,yearly.currency)} ต่อเดือน และประหยัด ${formatMoney(annualSaving,yearly.currency)} ต่อปี เมื่อเทียบกับแผนรายเดือนของวิธีเดียวกัน`;
  }
  async function checkout(period,paymentType,button){
    if(!member?.success){location.assign(`https://api.sorasukt.com/auth/login?returnTo=${encodeURIComponent(location.href)}`);return}
    window.TarotPortal.setButtonBusy(button,true,"กำลังเปิดหน้าชำระเงิน…");$("billingMessage").textContent="กำลังพาคุณไปยังหน้าชำระเงินที่ปลอดภัย";
    try{const response=await billingApi("/api/billing/checkout/membership",{period,paymentType,requestId:crypto.randomUUID()}),data=await response.json();if(!response.ok)throw window.TarotPortal.apiError(data,"เริ่มชำระเงินไม่สำเร็จ");if(!/^https:\/\/checkout\.stripe\.com\//.test(data.url||""))throw new Error("ลิงก์ชำระเงินไม่ถูกต้อง");location.assign(data.url)}catch(error){if(error?.code==="MANAGE_EXISTING_SUBSCRIPTION"){location.assign("../me/?manage=membership");return}window.TarotPortal.renderError($("billingMessage"),error);window.TarotPortal.setButtonBusy(button,false)}
  }
  function accountAction(){if(!member?.success){location.assign(`https://api.sorasukt.com/auth/login?returnTo=${encodeURIComponent(location.href)}`);return}location.assign("../me/")}
  function billingApi(path,body){return window.TarotPortal.api(path,{method:"POST",headers:policyHeaders(),body:JSON.stringify(body),timeout:20000})}
  function policyHeaders(){return {"Content-Type":"application/json","X-Tarot-Policy-Version":window.TarotPortal.policyVersion}}
  function formatMoney(amount,currency){if(!Number.isFinite(amount)||!currency)return "—";return new Intl.NumberFormat("th-TH",{style:"currency",currency:currency.toUpperCase(),maximumFractionDigits:2}).format(amount/100)}
  function formatDate(value){try{return new Intl.DateTimeFormat("th-TH",{dateStyle:"long",timeZone:"Asia/Bangkok"}).format(new Date(value))}catch{return value}}
  function statusLabel(value){return ({active:"กำลังใช้งาน",trialing:"ช่วงทดลอง",past_due:"รอการชำระ",canceled:"ยกเลิกแล้ว",unpaid:"ยังไม่ชำระ",incomplete:"ยังไม่สมบูรณ์"})[value]||"ยังไม่ใช้งาน"}
})();
