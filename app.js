const major = ["The Fool","The Magician","The High Priestess","The Empress","The Emperor","The Hierophant","The Lovers","The Chariot","Strength","The Hermit","Wheel of Fortune","Justice","The Hanged Man","Death","Temperance","The Devil","The Tower","The Star","The Moon","The Sun","Judgement","The World"];
const ranks = ["Ace","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Page","Knight","Queen","King"];
const suits = ["Wands","Cups","Swords","Pentacles"];
const cards = [
  ...major.map((name,id)=>({id,name,arcana:"major"})),
  ...suits.flatMap((suit,s)=>ranks.map((rank,r)=>({id:22+s*14+r,name:`${rank} of ${suit}`,arcana:"minor",suit:suit.toLowerCase()})))
];
const positions = [
  ["present","สถานการณ์ปัจจุบัน"],
  ["influence","สิ่งที่กำลังมีอิทธิพล"],
  ["challenge","สิ่งที่ควรตระหนัก"],
  ["guidance","แนวทาง"],
  ["direction","แนวโน้ม"]
];
const state={question:"",selected:[]};
const $=id=>document.getElementById(id);
const els={question:$("question"),charCount:$("charCount"),start:$("startButton"),counter:$("counter"),questionStep:$("questionStep"),deckStep:$("deckStep"),deckTitle:$("deckTitle"),deckInstruction:$("deckInstruction"),shuffleStage:$("shuffleStage"),deck:$("deck"),selectedStrip:$("selectedStrip"),sticky:$("stickyAction"),reveal:$("revealButton"),readingStep:$("readingStep"),readingGrid:$("readingGrid"),readingCopy:$("readingCopy"),readingTitle:$("readingTitle"),questionDisplay:$("questionDisplay"),loading:$("loading"),loadingText:$("loadingText"),error:$("readingError")};

function shuffledDeck(){return [...cards].sort(()=>Math.random()-.5)}
function updateQuestion(){const q=els.question.value.trim(); els.charCount.textContent=`${els.question.value.length} / 500`; els.start.disabled=!q;}
els.question.addEventListener("input",updateQuestion);
els.start.addEventListener("click",()=>{state.question=els.question.value.trim(); if(!state.question)return; els.questionStep.hidden=true; els.deckStep.hidden=false; window.scrollTo({top:0,behavior:"smooth"});void beginShuffle();});

async function beginShuffle(){
  state.selected=[];updateSelectionUI();els.deck.replaceChildren();els.deck.hidden=true;els.deck.setAttribute("inert","");els.selectedStrip.hidden=true;$("resetSelection").hidden=true;els.shuffleStage.hidden=false;els.deckStep.dataset.phase="shuffling";els.deckTitle.textContent="กำลังสับไพ่ของคุณ";els.deckInstruction.textContent="รอสักครู่ เมื่อสับไพ่เสร็จแล้วคุณจะเลือกได้ 5 ใบ";
  const reduceMotion=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  await new Promise(resolve=>setTimeout(resolve,reduceMotion?250:1900));
  renderDeck();els.shuffleStage.hidden=true;els.deck.hidden=false;els.deck.removeAttribute("inert");els.selectedStrip.hidden=false;$("resetSelection").hidden=false;delete els.deckStep.dataset.phase;els.deckTitle.textContent="เลือกไพ่ที่ดึงดูดคุณ";els.deckInstruction.textContent="สับไพ่เรียบร้อยแล้ว แตะไพ่เพื่อเลือก แตะอีกครั้งเพื่อยกเลิก เลือกให้ครบ 5 ใบ";els.deck.classList.add("is-dealing");setTimeout(()=>els.deck.classList.remove("is-dealing"),700);els.deckTitle.focus({preventScroll:true});
}

function renderDeck(){
  state.selected=[]; els.deck.replaceChildren();
  shuffledDeck().forEach((card,index)=>{
    const b=document.createElement("button"); b.className="card"; b.type="button"; b.dataset.id=card.id; b.setAttribute("aria-label",`เลือกไพ่ใบที่ ${card.id+1}`);
    b.style.setProperty("--deal-index",index%12);
    const o=document.createElement("span"); o.className="order"; b.append(o);
    b.addEventListener("click",()=>toggleCard(card,b,o)); els.deck.append(b);
  }); updateSelectionUI();
}
function toggleCard(card,node,order){
  const idx=state.selected.findIndex(x=>x.id===card.id);
  if(idx>=0){state.selected.splice(idx,1); node.classList.remove("selected"); order.textContent="";}
  else if(state.selected.length<5){state.selected.push(card); node.classList.add("selected");}
  document.querySelectorAll(".card").forEach(n=>{const i=state.selected.findIndex(x=>x.id===Number(n.dataset.id)); const badge=n.querySelector(".order"); if(i>=0){n.classList.add("selected");badge.textContent=i+1;n.setAttribute("aria-pressed","true")}else{n.classList.remove("selected");badge.textContent="";n.setAttribute("aria-pressed","false")} n.classList.toggle("disabled",state.selected.length===5&&i<0)});
  updateSelectionUI();
}
function updateSelectionUI(){els.counter.textContent=`เลือกแล้ว ${state.selected.length} / 5 ใบ`;els.selectedStrip.textContent=state.selected.length?`เลือกแล้ว: ${state.selected.map((_,i)=>`ใบที่ ${i+1}`).join(" · ")}`:"ยังไม่ได้เลือกไพ่";els.sticky.hidden=state.selected.length!==5;}
$("resetSelection").addEventListener("click",()=>void beginShuffle());
$("newReading").addEventListener("click",()=>location.reload());
els.reveal.addEventListener("click",createReading);

function showLoading(on){els.loading.hidden=!on;els.loading.setAttribute("aria-busy",String(on));document.querySelector("main")?.setAttribute("aria-busy",String(on));}
async function createReading(){
  if(state.selected.length!==5)return;
  els.sticky.hidden=true;els.error.hidden=true;showLoading(true);
  const messages=["กำลังพิจารณาคำถามของคุณ","กำลังเชื่อมโยงความหมายของไพ่","กำลังเรียบเรียงการอ่านของคุณ"];
  let mi=0; const timer=setInterval(()=>{mi=(mi+1)%messages.length;els.loadingText.textContent=messages[mi]},1400);
  try{
    const endpoint=window.TAROT_CONFIG?.endpoint||"/api/tarot/reading";
    const res=await window.TarotPortal.ai("tarot",endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({question:state.question,language:"th",cards:state.selected.map(c=>({cardId:c.id,orientation:"upright"}))})});
    const data=await res.json().catch(()=>null);
    if(!res.ok||!data?.success)throw window.TarotPortal.apiError(data,"ไม่สามารถสร้างคำอ่านไพ่ได้");
    renderReading(data.reading);
  }catch(err){window.TarotPortal.renderError(els.error,err);els.error.focus();els.sticky.hidden=false;}
  finally{clearInterval(timer);showLoading(false)}
}
function renderReading(reading){
  els.deckStep.hidden=true; els.readingStep.hidden=false; els.questionDisplay.textContent=`“${state.question}”`;els.readingTitle.textContent=reading.readingTitle||"การอ่านไพ่ของคุณ";els.readingGrid.replaceChildren();
  state.selected.forEach((card,i)=>{const ai=reading.cards?.[i]||{}; const wrap=document.createElement("article");wrap.className="revealed-card";const face=document.createElement("div");face.className="card-face";const pos=document.createElement("div");pos.className="card-position";pos.textContent=positions[i][1];const symbol=document.createElement("div");symbol.className="card-symbol";symbol.textContent=card.arcana==="major"?"✦":"◇";const name=document.createElement("div");name.className="card-name";name.textContent=card.name;const keys=document.createElement("div");keys.className="keywords";keys.textContent=(ai.keywords||[]).join(" · ");face.append(pos,symbol,name,keys);wrap.append(face);els.readingGrid.append(wrap)});
  els.readingCopy.replaceChildren();
  addSection("ภาพรวม",reading.overallReading||reading.summary||"");
  if(Array.isArray(reading.patterns)&&reading.patterns.length)addSection("ความเชื่อมโยงของไพ่",reading.patterns.map(p=>`${p.title}: ${p.description}`).join("\n\n"));
  if(Array.isArray(reading.cards))reading.cards.forEach((c,i)=>addSection(`${positions[i]?.[1]||"ไพ่"} — ${c.cardName||state.selected[i]?.name||""}`,c.interpretation||""));
  if(Array.isArray(reading.guidance)&&reading.guidance.length)addSection("สิ่งที่คุณอาจลองนำไปคิดต่อ",reading.guidance.map(x=>`• ${x}`).join("\n"));
  if(reading.reflectionQuestion)addSection("คำถามสำหรับคิดต่อ",reading.reflectionQuestion);
  window.scrollTo({top:0,behavior:"smooth"});
}
function addSection(title,text){if(!text)return;const h=document.createElement("h3");h.textContent=title;const p=document.createElement("p");p.style.whiteSpace="pre-line";p.textContent=text;els.readingCopy.append(h,p)}
