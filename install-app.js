(() => {
  let installPrompt=null;
  const isStandalone=()=>window.matchMedia?.("(display-mode: standalone)")?.matches||window.navigator.standalone===true;
  const isIos=()=>/iphone|ipad|ipod/i.test(navigator.userAgent);

  async function register(){
    if("serviceWorker" in navigator){
      try{await navigator.serviceWorker.register("/tarot/service-worker.js",{scope:"/tarot/"});}
      catch(error){console.warn("App registration unavailable",error?.name||"error");}
    }
  }

  function ensureInstallCard(){
    if(document.getElementById("installAppButton")||isStandalone())return;
    const grid=document.querySelector(".system-grid");
    if(!grid)return;
    const button=document.createElement("button");
    button.type="button";
    button.id="installAppButton";
    button.className="system-card app-install-card";
    button.innerHTML='<span class="num">10</span><h3>ติดตั้งบนอุปกรณ์นี้</h3><p>เปิด Tarot ได้จากหน้าจอหลักและกลับมาใช้งานได้สะดวกขึ้น</p>';
    button.addEventListener("click",install);
    grid.append(button);
  }

  async function install(){
    if(installPrompt){
      installPrompt.prompt();
      try{await installPrompt.userChoice;}catch{}
      installPrompt=null;
      document.getElementById("installAppButton")?.remove();
      return;
    }
    if(isIos()){
      showGuide("แตะปุ่มแชร์ของเบราว์เซอร์ แล้วเลือก ‘เพิ่มไปยังหน้าจอโฮม’ เพื่อเก็บ Tarot ไว้บนอุปกรณ์ของคุณ");
      return;
    }
    showGuide("อุปกรณ์นี้อาจติดตั้งแอปได้จากเมนูของเบราว์เซอร์ เลือก ‘ติดตั้งแอป’ หรือ ‘เพิ่มไปยังหน้าจอหลัก’");
  }

  function showGuide(message){
    const existing=document.getElementById("appInstallGuide");
    if(existing){existing.querySelector("p").textContent=message;existing.hidden=false;return;}
    const backdrop=document.createElement("div");
    backdrop.id="appInstallGuide";backdrop.className="modal-backdrop";
    backdrop.innerHTML=`<section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="installGuideTitle"><p class="eyebrow">ติดตั้ง Tarot</p><h2 id="installGuideTitle">เก็บไว้บนหน้าจอหลัก</h2><p></p><div class="modal-actions"><button class="modal-primary" type="button">เข้าใจแล้ว</button></div></section>`;
    backdrop.querySelector("p:last-of-type").textContent=message;
    backdrop.querySelector("button").addEventListener("click",()=>backdrop.remove());
    backdrop.addEventListener("click",event=>{if(event.target===backdrop)backdrop.remove();});
    document.body.append(backdrop);
  }

  window.addEventListener("beforeinstallprompt",event=>{
    event.preventDefault();installPrompt=event;ensureInstallCard();
  });
  window.addEventListener("appinstalled",()=>document.getElementById("installAppButton")?.remove());
  window.addEventListener("DOMContentLoaded",()=>{void register();ensureInstallCard();});
})();
