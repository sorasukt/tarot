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
    styles.forEach(([href,key])=>{const path=new URL(href,location.href).pathname;const loaded=[...document.querySelectorAll('link[rel="stylesheet"]')].some(link=>{try{return new URL(link.href,location.href).pathname===path}catch{return false}});if(loaded)return;const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.dataset[key]='true';document.head.append(link);});
  }

  async function api(path, options={}) {
    const {timeout=12000,...fetchOptions}=options;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeout);
    try{return await fetch(`${API}${path}`,{...fetchOptions,credentials:"include",signal:fetchOptions.signal||controller.signal});}
    finally{clearTimeout(timer);}
  }

  async function ai(feature,path,options={}){
    if(!policyAccepted()){showConsent();throw new Error("à¸à¸£à¸¸à¸“à¸²à¸¢à¸­à¸¡à¸£à¸±à¸šà¸™à¹‚à¸¢à¸šà¸²à¸¢à¸à¹ˆà¸­à¸™à¹ƒà¸Šà¹‰à¸‡à¸²à¸™");}
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
    throw new Error("à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¹€à¸•à¸£à¸µà¸¢à¸¡à¸œà¸¥à¸¥à¸±à¸žà¸˜à¹Œà¹„à¸”à¹‰à¹ƒà¸™à¸‚à¸“à¸°à¸™à¸µà¹‰");
  }

  function setLoading(container,label){
    if(!container)return;
    container.hidden=false;container.setAttribute("role","status");container.setAttribute("aria-live","polite");container.setAttribute("aria-busy","true");
    container.innerHTML=`<div class="result-loading"><span class="result-spinner" aria-hidden="true"></span><p>${escapeHtml(label||"à¸à¸³à¸¥à¸±à¸‡à¹€à¸•à¸£à¸µà¸¢à¸¡à¸œà¸¥à¸¥à¸±à¸žà¸˜à¹Œ à¸à¸£à¸¸à¸“à¸²à¸£à¸­à¸ªà¸±à¸à¸„à¸£à¸¹à¹ˆ")}</p></div>`;
  }

  function finishLoading(container){if(container)container.setAttribute("aria-busy","false")}

  function setButtonBusy(button,busy,label){
    if(!button)return;
    if(busy){button.dataset.idleLabel=button.textContent;button.disabled=true;button.setAttribute("aria-busy","true");button.textContent=label||"à¸à¸³à¸¥à¸±à¸‡à¸”à¸³à¹€à¸™à¸´à¸™à¸à¸²à¸£â€¦";}
    else{button.disabled=false;button.setAttribute("aria-busy","false");button.textContent=button.dataset.idleLabel||button.textContent;delete button.dataset.idleLabel;}
  }

  function apiError(data,fallback){
    const error=new Error(data?.error?.message||fallback||"à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¸”à¸³à¹€à¸™à¸´à¸™à¸à¸²à¸£à¹„à¸”à¹‰à¹ƒà¸™à¸‚à¸“à¸°à¸™à¸µà¹‰");
    error.code=data?.error?.code||"REQUEST_FAILED";
    const supportUrl=data?.error?.supportUrl;
    if(typeof supportUrl==="string"&&(/^https:\/\/([a-z0-9-]+\.)*stripe\.com\//i.test(supportUrl)||supportUrl==="https://sorasukt.com/tarot/support/"))error.supportUrl=supportUrl;
    error.supportLabel=data?.error?.supportLabel||"à¸ªà¸™à¸±à¸šà¸ªà¸™à¸¸à¸™à¹€à¸£à¸²";
    return error;
  }

  function renderError(container,error,{title=""}={}){
    if(!container)return;
    container.replaceChildren();container.hidden=false;container.setAttribute("role","alert");container.setAttribute("aria-busy","false");
    if(title&&container.tagName!=="P"){const heading=document.createElement("h2");heading.textContent=title;container.append(heading);}
    const message=document.createElement(container.tagName==="P"?"span":"p");message.textContent=error?.message||"à¸à¸£à¸¸à¸“à¸²à¸¥à¸­à¸‡à¹ƒà¸«à¸¡à¹ˆà¸­à¸µà¸à¸„à¸£à¸±à¹‰à¸‡";container.append(message);
    if(error?.supportUrl){const separator=document.createElement("br");const link=document.createElement("a");link.className="support-button";link.href=error.supportUrl;link.target="_blank";link.rel="noopener noreferrer";link.textContent=error.supportLabel||"à¸ªà¸™à¸±à¸šà¸ªà¸™à¸¸à¸™à¹€à¸£à¸²";container.append(separator,link);}
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
    dialog.innerHTML=`<section class="policy-dialog" role="dialog" aria-modal="true" aria-labelledby="policyTitle" aria-describedby="policyDescription"><p class="eyebrow">à¸à¹ˆà¸­à¸™à¹€à¸£à¸´à¹ˆà¸¡à¹ƒà¸Šà¹‰à¸‡à¸²à¸™</p><h2 id="policyTitle">à¸¢à¸·à¸™à¸¢à¸±à¸™à¹€à¸‡à¸·à¹ˆà¸­à¸™à¹„à¸‚à¸à¸²à¸£à¹ƒà¸Šà¹‰à¸‡à¸²à¸™</h2><p id="policyDescription">à¹‚à¸›à¸£à¸”à¸­à¹ˆà¸²à¸™à¹à¸¥à¸°à¸¢à¸­à¸¡à¸£à¸±à¸šà¸‚à¹‰à¸­à¸à¸³à¸«à¸™à¸” à¸™à¹‚à¸¢à¸šà¸²à¸¢à¸„à¸§à¸²à¸¡à¹€à¸›à¹‡à¸™à¸ªà¹ˆà¸§à¸™à¸•à¸±à¸§ à¹à¸¥à¸°à¸à¸²à¸£à¹ƒà¸Šà¹‰à¹€à¸™à¸·à¹‰à¸­à¸«à¸²à¸—à¸µà¹ˆà¸ªà¸£à¹‰à¸²à¸‡à¸‚à¸¶à¹‰à¸™à¹€à¸žà¸·à¹ˆà¸­à¸à¸²à¸£à¸ªà¸°à¸—à¹‰à¸­à¸™à¸¡à¸¸à¸¡à¸¡à¸­à¸‡à¹à¸¥à¸°à¸„à¸§à¸²à¸¡à¸šà¸±à¸™à¹€à¸—à¸´à¸‡</p><label class="policy-check"><input id="policyAgree" type="checkbox"> <span>à¸‰à¸±à¸™à¹„à¸”à¹‰à¸­à¹ˆà¸²à¸™à¹à¸¥à¸°à¸¢à¸­à¸¡à¸£à¸±à¸š <a href="/terms/" target="_blank" rel="noopener noreferrer">à¸‚à¹‰à¸­à¸à¸³à¸«à¸™à¸”à¸à¸²à¸£à¹ƒà¸Šà¹‰à¸šà¸£à¸´à¸à¸²à¸£</a> à¹à¸¥à¸° <a href="/privacy/" target="_blank" rel="noopener noreferrer">à¸™à¹‚à¸¢à¸šà¸²à¸¢à¸„à¸§à¸²à¸¡à¹€à¸›à¹‡à¸™à¸ªà¹ˆà¸§à¸™à¸•à¸±à¸§</a></span></label><p class="policy-status" id="policyStatus" role="status" aria-live="polite"></p><button id="policyAccept" type="button" disabled>à¸¢à¸­à¸¡à¸£à¸±à¸šà¹à¸¥à¸°à¹€à¸£à¸´à¹ˆà¸¡à¹ƒà¸Šà¹‰à¸‡à¸²à¸™</button></section>`;
    document.body.append(dialog);
    const checkbox=$("policyAgree"),button=$("policyAccept");
    checkbox.addEventListener("change",()=>{button.disabled=!checkbox.checked;});
    button.addEventListener("click",acceptPolicy);
    dialog.addEventListener("keydown",event=>{
      if(event.key==="Escape"){event.preventDefault();checkbox.focus();return;}
     .4ï^-¢G§²ÚîÆ­yØ°…Íå¹Œ€ ¤€ôøì4(€½¹ÍÐ™¥áÑÕÉ”€ô‰É½ÝÍ•É½¹Ñ•áÐ¡íÍÕ•ÍÌéÑÉÕ”±ÁÉ½™¥±”éí‰¥ÉÑ¡}‘…Ñ”èˆÄääÄ´Àà´ÄÈˆ±‰¥ÉÑ¡}Ñ¥µ”èˆÀÜèÐÔ‰õô¤ì4(€…Ý…¥Ð±½…‘MÉ¥ÁÐ ‰¡½µ”¹©Ìˆ°™¥áÑÕÉ”¹½¹Ñ•áÐ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡™¥áÑÕÉ”¹É•…‘ä¹±•¹Ñ °Ä¤ì4(€™¥áÑÕÉ”¹É•…‘ålÁt ¤ì4(€…Ý…¥Ð¹•ÜAÉ½µ¥Í”¡É•Í½±Ù”€ôøÍ•Ñ%µµ•‘¥…Ñ”¡É•Í½±Ù”¤¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡™¥áÑÕÉ”¹•±•µ•¹ÑÌ¹•Ð ˆÅÕ¥­	¥ÉÑ¡…Ñ”ˆ¤¹Ù…±Õ”°ˆÄääÄ´Àà´ÄÈˆ¤ì4(€…ÍÍ•ÉÐ¹•ÅÕ…°¡™¥áÑÕÉ”¹•±•µ•¹ÑÌ¹•Ð ˆµ½‘…±	¥ÉÑ¡Q¥µ”ˆ¤¹Ù…±Õ”°ˆÀÜèÐÔˆ¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰Q…É½ÐÉ•…‘¥¹œÍ¡Õ™™±•Ì‰•™½É”•¹…‰±¥¹œ…ÉÍ•±•Ñ¥½¸ˆ°…Íå¹Œ€ ¤€ôøì4(€½¹ÍÐm¡Ñµ°±ÍÉ¥ÁÐ±ÍÑå±•Ítõ…Ý…¥ÐAÉ½µ¥Í”¹…±°¡l4(€€€É•…‘¥±”¡¹•ÜUI0 ‰É•…‘¥¹œ½¥¹‘•à¹¡Ñµ°ˆ±É•Á½Í¥Ñ½ÉåI½½Ð¤°‰ÕÑ˜àˆ¤°4(€€€É•…‘¥±”¡¹•ÜUI0 ‰…ÁÀ¹©Ìˆ±É•Á½Í¥Ñ½ÉåI½½Ð¤°‰ÕÑ˜àˆ¤°4(€€€É•…‘¥±”¡¹•ÜUI0 ‰Í¡Õ™™±”¹ÍÌˆ±É•Á½Í¥Ñ½ÉåI½½Ð¤°‰ÕÑ˜àˆ¤4(€t¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡¡Ñµ°°½¥ô‰Í¡Õ™™±•MÑ…”‰mxùt­…É¥„µ±¥Ù”ô‰Á½±¥Ñ”ˆ¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡¡Ñµ°°½¥ô‰‘•¬‰mxùt­¡¥‘‘•¸¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÉ¥ÁÐ°½…Íå¹Œ™Õ¹Ñ¥½¸‰•¥¹M¡Õ™™±•p¡p¤¼¤ì4(€…ÍÍ•ÉÐ¹½¬¡ÍÉ¥ÁÐ¹¥¹‘•á=˜ ‰…Ý…¥Ð¹•ÜAÉ½µ¥Í”ˆ¤ñÍÉ¥ÁÐ¹¥¹‘•á=˜ ‰É•¹‘•É•¬ ¤í•±Ì¹Í¡Õ™™±•MÑ…”¹¡¥‘‘•¸õÑÉÕ”ˆ¤¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÉ¥ÁÐ°½Í•ÑÑÑÉ¥‰ÕÑ•p ‰¥¹•ÉÐˆ°ˆ‰p¤¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÑå±•Ì°½­•å™É…µ•ÌÍ¡Õ™™±”µ…É¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÑå±•Ì°½µ•‘¥„p¡ÁÉ•™•ÉÌµÉ•‘Õ•µµ½Ñ¥½¸èÉ•‘Õ•p¤¼¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰…±°Q…É½ÐÁ…•ÌÍ¡…É”Ñ¡”É•…‘¥¹œµÁ…”Ù¥ÍÕ…°±…¹Õ…”ˆ±…Íå¹Œ ¤ôùì4(€½¹ÍÐÁ…•Ìõl‰¥¹‘•à¹¡Ñµ°ˆ°‰É•…‘¥¹œ½¥¹‘•à¹¡Ñµ°ˆ°‰…ÍÑÉ½±½ä½¥¹‘•à¹¡Ñµ°ˆ°‰é½‘¥…Œ½¥¹‘•à¹¡Ñµ°ˆ°‰½±½ÉÌ½¥¹‘•à¹¡Ñµ°ˆ°‰¹Õµ‰•ÉÌ½¥¹‘•à¹¡Ñµ°ˆ°‰¹…µ¥¹œ½¥¹‘•à¹¡Ñµ°ˆ°‰µ”½¥¹‘•à¹¡Ñµ°ˆ°‰µ•µ‰•ÉÍ¡¥À½¥¹‘•à¹¡Ñµ°ˆ°‰ÍÕÁÁ½ÉÐ½¥¹‘•à¹¡Ñµ°ˆ°‰…‰½ÕÐ½¥¹‘•à¹¡Ñµ°ˆ°‰‰¥±±¥¹œ½ÍÕ•ÍÌ½¥¹‘•à¹¡Ñµ°‰tì4(€½¹ÍÐmÍÑå±•Ì°¸¸¹‘½Õµ•¹ÑÍtõ…Ý…¥ÐAÉ½µ¥Í”¹…±°¡mÉ•…‘¥±”¡¹•ÜUI0 ‰…ÍÍ•ÑÌ½ÍÌ½½É”½•áÁ•É¥•¹”¹ÍÌˆ±É•Á½Í¥Ñ½ÉåI½½Ð¤°‰ÕÑ˜àˆ¤°¸¸¹Á…•Ì¹µ…À¡Á…Ñ ôùÉ•…‘¥±”¡¹•ÜUI0¡Á…Ñ ±É•Á½Í¥Ñ½ÉåI½½Ð¤°‰ÕÑ˜àˆ¤¥t¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÑå±•Ì°½™½¹Ðµ™…µ¥±äé•½É¥„°‰%	4A±•àM…¹ÌQ¡…¤ˆ±Í•É¥˜¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÑå±•Ì°½™½¹ÐµÍ¥é”é±…µÁp ÐáÁà°ÝÙÜ°äÉÁáp¤¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÑå±•Ì°¼´µ•áÁ•É¥•¹”µÝ¥‘Ñ èÄÄàÁÁà¼¤ì4(€‘½Õµ•¹ÑÌ¹™½É…  ¡¡Ñµ°±¥¹‘•à¤ôù…ÍÍ•ÉÐ¹µ…Ñ ¡¡Ñµ°°½•áÁ•É¥•¹•p¹ÍÍpýØôÈÀÈØÀàÈäµÉ•…‘¥¹œÄ¼±Á…•Ím¥¹‘•át¤¤ì4(€l‹‚â·‚æ#‚âË‚âg‚â#‚âÇ‚â‚â¯‚âŸ‚âÃ‚â‚â·‚â‚â‚âã‚âLñ‰Èû‚âs‚æ#‚âË‚âg‚âS‚âŸ‚â‚âS‚âË‚âœˆ°‹‚âŸ‚âÇ‚âg‚æ‚â‚âÓ‚âS‚â‚â·‚â‚â‚âã‚âLñ‰Èû‚âk‚â·‚â‚â·‚âÃ‚æ‚â‚æ‚âS‚æ'‚âk‚æ'‚âË‚âˆ°‹‚æ‚â—‚âß‚â·‚â‚âŸ‚âÇ‚âg‚â_‚â×‚æ ñ‰Èû‚æ‚â—‚æ'‚âŸ‚â‚æ'‚âg‚â¯‚âË‚â«‚â×‚â‚â·‚â‚â‚âã‚âLˆ°‹‚â‡‚â·‚â‚â‚âŸ‚âË‚â‡‚â¯‚â‡‚âË‚âˆñ‰Èû‚âs‚æ#‚âË‚âg‚âW‚âÇ‚âŸ‚æ‚â—‚â‚â‚â·‚â‚â‚âã‚âLˆ°‹‚æ‚â‚âÓ‚æ#‚â‡‚â#‚âË‚â‚â‚âŸ‚âË‚â‡‚â¯‚â‡‚âË‚âˆñ‰Èû‚æ‚â—‚æ'‚âŸ‚â‚æ'‚âg‚â¯‚âË‚â+‚âß‚æ#‚â·‚â_‚â×‚æ#‚æ‚â+‚æ ˆ°‹‚â_‚âã‚â‚â·‚â‹‚æ#‚âË‚â‚â‚â·‚â‚â‚âã‚âLñ‰Èû‚â·‚â‹‚âç‚æ#‚â_‚â×‚æ#‚âg‚â×‚æ ‰t¹™½É… ¡¡•…‘¥¹œôù…ÍÍ•ÉÐ¹½¬¡‘½Õµ•¹ÑÌ¹Í½µ”¡¡Ñµ°ôù¡Ñµ°¹¥¹±Õ‘•Ì¡¡•…‘¥¹œ¤¤±¡•…‘¥¹œ¤¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰±Õ­äµ½±½ÈÁ…•Ì•áÁ½Í”…¸…•ÍÍ¥‰±”µ•µ‰•ÈÉ•ÍÕ±Ð…¹Í•±•Ñ•µ‘…Ñ”Ñ½½°ˆ±…Íå¹Œ ¤ôùì4(€½¹ÍÐm¡½µ”±Á…”±ÍÉ¥ÁÑtõ…Ý…¥ÐAÉ½µ¥Í”¹…±°¡l4(€€€É•…‘¥±”¡¹•ÜUI0 ‰¥¹‘•à¹¡Ñµ°ˆ±É•Á½Í¥Ñ½ÉåI½½Ð¤°‰ÕÑ˜àˆ¤°4(€€€É•…‘¥±”¡¹•ÜUI0 ‰½±½ÉÌ½¥¹‘•à¹¡Ñµ°ˆ±É•Á½Í¥Ñ½ÉåI½½Ð¤°‰ÕÑ˜àˆ¤°4(€€€É•…‘¥±”¡¹•ÜUI0 ‰½±½ÉÌ½½±½ÉÌ¹©Ìˆ±É•Á½Í¥Ñ½ÉåI½½Ð¤°‰ÕÑ˜àˆ¤4(€t¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡¡½µ”°¿‚â«‚âÏ‚â¯‚â‚âÇ‚âk‚â‚âã‚âL¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡¡½µ”°½¥ô‰‘…¥±å1Õ­å½±½Èˆ¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡Á…”°½¥ô‰½±½É…Ñ”‰mxùt­É•ÅÕ¥É•¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡Á…”°½¥ô‰½±½ÉI•ÍÕ±Ð‰mxùt­…É¥„µ±¥Ù”ô‰Á½±¥Ñ”ˆ¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÉ¥ÁÐ°½Q…É½ÑA½ÉÑ…±p¹Í•Ñ1½…‘¥¹œ¼¤ì4(€…ÍÍ•ÉÐ¹½¬¡ÍÉ¥ÁÐ¹¥¹±Õ‘•Ì ‰xlÀ´åµ„µ™uìÙôˆ¤¤ì4)ô¤ì4(4)Ñ•ÍÐ ‰‰¥±±¥¹œÁ…•ÌÕÍ”Í¥µÁ±”ÁÉ½Ù¥‘•Èµ¹•ÕÑÉ…°½Áä…¹­••Àµ•µ‰•ÉÍ¡¥Àµ…¹…•µ•¹Ð¥¸5ä½Õ¹Ðˆ±…Íå¹Œ ¤ôùì(€½¹ÍÐmµ•µ‰•ÉÍ¡¥À±ÍÕÁÁ½ÉÐ±ÍÕ•ÍÌ±…½Õ¹Ð±µ•µ‰•ÉÍ¡¥ÁMÉ¥ÁÐ±ÍÕÁÁ½ÉÑMÉ¥ÁÐ±ÍÕ•ÍÍMÉ¥ÁÐ±…½Õ¹ÑMÉ¥ÁÐ±‰¥±±¥¹MÑå±•Ítõ…Ý…¥ÐAÉ½µ¥Í”¹…±°¡l4(€€€É•…‘¥±”¡¹•ÜUI0 ‰µ•µ‰•ÉÍ¡¥À½¥¹‘•à¹¡Ñµ°ˆ±É•Á½Í¥Ñ½ÉåI½½Ð¤°‰ÕÑ˜àˆ¤°4(€€€É•…‘¥±”¡¹•ÜUI0 ‰ÍÕÁÁ½ÉÐ½¥¹‘•à¹¡Ñµ°ˆ±É•Á½Í¥Ñ½ÉåI½½Ð¤°‰ÕÑ˜àˆ¤°4(€€€É•…‘¥±”¡¹•ÜUI0 ‰‰¥±±¥¹œ½ÍÕ•ÍÌ½¥¹‘•à¹¡Ñµ°ˆ±É•Á½Í¥Ñ½ÉåI½½Ð¤°‰ÕÑ˜àˆ¤°4(€€€É•…‘¥±”¡¹•ÜUI0 ‰µ”½¥¹‘•à¹¡Ñµ°ˆ±É•Á½Í¥Ñ½ÉåI½½Ð¤°‰ÕÑ˜àˆ¤°4(€€€É•…‘¥±”¡¹•ÜUI0 ‰µ•µ‰•ÉÍ¡¥À½µ•µ‰•ÉÍ¡¥À¹©Ìˆ±É•Á½Í¥Ñ½ÉåI½½Ð¤°‰ÕÑ˜àˆ¤°4(€€€É•…‘¥±”¡¹•ÜUI0 ‰ÍÕÁÁ½ÉÐ½ÍÕÁÁ½ÉÐ¹©Ìˆ±É•Á½Í¥Ñ½ÉåI½½Ð¤°‰ÕÑ˜àˆ¤°4(€€€É•…‘¥±”¡¹•ÜUI0 ‰‰¥±±¥¹œ½ÍÕ•ÍÌ½ÍÕ•ÍÌ¹©Ìˆ±É•Á½Í¥Ñ½ÉåI½½Ð¤°‰ÕÑ˜àˆ¤°4(€€€É•…‘¥±”¡¹•ÜUI0 ‰µ”½µ”¹©Ìˆ±É•Á½Í¥Ñ½ÉåI½½Ð¤°‰ÕÑ˜àˆ¤°4(€€€É•…‘¥±”¡¹•ÜUI0 ‰…ÍÍ•ÑÌ½ÍÌ½Á…•Ì½‰¥±±¥¹œ¹ÍÌˆ±É•Á½Í¥Ñ½ÉåI½½Ð¤°‰ÕÑ˜àˆ¤4(€t¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡µ•µ‰•ÉÍ¡¥À°¼ñÍÑÉ½¹œùMÕ‰ÍÉ¥ÁÑ¥½¸ñp½ÍÑÉ½¹œøñ•´û‚âW‚æ#‚â·‚â·‚âË‚â‹‚âã‚â·‚âÇ‚âW‚æ‚âg‚â‡‚âÇ‚âW‚âÐñp½•´ø¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡µ•µ‰•ÉÍ¡¥À°¼ñÍÑÉ½¹œùA…ä…Ìå½Ô¼ñp½ÍÑÉ½¹œøñ•´û‚â+‚âÏ‚â‚âÃ‚â‚â‚âÇ‚æ'‚â‚æ‚âS‚â×‚â‹‚âœñp½•´ø¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡µ•µ‰•ÉÍ¡¥À°¿‚æ‚â—‚âß‚â·‚â‚âŸ‚âÓ‚âc‚â×‚â+‚âÏ‚â‚âÀ¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡µ•µ‰•ÉÍ¡¥À°¿‚æ‚â—‚âß‚â·‚â‚â+‚æ#‚âŸ‚â‚æ‚âŸ‚â—‚âË‚â_‚â×‚æ#‚â{‚â·‚âS‚âÔ¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡µ•µ‰•ÉÍ¡¥À°¿‚â«‚âÓ‚â_‚âc‚âÓ‚â{‚âÓ‚æ‚â£‚â§‚â_‚â×‚æ#‚æ‚â¯‚æ‚âg‚â‚âŸ‚âË‚â‡‚âW‚æ#‚âË‚â‚â+‚âÇ‚âS‚æ‚â#‚âd¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡µ•µ‰•ÉÍ¡¥À°½¹¹Õ…°	½½ÍÐ¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡µ•µ‰•ÉÍ¡¥À°¼ØÁp¿‚âŸ‚âÇ‚âd¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡µ•µ‰•ÉÍ¡¥À°¼ÐÁp¿‚âŸ‚âÇ‚âd¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡µ•µ‰•ÉÍ¡¥À°¼ÈÁp¿‚âŸ‚âÇ‚âd¼¤ì4(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡µ•µ‰•ÉÍ¡¥À°½¥ô‰ÁÉ¥•½µÁ…É¥Í½¹	½‘äˆ¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡µ•µ‰•ÉÍ¡¥À°½…É¥„µ±…‰•°ô‹‚â‚â·‚â‚â‚âÇ‚âhY¥Í„°5…ÍÑ•É…É°ÁÁ±”A…äƒ‚æ‚â—‚âÀ½½±”A…äˆ¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡µ•µ‰•ÉÍ¡¥À°½…É¥„µ±…‰•°ô‹‚â‚â·‚â‚â‚âÇ‚âhY¥Í„°5…ÍÑ•É…É°ÁÁ±”A…ä°½½±”A…äƒ‚æ‚â—‚âÀAÉ½µÁÑA…äˆ¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡µ•µ‰•ÉÍ¡¥À°½±½¼µÙ¥Í„¼¤í…ÍÍ•ÉÐ¹µ…Ñ ¡µ•µ‰•ÉÍ¡¥À°½±½¼µµ…ÍÑ•É…É¼¤í…ÍÍ•ÉÐ¹µ…Ñ ¡µ•µ‰•ÉÍ¡¥À°½±½¼µ…ÁÁ±”µÁ…ä¼¤í…ÍÍ•ÉÐ¹µ…Ñ ¡µ•µ‰•ÉÍ¡¥À°½±½¼µ½½±”µÁ…ä¼¤í…ÍÍ•ÉÐ¹µ…Ñ ¡µ•µ‰•ÉÍ¡¥À°½±½¼µÁÉ½µÁÑÁ…ä¼¤ì4(€l‰Ù¥Í„µ‰É…¹‘µ…É¬¹Á¹œˆ°‰µ…}Íåµ‰½°¹ÍÙœˆ°‰ÁÁ±•}A…å}±½¼¹ÍÙœ¹Á¹œˆ°‰½½±•}A…å}1½¼¹ÍÙœ¹Á¹œˆ°‰AÉ½µÁÑA…äµ±½¼¹Á¹œ‰t¹™½É… ¡…ÍÍ•Ðôù…ÍÍ•ÉÐ¹µ…Ñ ¡µ•µ‰•ÉÍ¡¥À±¹•ÜI•áÀ¡…ÍÍ•ÑÌ½Á…åµ•¹ÑÌ¼‘í…ÍÍ•Ð¹É•Á±…” ˆ¸ˆ°‰qp¸ˆ¥õ€¤¤¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡‰¥±±¥¹MÑå±•Ì°½p¹±½¼µµ…ÍÑ•É…É¼¤í…ÍÍ•ÉÐ¹µ…Ñ ¡‰¥±±¥¹MÑå±•Ì°½p¹±½¼µ…ÁÁ±”µÁ…ä¼¤í…ÍÍ•ÉÐ¹µ…Ñ ¡‰¥±±¥¹MÑå±•Ì°½p¹±½¼µ½½±”µÁ…ä¼¤í…ÍÍ•ÉÐ¹µ…Ñ ¡‰¥±±¥¹MÑå±•Ì°½p¹±½¼µÁÉ½µÁÑÁ…ä¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡‰¥±±¥¹MÑå±•Ì°½p¹Á…åµ•¹Ðµ±½¼¥µœ¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡‰¥±±¥¹MÑå±•Ì°½p¹‰•¹•™¥ÐµÑ…‰±”¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÕÁÁ½ÉÐ°½AÉ½µÁÑA…ä¼¤í…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÕÁÁ½ÉÐ°¿‚â_‚â×‚æ#‚â·‚â‹‚âç‚æ#‚â#‚âÇ‚âS‚â«‚æ#‚â¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÕÁÁ½ÉÐ°½¥ô‰ÍÕÁÁ½ÉÑ	ÕÑÑ½¸‰mxùt¨û‚âS‚âÏ‚æ‚âg‚âÓ‚âg‚âW‚æ#‚â´ð¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÕ•ÍÌ°½…É¥„µ±¥Ù”ô‰Á½±¥Ñ”ˆ¼¤ì4(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡µ•µ‰•ÉÍ¡¥À°½MÑÉ¥Á•ñÕÍÑ½µ•ÈA½ÉÑ…±ñAÉ½µ½Ñ¥½¸½‘”¼¤ì4(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡ÍÕÁÁ½ÉÐ°½MÑÉ¥Á•ñÕÍÑ½µ•ÈA½ÉÑ…°¼¤ì4(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡ÍÕ•ÍÌ°½MÑÉ¥Á•ñÕÍÑ½µ•ÈA½ÉÑ…°¼¤ì4(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡µ•µ‰•ÉÍ¡¥ÁMÉ¥ÁÐ°½p½…Á¥p½‰¥±±¥¹p½Á½ÉÑ…±ó‚â‚âÏ‚â—‚âÇ‚â‚æ‚âo‚âÓ‚âPMÑÉ¥Á•ñÕÍÑ½µ•ÈA½ÉÑ…°¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡µ•µ‰•ÉÍ¡¥ÁMÉ¥ÁÐ°½¹¹Õ…°	½½ÍÐ¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡µ•µ‰•ÉÍ¡¥ÁMÉ¥ÁÐ°¿‚â—‚â‚â+‚âß‚æ#‚â·‚æ‚â+‚æ'‚â‚âË‚âd¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÕÁÁ½ÉÑMÉ¥ÁÐ°½¡•­½ÕÑp½ÍÕÁÁ½ÉÐ¼¤ì4(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡ÍÕÁÁ½ÉÑMÉ¥ÁÐ°¿‚â‚âÏ‚â—‚âÇ‚â‚æ‚âo‚âÓ‚âPMÑÉ¥Á•ó‚âk‚âdMÑÉ¥Á”¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÕ•ÍÍMÉ¥ÁÐ°¿‚âS‚âç‚æ‚âk‚æ‚â«‚â‚æ‚â ¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡ÍÕ•ÍÍMÉ¥ÁÐ°½¡É•˜ô‰p¹p¹p½p¹p¹p½µ•p¼ˆ¼¤ì4(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡ÍÕ•ÍÍMÉ¥ÁÐ°½p½…Á¥p½‰¥±±¥¹p½Á½ÉÑ…±ñÕÍÑ½µ•ÈA½ÉÑ…°¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡…½Õ¹Ð°½¥ô‰…½Õ¹ÑA½ÉÑ…±	ÕÑÑ½¸‰mxùt¨û‚æ‚âo‚â—‚â×‚æ#‚â‹‚âg‚æ‚â{‚æ‚â‚æ‚â‚â#‚â¯‚â‚âß‚â·‚â‹‚â‚æ‚â—‚âÓ‚â‚â«‚â‡‚âË‚â+‚âÓ‚âð¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡…½Õ¹ÑMÉ¥ÁÐ°½p½…Á¥p½‰¥±±¥¹p½Á½ÉÑ…°¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡…½Õ¹ÑMÉ¥ÁÐ°½p½…Á¥p½‰¥±±¥¹p½ÍÑ…ÑÕÍpýÉ•™É•Í ôÄ¼¤ì4(€…ÍÍ•ÉÐ¹µ…Ñ ¡…½Õ¹ÑMÉ¥ÁÐ°½…¹•±ÑA•É¥½‘¹¼¤ì4(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡…½Õ¹Ð­…½Õ¹ÑMÉ¥ÁÐ°½ÕÍÑ½µ•ÈA½ÉÑ…°¼¤ì)ô¤ì()Ñ•ÍÐ ‰Í¡…É•ÍÑå±•Ì…É”¹½Ð¥¹©•Ñ•ÑÝ¥”Ý¡•¸Á…•ÌÕÍ”É•±…Ñ¥Ù”±¥¹­Ìˆ±…Íå¹Œ ¤ôùì(€½¹ÍÐÁ½ÉÑ…°õ…Ý…¥ÐÉ•…‘¥±”¡¹•ÜUI0 ‰Á½ÉÑ…°¹©Ìˆ±É•Á½Í¥Ñ½ÉåI½½Ð¤°‰ÕÑ˜àˆ¤ì(€…ÍÍ•ÉÐ¹µ…Ñ ¡Á½ÉÑ…°°½¹•ÜUI1p¡±¥¹­p¹¡É•˜±±½…Ñ¥½¹p¹¡É•™p¥p¹Á…Ñ¡¹…µ”ôôõÁ…Ñ ¼¤ì(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡Á½ÉÑ…°°½ÅÕ•ÉåM•±•Ñ½Ép¡±¥¹­qm¡É•™p¨õp‰p‘qíÁ…Ñ¡qõp‰qup¤¼¤ì)ô¤ì()Ñ•ÍÐ ‰Í•ÉÙ¥”Ý½É­•ÈÑÉ…­Ì…¡”ÝÉ¥Ñ•Ì…¹Ñ¡”A9µ…¹¥™•ÍÐ‘•±…É•ÌÉ•…°‘¥µ•¹Í¥½¹Ìˆ±…Íå¹Œ ¤ôùì(€½¹ÍÐmÝ½É­•È±µ…¹¥™•ÍÑQ•áÑtõ…Ý…¥ÐAÉ½µ¥Í”¹…±°¡mÉ•…‘¥±”¡¹•ÜUI0 ‰Í•ÉÙ¥”µÝ½É­•È¹©Ìˆ±É•Á½Í¥Ñ½ÉåI½½Ð¤°‰ÕÑ˜àˆ¤±É•…‘¥±”¡¹•ÜUI0 ‰µ…¹¥™•ÍÐ¹Ý•‰µ…¹¥™•ÍÐˆ±É•Á½Í¥Ñ½ÉåI½½Ð¤°‰ÕÑ˜àˆ¥t¤ì(€…ÍÍ•ÉÐ¹µ…Ñ ¡Ý½É­•È°½•Ù•¹Ñp¹Ý…¥ÑU¹Ñ¥±p¡¹•ÑÝ½É­p¹Ñ¡•¸¼¤ì(€…ÍÍ•ÉÐ¹µ…Ñ ¡Ý½É­•È°½…Ý…¥Ð…¡•Íp¹½Á•¹p¡!}95p¥p¹Ñ¡•¹p¡…¡”ôù…¡•p¹ÁÕÐ¼¤ì(€…ÍÍ•ÉÐ¹‘½•Í9½Ñ5…Ñ ¡Ý½É­•È°½…¡•p¹…‘‘±±p¡AA}M!11p¥p¥p¹…Ñ ¼¤ì(€½¹ÍÐµ…¹¥™•ÍÐõ)M=8¹Á…ÉÍ”¡µ…¹¥™•ÍÑQ•áÐ¤ì(€…ÍÍ•ÉÐ¹½¬¡µ…¹¥™•ÍÐ¹¥½¹Ì¹•Ù•Éä¡¥½¸ôù¥½¸¹ÑåÁ”„ôô‰¥µ…”½Á¹œ‰ññ¥½¸¹Í¥é•ÌôôôˆÄÀàÁàÄÀàÀˆ¤¤ì)ô¤ì(