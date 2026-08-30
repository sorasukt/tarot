(() => {
  const $=selector=>document.querySelector(selector);
  let timer=null,selectedPlaceId='',signedIn=false,currentMembership=null;

  async function load(){
    const status=$('#profileStatus');status.textContent='กำลังโหลดข้อมูล…';
    try{
      const member=await window.TarotPortal.getMember();signedIn=Boolean(member?.success);
      if(!signedIn){
        $('#accountName').textContent='ยังไม่ได้ลงชื่อใช้งาน';$('#accountEmail').textContent='ลงชื่อใช้งานเพื่อดูและจัดการข้อมูลสมาชิกของคุณ';$('#accountMembershipTitle').textContent='ลงชื่อใช้งานเพื่อดูสถานะสมาชิก';$('#accountMembershipDetail').textContent='สถานะ Tarot for your daily จะแสดงในบัญชีของคุณ';$('#accountPortalButton').hidden=true;$('#profileForm').hidden=true;status.textContent='ข้อมูลส่วนบุคคลจะแสดงหลังจากลงชื่อใช้งาน';return;
      }
      renderAccount(member.user||{},member.completion||{});renderProfile(member.profile||null);
      const returnedFromBilling=(location.search||'').includes('billing=updated'),manageRequested=(location.search||'').includes('manage=membership');
      currentMembership=member.membership||null;
      if(returnedFromBilling){const response=await window.TarotPortal.api('/api/billing/status?refresh=1',{timeout:15000}),data=await response.json();if(response.ok)currentMembership=data.membership||null;}
      renderMembership(currentMembership);$('#profileForm').hidden=false;$('#memberBadge').hidden=false;
      status.textContent=returnedFromBilling?'อัปเดตข้อมูลสมาชิกเรียบร้อยแล้ว':member.profile?'ข้อมูลของคุณพร้อมใช้งาน':'เพิ่มวันเดือนปีเกิดเพื่อเริ่มใช้ประสบการณ์สำหรับสมาชิก';
      await Promise.allSettled([loadInvoices(),loadRecovery()]);
      if(manageRequested&&currentMembership?.paymentType==='subscription')$('#subscriptionManager').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(e){$('#profileForm').hidden=true;status.textContent=e?.message||'โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';}
  }

  function renderAccount(user,completion){
    const name=user.name||user.nickname||'บัญชีของคุณ';$('#accountName').textContent=name;$('#accountEmail').textContent=user.email||'ไม่มีอีเมลในข้อมูลบัญชี';
    const avatar=$('#accountAvatar'),fallback=$('#accountAvatarFallback');if(user.picture){avatar.src=user.picture;avatar.hidden=false;fallback.hidden=true}else{avatar.hidden=true;fallback.hidden=false;fallback.textContent=(name.trim()[0]||'S').toUpperCase()}
    const health=$('#profileHealth');health.hidden=false;const badges=[['วันเกิด',completion.hasBirthDate],['เวลาเกิด',completion.hasBirthTime],['สถานที่เกิด',completion.hasBirthPlace]];health.innerHTML=badges.map(([label,ok])=>`<span class="health-chip ${ok?'is-ready':''}">${ok?'✓':'○'} ${escapeHtml(label)}</span>`).join('');
  }

  function renderProfile(profile){$('#birthDate').value=profile?.birth_date||'';$('#birthTime').value=profile?.birth_time||'';$('#birthPlace').value=profile?.birth_place||'';selectedPlaceId=profile?.birth_place_id||'';$('#birthPlaceId').value=selectedPlaceId;$('#profileSavedAt').textContent=profile?.updated_at?`อัปเดตล่าสุด ${formatDateTime(profile.updated_at)}`:'';}

  function renderMembership(membership){
    const title=$('#accountMembershipTitle'),detail=$('#accountMembershipDetail'),portal=$('#accountPortalButton'),manager=$('#subscriptionManager');
    currentMembership=membership;
    if(!membership){title.textContent='ยังไม่มีสมาชิกพิเศษ';detail.textContent='เลือก Subscription หรือชำระครั้งเดียวได้จากหน้าแผนสมาชิก';portal.hidden=true;manager.hidden=true;return;}
    const period=periodLabel(membership.period),ending=membership.currentPeriodEnd?formatDate(membership.currentPeriodEnd):'';
    title.textContent=membership.active?`Tarot for your daily · ${period}`:`สถานะสมาชิก: ${statusLabel(membership.status)}`;
    detail.textContent=membership.cancelAtPeriodEnd?`ยกเลิกการต่ออายุแล้ว · ยังใช้สิทธิ์ได้ถึง ${ending}`:ending?`${membership.paymentType==='subscription'?'ต่ออายุ':'ใช้สิทธิ์ได้'}ถึง ${ending}`:'จัดการข้อมูลสมาชิกและการชำระเงินได้ด้านล่าง';
    portal.hidden=membership.paymentType!=='subscription';manager.hidden=membership.paymentType!=='subscription';
    if(membership.paymentType==='subscription')$('#subscriptionPeriod').value=membership.period||'monthly';
  }

  async function openPortal(){
    const button=$('#accountPortalButton');window.TarotPortal.setButtonBusy(button,true,'กำลังเปิด…');
    try{const response=await window.TarotPortal.api('/api/billing/portal',{method:'POST',timeout:15000}),data=await response.json();if(!response.ok)throw window.TarotPortal.apiError(data,'เปิด Customer Portal ไม่สำเร็จ');if(!/^https:\/\/billing\.stripe\.com\//.test(data.url||''))throw new Error('ลิงก์ Customer Portal ไม่ถูกต้อง');location.assign(data.url)}catch(error){$('#subscriptionMessage').textContent=error?.message||'เปิด Customer Portal ไม่สำเร็จ';window.TarotPortal.setButtonBusy(button,false)}
  }

  async function changeSubscription(){
    const button=$('#changeSubscription'),period=$('#subscriptionPeriod').value,message=$('#subscriptionMessage');
    if(period===currentMembership?.period){message.textContent='คุณใช้แพ็กเกจนี้อยู่แล้ว';return;}
    window.TarotPortal.setButtonBusy(button,true,'กำลังเปลี่ยน…');message.textContent='กำลังอัปเดตแพ็กเกจและคำนวณส่วนต่างของรอบบิล';
    try{
      const response=await window.TarotPortal.api('/api/billing/subscription/change',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({period}),timeout:20000}),data=await response.json();
      if(!response.ok)throw window.TarotPortal.apiError(data,'เปลี่ยนแพ็กเกจไม่สำเร็จ');
      currentMembership={...currentMembership,...data.membership,paymentType:'subscription',active:['active','trialing'].includes(data.membership?.status||currentMembership?.status)};renderMembership(currentMembership);message.textContent=`เปลี่ยนเป็นแพ็กเกจ${periodLabel(period)}เรียบร้อยแล้ว`;
      window.TarotPortal.clearMemberCache();await loadInvoices();
    }catch(error){message.textContent=error?.message||'เปลี่ยนแพ็กเกจไม่สำเร็จ'}finally{window.TarotPortal.setButtonBusy(button,false)}
  }

  async function cancelSubscription(){
    const button=$('#cancelSubscription'),message=$('#subscriptionMessage');window.TarotPortal.setButtonBusy(button,true,'กำลังเปิด…');message.textContent='กำลังเปิดขั้นตอนจัดการการยกเลิกและทางเลือกก่อนยกเลิก';
    try{const response=await window.TarotPortal.api('/api/billing/subscription/cancel',{method:'POST',timeout:15000}),data=await response.json();if(!response.ok)throw window.TarotPortal.apiError(data,'เปิดขั้นตอนยกเลิกไม่สำเร็จ');if(!/^https:\/\/billing\.stripe\.com\//.test(data.url||''))throw new Error('ลิงก์จัดการ Subscription ไม่ถูกต้อง');location.assign(data.url)}catch(error){message.textContent=error?.message||'เปิดขั้นตอนยกเลิกไม่สำเร็จ';window.TarotPortal.setButtonBusy(button,false)}
  }

  async function loadInvoices(){
    if(!signedIn)return;const section=$('#invoiceSection'),root=$('#invoiceList');section.hidden=false;root.innerHTML='<p class="profile-note">กำลังโหลดรายการชำระเงิน…</p>';
    try{const response=await window.TarotPortal.api('/api/billing/invoices',{timeout:15000}),data=await response.json();if(!response.ok)throw window.TarotPortal.apiError(data,'โหลดใบแจ้งหนี้ไม่สำเร็จ');renderInvoices(data.invoices||[])}catch(error){root.innerHTML=`<p class="profile-note">${escapeHtml(error?.message||'โหลดใบแจ้งหนี้ไม่สำเร็จ')}</p>`}
  }

  function renderInvoices(items){
    const root=$('#invoiceList');if(!items.length){root.innerHTML='<p class="profile-note">ยังไม่มีใบแจ้งหนี้หรือประวัติการชำระเงิน</p>';return;}
    root.innerHTML=items.map(item=>{const amount=item.amountPaid||item.amountDue||0,link=item.hostedInvoiceUrl||item.invoicePdf;return `<article class="invoice-row"><div><strong>${escapeHtml(item.number||'Invoice')}</strong><span>${escapeHtml(formatDate(item.created))} · ${escapeHtml(invoiceStatus(item.status))}</span></div><div class="invoice-amount"><strong>${escapeHtml(formatMoney(amount,item.currency))}</strong>${link?`<a href="${safeUrl(link)}" target="_blank" rel="noopener">เปิดเอกสาร</a>`:''}</div></article>`}).join('');
  }

  async function loadRecovery(){
    if(!signedIn)return;try{const response=await window.TarotPortal.api('/api/billing/recovery',{timeout:12000}),data=await response.json();if(!response.ok)return;const recovery=data.recovery,box=$('#billingRecovery');if(!recovery||recovery.state!=='payment_failed'){box.hidden=true;return}box.hidden=false;const next=recovery.nextPaymentAttempt?` ระบบจะลองเรียกเก็บใหม่ประมาณ ${formatDateTime(recovery.nextPaymentAttempt)}`:'';$('#billingRecoveryText').textContent=`มีการเรียกเก็บเงินไม่สำเร็จ ${recovery.attemptCount||1} ครั้ง.${next}`;const link=$('#billingRecoveryLink');if(recovery.hostedInvoiceUrl){link.href=recovery.hostedInvoiceUrl;link.hidden=false}else link.hidden=true}catch{}
  }

  async function searchPlaces(){const q=$('#birthPlace').value.trim();selectedPlaceId='';$('#birthPlaceId').value='';if(q.length<3){hideSuggestions();return}try{const r=await window.TarotPortal.api(`/api/member/places/autocomplete?q=${encodeURIComponent(q)}`);const d=await r.json();if(!r.ok)throw new Error(d?.error?.message||'ค้นหาสถานที่ไม่สำเร็จ');renderSuggestions(d.suggestions||[])}catch{hideSuggestions()}}
  function renderSuggestions(items){const box=$('#placeSuggestions');box.replaceChildren();if(!items.length){hideSuggestions();return}items.forEach(p=>{const b=document.createElement('button');b.type='button';b.className='place-option';b.setAttribute('role','option');b.innerHTML=`<strong>${escapeHtml(p.mainText||p.text)}</strong>${p.secondaryText?`<span>${escapeHtml(p.secondaryText)}</span>`:''}`;b.onclick=()=>{selectedPlaceId=p.placeId;$('#birthPlaceId').value=p.placeId;$('#birthPlace').value=p.text;hideSuggestions()};box.append(b)});box.hidden=false;$('#birthPlace').setAttribute('aria-expanded','true')}
  function hideSuggestions(){$('#placeSuggestions').hidden=true;$('#birthPlace').setAttribute('aria-expanded','false')}

  async function save(e){
    e.preventDefault();if(!signedIn)return;const btn=$('#saveProfile'),status=$('#profileStatus');window.TarotPortal.setButtonBusy(btn,true,'กำลังบันทึก…');status.textContent='กำลังบันทึกข้อมูลของคุณ';status.dataset.loading='true';
    try{const birthPlace=$('#birthPlace').value.trim();if(birthPlace&&!selectedPlaceId)throw new Error('กรุณาเลือกสถานที่เกิดจากรายการแนะนำ หรือเว้นช่องนี้ไว้');const payload={birthDate:$('#birthDate').value,birthTime:$('#birthTime').value,birthPlace,birthPlaceId:selectedPlaceId};const r=await window.TarotPortal.api('/api/member/profile',{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)throw new Error(d?.error?.message||'บันทึกข้อมูลไม่สำเร็จ');window.TarotPortal.clearMemberCache();const member=await window.TarotPortal.getMember({refresh:true});if(member){renderAccount(member.user||{},member.completion||{});renderProfile(member.profile||d.profile||null)}else renderProfile(d.profile||null);status.textContent='บันทึกข้อมูลเรียบร้อยแล้ว ข้อมูลชุดนี้พร้อมใช้งานในหน้าอื่น'}catch(e){status.textContent=e?.message||'บันทึกข้อมูลไม่สำเร็จ'}finally{window.TarotPortal.setButtonBusy(btn,false);delete status.dataset.loading}}

  function periodLabel(v){return ({weekly:'รายสัปดาห์',monthly:'รายเดือน',yearly:'รายปี'})[v]||'สมาชิกพิเศษ'}
  function statusLabel(v){return ({active:'กำลังใช้งาน',trialing:'ช่วงทดลอง',past_due:'รอการชำระ',paused:'หยุดชั่วคราว',canceled:'ยกเลิกแล้ว',unpaid:'ยังไม่ชำระ',incomplete:'ยังไม่สมบูรณ์',incomplete_expired:'หมดเวลาชำระ'})[v]||'ยังไม่ใช้งาน'}
  function invoiceStatus(v){return ({paid:'ชำระแล้ว',open:'รอชำระ',draft:'ฉบับร่าง',void:'ยกเลิก',uncollectible:'เรียกเก็บไม่ได้'})[v]||v||'-'}
  function formatMoney(amount,currency='thb'){try{return new Intl.NumberFormat('th-TH',{style:'currency',currency:String(currency).toUpperCase()}).format(Number(amount||0)/100)}catch{return `${Number(amount||0)/100} ${currency}`}}
  function formatDate(value){try{return new Intl.DateTimeFormat('th-TH',{dateStyle:'long',timeZone:'Asia/Bangkok'}).format(new Date(value))}catch{return value||'-'}}
  function formatDateTime(value){try{const raw=String(value||''),parsed=new Date(raw.includes('T')?raw:`${raw.replace(' ','T')}Z`);return new Intl.DateTimeFormat('th-TH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Bangkok'}).format(parsed)}catch{return value||'-'}}
  function safeUrl(value){try{const u=new URL(value);return u.protocol==='https:'?u.href:'#'}catch{return'#'}}
  function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

  addEventListener('DOMContentLoaded',()=>{
    $('#profileForm').addEventListener('submit',save);$('#accountPortalButton').addEventListener('click',openPortal);$('#changeSubscription').addEventListener('click',changeSubscription);$('#cancelSubscription').addEventListener('click',cancelSubscription);$('#refreshInvoices').addEventListener('click',loadInvoices);
    $('#birthPlace').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(searchPlaces,350)});document.addEventListener('click',e=>{if(!e.target.closest('.place-field'))hideSuggestions()});load();
  });
})();
