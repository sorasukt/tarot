(() => {
  const API="https://api.sorasukt.com";
  const form=document.getElementById("redeemForm");
  const input=document.getElementById("redeemCode");
  const button=document.getElementById("redeemButton");
  const message=document.getElementById("redeemMessage");
  const planHint=document.getElementById("planHint");
  const params=new URLSearchParams(location.search);
  const code=(params.get("code")||"").trim().toUpperCase();
  const plan=normalizePlan(params.get("plan"));

  if(code)input.value=code;
  if(plan)planHint.textContent=`แผนจากลิงก์: ${planLabel(plan)}`;

  form.addEventListener("submit",async event=>{
    event.preventDefault();
    const redeemCode=input.value.trim().toUpperCase();
    if(!redeemCode)return;
    setBusy(true,"กำลังตรวจสอบ…");
    setMessage("",false);
    try{
      const response=await fetch(`${API}/api/redeem`,{
        method:"POST",
        credentials:"include",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({code:redeemCode,plan:plan||undefined})
      });
      const data=await response.json().catch(()=>null);
      if(response.status===401){
        const returnTo=encodeURIComponent(location.href);
        location.href=`${API}/auth/login?returnTo=${returnTo}`;
        return;
      }
      if(!response.ok)throw new Error(data?.error?.message||"ไม่สามารถใช้โค้ดได้");
      setMessage(`รับสิทธิ์ ${planLabel(data.redeem?.plan)} สำเร็จ${data.redeem?.currentPeriodEnd?` • ใช้ได้ถึง ${formatDate(data.redeem.currentPeriodEnd)}`:""}`,true);
      input.disabled=true;
      button.disabled=true;
      button.textContent="ใช้โค้ดแล้ว";
    }catch(error){
      setMessage(error?.message||"ไม่สามารถใช้โค้ดได้ในขณะนี้",false);
      setBusy(false);
    }
  });

  if(code)preview(code);

  async function preview(value){
    try{
      const response=await fetch(`${API}/api/redeem?code=${encodeURIComponent(value)}`,{credentials:"include"});
      const data=await response.json().catch(()=>null);
      if(response.status===401)return;
      if(response.ok&&data?.redeem?.plan){
        const actual=data.redeem.plan;
        if(plan&&plan!==actual)setMessage("แผนในลิงก์ไม่ตรงกับโค้ดนี้ กรุณาตรวจสอบลิงก์ที่ได้รับ",false);
        else planHint.textContent=`โค้ดนี้สำหรับแผน ${planLabel(actual)}`;
      }
    }catch{}
  }

  function setBusy(busy,label){button.disabled=busy;button.textContent=busy?(label||"กำลังดำเนินการ…"):"ใช้โค้ด";input.disabled=busy}
  function setMessage(text,success){message.textContent=text;message.classList.toggle("success",Boolean(success));message.classList.toggle("error",Boolean(text)&&!success)}
  function normalizePlan(value){const raw=String(value||"").trim().toLowerCase();return ({week:"weekly",weekly:"weekly",month:"monthly",monthly:"monthly",year:"yearly",annual:"yearly",yearly:"yearly"})[raw]||""}
  function planLabel(value){return ({weekly:"รายสัปดาห์",monthly:"รายเดือน",yearly:"รายปี"})[value]||"สมาชิก"}
  function formatDate(value){try{return new Intl.DateTimeFormat("th-TH",{dateStyle:"long",timeZone:"Asia/Bangkok"}).format(new Date(value))}catch{return value}}
})();
