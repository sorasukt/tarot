(() => {
  const API = "https://api.sorasukt.com";
  const POLICY_VERSION = "2026-08-28-payments1";
  const POLICY_KEY = "sorasukt_tarot_policy_version";
  const ANONYMOUS_KEY = "sorasukt_tarot_anonymous_id";
  const $ = id => document.getElementById(id);
  const returnTo = window.location.href;
  let memberCache=null;
  let memberRequest=null;
  let acceptedInMemory=false;

  function ensureEnhancementStyles(){
    const styles=[['/tarot/experience.css?v=20260829-reading1','tarotExperience'],['/tarot/portal-enhancements.css?v=20260827-1322','tarotEnhancements'],['/tarot/interaction.css?v=20260827-consent1','tarotInteraction']];
    styles.forEach(([href,key])=>{const path=href.split('?')[0];if(document.querySelector(`link[href*="${path}"]`))return;const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.dataset[key]='true';document.head.append(link);});
  }

  async function api(path, options={}) {
    const {timeout=12000,...fetchOptions}=options;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeout);
    try{return await fetch(`${API}${path}`,{...fetchOptions,credentials:"include",signal:fetchOptions.signal||controller.signal});}
    finally{clearTimeout(timer);}
  }

  async function ai(feature,path,options={}){
    if(!policyAccepted()){showConsent();throw new Error("กรุณายอมรับนโยบายก่อนใช้งาน");}
    const headers=new Headers(options.headers||{});headers.set("X-Tarot-Policy-Version",POLICY_VERSION);
    const started=Date.now();void track("action_started",feature,"started");
    for(let attempt=0;attempt<2;attempt+=1){
      try{
        const response=await api(path,{...options,headers,timeout:65000});
        if(response.status===504&&attempt===0){await new Promise(resolve=>setTimeout(resolve,700));continue;}
        const data=await response.clone().json().catch(()=>null);
        void track(response.ok?"action_completed":"action_failed",feature,response.ok?(data?.cached?"cached":"completed"):"failed",Date.now()-started,{cached:Boolean(data?.cached),errorCode:data?.error?.code});
        return response;
      }catch(error){
        if(error?.name==="AbortError"&&attempt===0){await new Promise(resolve=>setTimeout(resolve,700));continue;}
        void track("action_failed",feature,"failed",Date.now()-started,{errorCode:error?.name==="AbortError"?"CLIENT_TIMEOUT":"NETWORK_ERROR"});
        throw error;
      }
    }
    throw new Error("ไม่สามารถเตรียมผลลัพธ์ได้ในขณะนี้");
  }

  function setLoading(container,label){
    if(!container)return;
    container.hidden=false;container.setAttribute("role","status");container.setAttribute("aria-live","polite");container.setAttribute("aria-busy","true");
    container.innerHTML=`<div class="result-loading"><span class="result-spinner" aria-hidden="true"></span><p>${escapeHtml(label||"กำลังเตรียมผลลัพธ์ กรุณารอสักครู่")}</p></div>`;
  }

  function finishLoading(container){if(container)container.setAttribute("aria-busy","false")}

  function setButtonBusy(button,busy,label){
    if(!button)return;
    if(busy){button.dataset.idleLabel=button.textContent;button.disabled=true;button.setAttribute("aria-busy","true");button.textContent=label||"กำลังดำเนินการ…";}
    else{button.disabled=false;button.setAttribute("aria-busy","false");button.textContent=button.dataset.idleLabel||button.textContent;delete button.dataset.idleLabel;}
  }

  function apiError(data,fallback){
    const error=new Error(data?.error?.message||fallback||"ไม่สามารถดำเนินการได้ในขณะนี้");
    error.code=data?.error?.code||"REQUEST_FAILED";
    const supportUrl=data?.error?.supportUrl;
    if(typeof supportUrl==="string"&&(/^https:\/\/([a-z0-9-]+\.)*stripe\.com\//i.test(supportUrl)||supportUrl==="https://sorasukt.com/tarot/support/"))error.supportUrl=supportUrl;
    error.supportLabel=data?.error?.supportLabel||"สนับสนุนเรา";
    return error;
  }

  function renderError(container,error,{title=""}={}){
    if(!container)return;
    container.replaceChildren();container.hidden=false;container.setAttribute("role","alert");container.setAttribute("aria-busy","false");
    if(title&&container.tagName!=="P"){const heading=document.createElement("h2");heading.textContent=title;container.append(heading);}
    const message=document.createElement(container.tagName==="P"?"span":"p");message.textContent=error?.message||"กรุณาลองใหม่อีกครั้ง";container.append(message);
    if(error?.supportUrl){const separator=document.createElement("br");const link=document.createElement("a");link.className="support-button";link.href=error.supportUrl;link.target="_blank";link.rel="noopener noreferrer";link.textContent=error.supportLabel||"สนับสนุนเรา";container.append(separator,link);}
  }

  async function getMember({refresh=false}={}){
    if(memberCache&&!refresh)return memberCache;
    if(memberRequest&&!refresh)return memberRequest;
    memberRequest=(async()=>{
      try{
        const r=await api('/api/member/context',{timeout:6500});
        if(!r.ok){memberCache=null;return null;}
        const data=await r.json();
        memberCache=data;
        return data;
      }catch(error){
        memberCache=null;
        if(error?.name==='AbortError')console.warn('Member context request timed out');
        return null;
      }finally{memberRequest=null;}
    })();
    return memberRequest;
  }

  function clearMemberCache(){memberCache=null;memberRequest=null;}

  function policyAccepted(){return acceptedInMemory||readStorage(POLICY_KEY)===POLICY_VERSION}

  async function initConsent(){
    ensureConsentDialog();
    if(policyAccepted()){void track("page_view","portal","completed");return;}
    showConsent();
    const member=await getMember();
    if(member?.policy?.accepted&&member.policy.version===POLICY_VERSION){rememberAcceptance();hideConsent();void track("page_view","portal","completed");}
  }

  function ensureConsentDialog(){
    if($("policyConsent"))return;
    const dialog=document.createElement("div");dialog.id="policyConsent";dialog.className="policy-backdrop";dialog.hidden=true;
    dialog.innerHTML=`<section class="policy-dialog" role="dialog" aria-modal="true" aria-labelledby="policyTitle" aria-describedby="policyDescription"><p class="eyebrow">ก่อนเริ่มใช้งาน</p><h2 id="policyTitle">ยืนยันเงื่อนไขการใช้งาน</h2><p id="policyDescription">โปรดอ่านและยอมรับข้อกำหนด นโยบายความเป็นส่วนตัว และการใช้เนื้อหาที่สร้างขึ้นเพื่อการสะท้อนมุมมองและความบันเทิง</p><label class="policy-check"><input id="policyAgree" type="checkbox"> <span>ฉันได้อ่านและยอมรับ <a href="/terms/" target="_blank" rel="noopener noreferrer">ข้อกำหนดการใช้บริการ</a> และ <a href="/privacy/" target="_blank" rel="noopener noreferrer">นโยบายความเป็นส่วนตัว</a></span></label><p class="policy-status" id="policyStatus" role="status" aria-live="polite"></p><button id="policyAccept" type="button" disabled>ยอมรับและเริ่มใช้งาน</button></section>`;
    document.body.append(dialog);
    const checkbox=$("policyAgree"),button=$("policyAccept");
    checkbox.addEventListener("change",()=>{button.disabled=!checkbox.checked;});
    button.addEventListener("click",acceptPolicy);
    dialog.addEventListener("keydown",event=>{
      if(event.key==="Escape"){event.preventDefault();checkbox.focus();return;}
      if(event.key!=="Tab")return;
      const focusable=[...dialog.querySelectorAll('a[href],button:not([disabled]),input:not([disabled])')];
      if(!focusable.length)return;
      const first=focusable[0],last=focusable[focusable.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    });
  }

  function showConsent(){ensureConsentDialog();const dialog=$("policyConsent");dialog.hidden=false;document.body.classList.add("policy-open");requestAnimationFrame(()=>$("policyAgree")?.focus());}
  function hideConsent(){const dialog=$("policyConsent");if(dialog)dialog.hidden=true;document.body.classList.remove("policy-open");}

  async function acceptPolicy(){
    const button=$("policyAccept"),status=$("policyStatus");if(!$("policyAgree")?.checked)return;
    setButtonBusy(button,true,"กำลังบันทึก…");status.textContent="";
    try{
      const member=await getMember();
      if(member?.success){const response=await api("/api/member/consent",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({accepted:true,policyVersion:POLICY_VERSION})});if(!response.ok){const data=await response.json().catch(()=>null);throw new Error(data?.error?.message||"บันทึกการยอมรับไม่สำเร็จ");}clearMemberCache();}
      rememberAcceptance();hideConsent();void track("policy_accepted","portal","completed");void track("page_view","portal","completed");
    }catch(error){status.textContent=error?.message||"ยังบันทึกไม่ได้ กรุณาลองอีกครั้ง";}
    finally{setButtonBusy(button,false);}
  }

  function rememberAcceptance(){acceptedInMemory=true;writeStorage(POLICY_KEY,POLICY_VERSION)}

  function track(eventName,feature,status=null,durationMs=null,metadata=null){
    if(!policyAccepted())return Promise.resolve();
    const anonymousId=getAnonymousId();
    return fetch(`${API}/api/usage`,{method:"POST",credentials:"include",keepalive:true,headers:{"Content-Type":"application/json","X-Tarot-Policy-Version":POLICY_VERSION},body:JSON.stringify({eventName,feature,status,durationMs,metadata,pagePath:location.pathname,anonymousId})}).then(()=>undefined).catch(()=>undefined);
  }

  function getAnonymousId(){let value=readStorage(ANONYMOUS_KEY);if(!value){value=crypto.randomUUID();writeStorage(ANONYMOUS_KEY,value);}return value;}
  function readStorage(key){try{return localStorage.getItem(key)||""}catch{return ""}}
  function writeStorage(key,value){try{localStorage.setItem(key,value)}catch{}}
  function escapeHtml(value){return String(value??"").replace(/[&<>']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;"}[char]));}

  function initNavigation(){
    const header=document.querySelector('.portal-header');
    const nav=header?.querySelector('.portal-nav');
    const account=header?.querySelector('.portal-account');
    if(!header||!nav||header.querySelector('.portal-menu-toggle'))return;
    if(!nav.id)nav.id='portalNavigation';
    const accountPlaceholder=document.createComment('portal-account-placeholder');
    if(account)account.parentNode.insertBefore(accountPlaceholder,account);
    const button=document.createElement('button');
    button.type='button';button.className='portal-menu-toggle';button.setAttribute('aria-label','เปิดเมนู');button.setAttribute('aria-controls',nav.id);button.setAttribute('aria-expanded','false');button.innerHTML='<span></span><span></span><span></span>';
    header.insertBefore(button,account||nav);
    const syncAccountPlacement=()=>{if(!account)return;if(matchMedia('(max-width: 820px)').matches){if(account.parentNode!==nav){account.classList.add('portal-account-mobile');nav.append(account);}}else{account.classList.remove('portal-account-mobile');if(account.parentNode===nav)accountPlaceholder.parentNode.insertBefore(account,accountPlaceholder.nextSibling);}};
    const close=()=>{header.classList.remove('menu-open');button.setAttribute('aria-expanded','false');button.setAttribute('aria-label','เปิดเมนู');document.body.classList.remove('portal-menu-lock');};
    button.addEventListener('click',()=>{syncAccountPlacement();const open=!header.classList.contains('menu-open');header.classList.toggle('menu-open',open);button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',open?'ปิดเมนู':'เปิดเมนู');document.body.classList.toggle('portal-menu-lock',open&&matchMedia('(max-width: 820px)').matches);});
    nav.addEventListener('click',e=>{if(e.target.closest('a,button'))close();});document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});addEventListener('resize',()=>{syncAccountPlacement();if(innerWidth>820)close();});syncAccountPlacement();
  }

  async function initAccount(){
    const signIn=$("portalSignIn"), me=$("portalMe"), logout=$("portalLogout");
    if(!signIn&&!me&&!logout)return;
    if(signIn)signIn.onclick=()=>location.assign(`${API}/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
    try{
      const member=await getMember();
      const ok=Boolean(member?.success);
      if(signIn)signIn.hidden=ok;
      if(me)me.hidden=!ok;
      if(logout){logout.hidden=!ok;logout.onclick=()=>{clearMemberCache();location.assign(`${API}/auth/logout?returnTo=${encodeURIComponent(location.origin+"/tarot/")}`);};}
    }catch{
      if(signIn)signIn.hidden=false;
      if(me)me.hidden=true;
      if(logout)logout.hidden=true;
    }
  }

  function initFooter(){
    let footer=document.querySelector('footer.footer');
    if(!footer){footer=document.createElement('footer');footer.className='footer portal-footer';document.body.append(footer);}else footer.classList.add('portal-footer');
    footer.innerHTML=`<div class="footer-brand"><a href="/tarot/" class="footer-logo"><em>/</em>sorasukt Tarot</a><p>พื้นที่สำหรับการสะท้อนมุมมองผ่านไพ่ โหราศาสตร์ และเครื่องมือเชิงสัญลักษณ์ ผลลัพธ์มีไว้เพื่อความบันเทิงและการไตร่ตรอง ไม่ใช่คำแนะนำจากผู้เชี่ยวชาญ</p></div><div class="footer-links"><div><strong>บริการ</strong><a href="/tarot/">วันนี้</a><a href="/tarot/reading/">เปิดไพ่</a><a href="/tarot/astrology/">ดวงดาว</a><a href="/tarot/membership/">สมาชิกพิเศษ</a></div><div><strong>ข้อมูล</strong><a href="/tarot/support/">สนับสนุนเรา</a><a href="/tarot/about/">เกี่ยวกับบริการ</a><a href="/privacy/">นโยบายความเป็นส่วนตัว</a><a href="/terms/">ข้อกำหนดการใช้งาน</a></div></div><div class="footer-bottom"><span>© ${new Date().getFullYear()} sorasukt</span><span>โปรดใช้วิจารณญาณในการตีความผลลัพธ์</span></div>`;
  }

  window.TarotPortal={api,ai,apiError,renderError,getMember,clearMemberCache,setLoading,finishLoading,setButtonBusy,track,policyAccepted,policyVersion:POLICY_VERSION};
  ensureEnhancementStyles();
  addEventListener("DOMContentLoaded",()=>{initNavigation();initFooter();initAccount();initConsent();});
})();
