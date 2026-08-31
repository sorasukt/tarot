(()=>{
  const API="https://api.sorasukt.com";
  document.addEventListener("DOMContentLoaded",()=>{
    document.querySelector('[data-view="codes"]')?.addEventListener("click",loadCodes);
    document.querySelector('[data-jump="codes"]')?.addEventListener("click",loadCodes);
    document.querySelector('[data-refresh="codes"]')?.addEventListener("click",loadCodes);
    document.getElementById("codeForm")?.addEventListener("submit",createCode);
  });

  async function loadCodes(){
    const body=document.getElementById("codesBody");
    if(!body)return;
    body.innerHTML='<tr><td colspan="6" class="empty">กำลังดึงโค้ดจาก Stripe…</td></tr>';
    try{
      const {codes=[]}=await api("/api/admin/redeem-codes?source=stripe&limit=100");
      body.innerHTML=codes.length?codes.map(row).join(""):'<tr><td colspan="6" class="empty">ยังไม่มี Promotion Code ใน Stripe</td></tr>';
      body.querySelectorAll("[data-copy-code]").forEach(button=>button.addEventListener("click",()=>copy(button.dataset.copyCode,"คัดลอกโค้ดแล้ว")));
      body.querySelectorAll("[data-copy-link]").forEach(button=>button.addEventListener("click",()=>copy(button.dataset.copyLink,"คัดลอกลิงก์แล้ว")));
    }catch(error){
      body.innerHTML=`<tr><td colspan="6" class="empty">${esc(error.message||"ดึงข้อมูลจาก Stripe ไม่สำเร็จ")}</td></tr>`;
      notice(error.message||"ดึงข้อมูลจาก Stripe ไม่สำเร็จ",true);
    }
  }

  async function createCode(event){
    event.preventDefault();
    const form=event.currentTarget,button=form.querySelector('button[type="submit"]');
    const values=Object.fromEntries(new FormData(form).entries());
    const payload={source:"stripe",plan:values.plan,code:String(values.code||"").trim(),note:String(values.note||"").trim()};
    if(values.expiresAt)payload.expiresAt=new Date(values.expiresAt).toISOString();
    button.disabled=true;button.textContent="กำลังสร้าง…";
    try{
      const {redeem}=await api("/api/admin/redeem-codes",{method:"POST",body:JSON.stringify(payload)});
      const root=document.getElementById("createdCode");
      root.classList.remove("hidden");
      root.innerHTML=`<strong>${esc(redeem.code)}</strong><span>${esc(planLabel(redeem.plan))}</span><div><button type="button" data-created-copy-code>คัดลอกโค้ด</button><button type="button" class="primary" data-created-copy-link>คัดลอกลิงก์</button></div><small>${esc(redeem.redeemUrl)}</small>`;
      root.querySelector("[data-created-copy-code]").addEventListener("click",()=>copy(redeem.code,"คัดลอกโค้ดแล้ว"));
      root.querySelector("[data-created-copy-link]").addEventListener("click",()=>copy(redeem.redeemUrl,"คัดลอกลิงก์แล้ว"));
      form.reset();
      notice("สร้าง Redeem Code ใน Stripe แล้ว");
      await loadCodes();
    }catch(error){notice(error.message||"สร้างโค้ดไม่สำเร็จ",true)}
    finally{button.disabled=false;button.textContent="สร้างใน Stripe"}
  }

  function row(code){
    const link=code.redeemUrl||"";
    const actions=`<div class="code-actions"><button type="button" data-copy-code="${attr(code.code)}">คัดลอกโค้ด</button>${link?`<button type="button" class="primary" data-copy-link="${attr(link)}">คัดลอกลิงก์</button>`:'<span class="muted">ต้องมี plan ใน metadata</span>'}</div>`;
    return `<tr><td><strong class="code-value">${esc(code.code||"-")}</strong></td><td>${esc(planLabel(code.plan_period))}</td><td><span class="badge ${esc(code.status||"")}">${esc(code.status||"-")}</span></td><td>${Number(code.times_redeemed||0)}${code.max_redemptions!=null?` / ${Number(code.max_redemptions)}`:""}</td><td>${date(code.expires_at)}</td><td>${actions}</td></tr>`;
  }

  async function api(path,options={}){
    const response=await fetch(API+path,{credentials:"include",headers:{"Content-Type":"application/json",...(options.headers||{})},...options});
    let data={};try{data=await response.json()}catch{}
    if(!response.ok){const error=new Error(data?.error?.message||`Request failed (${response.status})`);error.status=response.status;throw error}
    return data;
  }
  async function copy(value,message){
    try{await navigator.clipboard.writeText(value);notice(message)}
    catch{const area=document.createElement("textarea");area.value=value;area.style.position="fixed";area.style.opacity="0";document.body.appendChild(area);area.select();document.execCommand("copy");area.remove();notice(message)}
  }
  function notice(message,error=false){const el=document.getElementById("notice");if(!el)return;el.textContent=message;el.classList.remove("hidden");el.classList.toggle("error",error);setTimeout(()=>el.classList.add("hidden"),4000)}
  function planLabel(value){return ({weekly:"Weekly",monthly:"Monthly",yearly:"Yearly"})[value]||"ไม่ระบุ"}
  function date(value){if(!value)return"-";const d=new Date(value);return Number.isNaN(d.getTime())?esc(value):d.toLocaleString("th-TH",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Bangkok"})}
  function esc(value){return String(value??"").replace(/[&<>'"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]))}
  function attr(value){return esc(value).replace(/`/g,"&#96;")}
})();
