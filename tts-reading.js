(() => {
  const API_PATH="/api/tts/reading";
  let activeAudio=null;
  let objectUrl="";

  function readingText(){
    const title=document.getElementById("readingTitle")?.textContent?.trim()||"การอ่านไพ่ของคุณ";
    const question=document.getElementById("questionDisplay")?.textContent?.trim()||"";
    const copy=document.getElementById("readingCopy")?.innerText?.trim()||"";
    return [title,question,copy].filter(Boolean).join("\n\n").slice(0,7000);
  }

  function ensureControls(){
    const reading=document.getElementById("readingStep");
    const copy=document.getElementById("readingCopy");
    if(!reading||!copy||reading.hidden||!copy.textContent.trim()||document.getElementById("readingAudioControls"))return;

    const controls=document.createElement("div");
    controls.id="readingAudioControls";
    controls.style.cssText="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:28px 0 8px";

    const button=document.createElement("button");
    button.type="button";
    button.className="primary";
    button.textContent="ฟังคำอ่านไพ่ · สมาชิก";
    button.setAttribute("aria-describedby","readingAudioStatus");

    const stop=document.createElement("button");
    stop.type="button";
    stop.className="text-button";
    stop.textContent="หยุดเสียง";
    stop.hidden=true;

    const status=document.createElement("span");
    status.id="readingAudioStatus";
    status.setAttribute("role","status");
    status.setAttribute("aria-live","polite");
    status.style.cssText="font-size:13px;color:#6d6d6d";

    button.addEventListener("click",()=>playReading(button,stop,status));
    stop.addEventListener("click",()=>stopAudio(button,stop,status));
    controls.append(button,stop,status);
    copy.parentNode.insertBefore(controls,copy);
  }

  async function playReading(button,stop,status){
    const text=readingText();
    if(!text){status.textContent="ยังไม่มีคำอ่านสำหรับเปิดเสียง";return;}
    stopAudio(button,stop,status,false);
    button.disabled=true;
    button.textContent="กำลังเตรียมเสียง…";
    status.textContent="กำลังสร้างเสียงอ่านภาษาไทย";
    try{
      const response=await window.TarotPortal.ai("tts",API_PATH,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({text})
      });
      if(!response.ok){
        const data=await response.json().catch(()=>null);
        const error=window.TarotPortal.apiError(data,"ไม่สามารถสร้างเสียงได้");
        if(error.code==="MEMBERSHIP_REQUIRED"){
          status.innerHTML='เสียงอ่านไพ่เป็นสิทธิพิเศษสำหรับสมาชิก · <a href="/tarot/membership/">ดูสิทธิพิเศษ</a>';
          button.disabled=false;
          button.textContent="ฟังคำอ่านไพ่ · สมาชิก";
          return;
        }
        throw error;
      }
      const blob=await response.blob();
      if(!blob.size)throw new Error("ไม่ได้รับข้อมูลเสียง");
      objectUrl=URL.createObjectURL(blob);
      activeAudio=new Audio(objectUrl);
      activeAudio.preload="auto";
      activeAudio.addEventListener("ended",()=>stopAudio(button,stop,status));
      activeAudio.addEventListener("error",()=>{
        status.textContent="เปิดเสียงไม่สำเร็จ ลองใช้เสียงของอุปกรณ์แทน";
        browserFallback(text,status);
        stopAudio(button,stop,status,false);
      },{once:true});
      await activeAudio.play();
      button.textContent="กำลังเล่นเสียง";
      stop.hidden=false;
      status.textContent="กำลังอ่านคำทำนายให้คุณฟัง";
    }catch(error){
      status.textContent="กำลังใช้เสียงสำรองของอุปกรณ์";
      const used=browserFallback(text,status);
      if(!used)status.textContent=error?.message||"ไม่สามารถเปิดเสียงได้ในขณะนี้";
      button.disabled=false;
      button.textContent="ฟังคำอ่านไพ่ · สมาชิก";
    }
  }

  function stopAudio(button,stop,status,clearStatus=true){
    if(activeAudio){activeAudio.pause();activeAudio.src="";activeAudio=null;}
    if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl="";}
    if("speechSynthesis" in window)window.speechSynthesis.cancel();
    if(button){button.disabled=false;button.textContent="ฟังคำอ่านไพ่ · สมาชิก";}
    if(stop)stop.hidden=true;
    if(status&&clearStatus)status.textContent="";
  }

  function browserFallback(text,status){
    if(!("speechSynthesis" in window)||typeof SpeechSynthesisUtterance==="undefined")return false;
    window.speechSynthesis.cancel();
    const utterance=new SpeechSynthesisUtterance(text);
    utterance.lang="th-TH";
    utterance.rate=.88;
    utterance.pitch=1;
    const voices=window.speechSynthesis.getVoices();
    utterance.voice=voices.find(voice=>/^th(-|_)/i.test(voice.lang))||null;
    utterance.onend=()=>{if(status)status.textContent="";};
    utterance.onerror=()=>{if(status)status.textContent="ไม่สามารถเปิดเสียงได้ในขณะนี้";};
    window.speechSynthesis.speak(utterance);
    if(status)status.textContent="กำลังใช้เสียงภาษาไทยสำรองจากอุปกรณ์";
    return true;
  }

  addEventListener("DOMContentLoaded",()=>{
    const copy=document.getElementById("readingCopy");
    if(!copy)return;
    new MutationObserver(ensureControls).observe(copy,{childList:true,subtree:true,characterData:true});
    ensureControls();
  });
})();
