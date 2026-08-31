(() => {
  const $=id=>document.getElementById(id),periods=["weekly","monthly","yearly"],labels={weekly:"รายสัปดาห์",monthly:"รายเดือน",yearly:"รายปี"};
  let plans=[],member=null;

  addEventListener("DOMContentLoaded",()=>{
    document.querySelectorAll('input[name="paymentType"]').forEach(input=>input.addEventListener("change",renderPlans));
    initPaymentTabs();
    $("portalButton").addEventListener("click",accountAction);
    load();
  });

  function initPaymentTabs(){
    const group=document.querySelector('.payment-choice-grid');
    if(!group||group.dataset.tabsReady==='true')return;
    const choices=[...group.querySelectorAll('.payment-choice')];
    if(choices.length<2)return;
    group.dataset.tabsReady='true';
    group.classList.add('payment-choice-details');

    const tabs=document.createElement('div');
    tabs.className='t-tabs payment-type-tabs';
    tabs.setAttribute('role','tablist');
    tabs.setAttribute('aria-label','เลือกรูปแบบการชำระเงิน');
    const pill=document.createElement('span');
    pill.className='t-tabs-pill';
    pill.setAttribute('aria-hidden','true');
    tabs.append(pill);

    const buttons=choices.map((choice,index)=>{
      const input=choice.querySelector('input[name="paymentType"]');
      const label=choice.querySelector('strong')?.textContent?.trim()||`ตัวเลือก ${index+1}`;
      const button=document.createElement('button');
      button.type='button';
      button.className='t-tab';
      button.setAttribute('role','tab');
      button.dataset.value=input?.value||'';
      button.textContent=label;
      tabs.append(button);
      button.addEventListener('click',()=>select(button,true));
      button.addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
        event.preventDefault();
        let next=index;
        if(event.key==='ArrowLeft')next=(index-1+buttons.length)%buttons.length;
        if(event.key==='ArrowRight')next=(index+1)%buttons.length;
        if(event.key==='Home')next=0;
        if(event.key==='End')next=buttons.length-1;
        buttons[next].focus();
        select(buttons[next],true);
      });
      input?.addEventListener('change',()=>{if(input.checked)select(button,false)});
      return button;
    });

    group.before(tabs);

    function placePill(button,animate=true){
      if(!button)return;
      const write=()=>{
        pill.style.transform=`translateX(${button.offsetLeft}px)`;
        pill.style.width=`${button.offsetWidth}px`;
      };
      if(animate){write();return;}
      const transition=pill.style.transition;
      pill.style.transition='none';
      write();
      void pill.offsetWidth;
      pill.style.transition=transition;
    }

    function select(button,emit){
      const value=button?.dataset.value;
      const input=choices.map(choice=>choice.querySelector('input[name="paymentType"]')).find(item=>item?.value===value);
      buttons.forEach(item=>item.setAttribute('aria-selected',String(item===button)));
      choices.forEach(choice=>choice.classList.toggle('is-active',choice.querySelector('input[name="paymentType"]')?.value===value));
      placePill(button,true);
      if(input&&!input.checked){input.checked=true;if(emit)input.dispatchEvent(new Event('change',{bubbles:true}));}
    }

    const initialInput=group.querySelector('input[name="paymentType"]:checked')||group.querySelector('input[name="paymentType"]');
    const initialButton=buttons.find(button=>button.dataset.value===initialInput?.value)||buttons[0];
    buttons.forEach(item=>item.setAttribute('aria-selected',String(item===initialButton)));
    choices.forEach(choice=>choice.classList.toggle('is-active',choice.querySelector('input[name="paymentType"]')?.value===initialButton?.dataset.value));
    requestAnimationFrame(()=>placePill(initialButton,false));
    if('ResizeObserver'in window)new ResizeObserver(()=>placePill(buttons.find(item=>item.getAttribute('aria-selected')==='true'),false)).observe(tabs);
    else addEventListener('resize',()=>placePill(buttons.find(item=>item.getAttribute('aria-selected')==='true'),false));
  }

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
  function accountAction(){if(!member?.success){location.assign(`https://api.sorasukt.com/auth/login?returnTo=${encodeURIComponent(location.href)}`);return}location.assign(member?.membership?.paymentType==="subscription"?"../me/?openBilling=1":"../me/")}
  function billingApi(path,body){return window.TarotPortal.api(path,{method:"POST",headers:policyHeaders(),body:JSON.stringify(body),timeout:20000})}
  function policyHeaders(){return {"Content-Type":"application/json","X-Tarot-Policy-Version":window.TarotPortal.policyVersion}}
  function formatMoney(amount,currency){if(!Number.isFinite(amount)||!currency)return "—";return new Intl.NumberFormat("th-TH",{style:"currency",currency:currency.toUpperCase(),maximumFractionDigits:2}).format(amount/100)}
  function formatDate(value){try{return new Intl.DateTimeFormat("th-TH",{dateStyle:"long",timeZone:"Asia/Bangkok"}).format(new Date(value))}catch{return value}}
})();
