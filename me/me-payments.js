(() => {
  const API_HISTORY = '/api/billing/account';
  const API_PORTAL = '/api/billing/account/portal';

  function ensureStyles() {
    if (document.querySelector('style[data-payment-account-styles]')) return;
    const style = document.createElement('style');
    style.dataset.paymentAccountStyles = 'true';
    style.textContent = `
      .payment-account-head{align-items:center}
      .payment-account-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
      .payment-account-actions button{margin:0;min-height:44px;padding:10px 16px}
      .payment-history-list{margin-top:14px}
      .payment-row{align-items:center;gap:16px}
      .payment-row-main{display:grid;gap:4px;min-width:0}
      .payment-row-main span{color:#777;font-size:13px}
      .payment-empty{padding:18px;border-radius:16px;background:var(--soft)}
      .payment-empty p{margin:6px 0 0;color:#666;line-height:1.55}
      @media(max-width:760px){
        .payment-account-head{display:grid;gap:14px}
        .payment-account-actions{display:grid;grid-template-columns:1fr 1fr;justify-content:stretch}
        .payment-account-actions button{width:100%}
      }
      @media(max-width:420px){.payment-account-actions{grid-template-columns:1fr}}
    `;
    document.head.append(style);
  }

  function init() {
    const billingPanel = document.querySelector('[data-me-panel="billing"]');
    if (!billingPanel || document.getElementById('paymentAccountPanel')) return;
    ensureStyles();

    const legacy = document.getElementById('invoiceSection');
    if (legacy) {
      legacy.dataset.legacyBillingHistory = 'true';
      legacy.style.display = 'none';
    }

    const panel = document.createElement('section');
    panel.className = 'tool-card payment-account-panel';
    panel.id = 'paymentAccountPanel';
    panel.innerHTML = `
      <div class="section-title-row payment-account-head">
        <div>
          <p class="eyebrow">PAYMENTS</p>
          <h2>การชำระเงินของฉัน</h2>
        </div>
        <div class="payment-account-actions">
          <button id="refreshPayments" class="secondary" type="button">รีเฟรช</button>
          <button id="paymentPortalButton" type="button" hidden>เปิด Payment Portal</button>
        </div>
      </div>
      <p class="profile-intro">ดูรายการชำระเงิน ใบแจ้งหนี้ ใบเสร็จ และจัดการวิธีชำระเงินจากที่นี่</p>
      <div id="paymentAccountStatus" class="profile-status" role="status" aria-live="polite"></div>
      <div id="paymentHistoryList" class="invoice-list payment-history-list"><p class="profile-note">กำลังโหลดรายการชำระเงิน…</p></div>`;
    billingPanel.insertBefore(panel, billingPanel.firstChild);

    document.getElementById('refreshPayments')?.addEventListener('click', load);
    document.getElementById('paymentPortalButton')?.addEventListener('click', openPortal);
    load();
  }

  async function load() {
    const list = document.getElementById('paymentHistoryList');
    const status = document.getElementById('paymentAccountStatus');
    const portal = document.getElementById('paymentPortalButton');
    if (!list || !status || !portal || !window.TarotPortal) return;
    list.innerHTML = '<p class="profile-note">กำลังโหลดรายการชำระเงิน…</p>';
    status.textContent = '';
    portal.hidden = true;

    try {
      const response = await window.TarotPortal.api(API_HISTORY, {timeout:20000});
      const data = await response.json().catch(() => null);
      if (!response.ok) throw window.TarotPortal.apiError(data, 'โหลดข้อมูลการชำระเงินไม่สำเร็จ');
      portal.hidden = !data.portalAvailable;
      renderHistory(data.payments || [], data.invoices || []);
      if (data.warning) status.textContent = data.warning;
      else if (!data.customerLinked && !(data.payments || []).length) status.textContent = 'ยังไม่พบข้อมูลการชำระเงินของบัญชีนี้';
      else if (data.customerLinked && !data.portalAvailable) status.textContent = 'พบข้อมูลการชำระเงินแล้ว แต่ Payment Portal ยังไม่พร้อมใช้งาน';
      else status.textContent = `อัปเดตล่าสุด ${new Intl.DateTimeFormat('th-TH',{timeStyle:'short'}).format(new Date())}`;
    } catch (error) {
      list.innerHTML = `<p class="profile-note">${escapeHtml(error?.message || 'โหลดข้อมูลการชำระเงินไม่สำเร็จ')}</p>`;
      status.textContent = 'กดรีเฟรชเพื่อลองอีกครั้ง';
    }
  }

  function renderHistory(payments, invoices) {
    const list = document.getElementById('paymentHistoryList');
    if (!list) return;
    const invoicePaymentIds = new Set(invoices.map(item => item.paymentIntent).filter(Boolean));
    const items = [
      ...invoices.map(item => ({...item, type:'invoice'})),
      ...payments.filter(item => !invoicePaymentIds.has(item.id)).map(item => ({...item, type:'payment'}))
    ].sort((a,b) => new Date(b.created || 0) - new Date(a.created || 0));

    if (!items.length) {
      list.innerHTML = '<div class="payment-empty"><strong>ยังไม่มีรายการชำระเงิน</strong><p>เมื่อมีการสมัครสมาชิกหรือชำระเงิน รายการจะปรากฏที่นี่โดยอัตโนมัติ</p></div>';
      return;
    }

    list.innerHTML = items.map(item => {
      const isInvoice = item.type === 'invoice';
      const amount = Number(item.amount || 0);
      const documentUrl = safeUrl(isInvoice ? (item.hostedInvoiceUrl || item.invoicePdf) : item.receiptUrl);
      const title = isInvoice ? (item.number || 'ใบแจ้งหนี้') : paymentKind(item.kind);
      const status = paymentStatus(item.status);
      return `<article class="invoice-row payment-row">
        <div class="payment-row-main"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(formatDate(item.created))} · ${escapeHtml(status)}</span></div>
        <div class="invoice-amount"><strong>${escapeHtml(formatMoney(amount,item.currency))}</strong>${documentUrl ? `<a href="${documentUrl}" target="_blank" rel="noopener">${isInvoice?'เปิดใบแจ้งหนี้':'เปิดใบเสร็จ'}</a>` : ''}</div>
      </article>`;
    }).join('');
  }

  async function openPortal() {
    const button = document.getElementById('paymentPortalButton');
    const status = document.getElementById('paymentAccountStatus');
    if (!button || !status || !window.TarotPortal) return;
    window.TarotPortal.setButtonBusy(button,true,'กำลังเปิด…');
    status.textContent = 'กำลังเปิด Payment Portal';
    try {
      const response = await window.TarotPortal.api(API_PORTAL,{method:'POST',timeout:20000});
      const data = await response.json().catch(() => null);
      if (!response.ok) throw window.TarotPortal.apiError(data,'เปิด Payment Portal ไม่สำเร็จ');
      if (!/^https:\/\/billing\.stripe\.com\//.test(data?.url || '')) throw new Error('ลิงก์ Payment Portal ไม่ถูกต้อง');
      location.assign(data.url);
    } catch (error) {
      status.textContent = error?.message || 'เปิด Payment Portal ไม่สำเร็จ';
      window.TarotPortal.setButtonBusy(button,false);
    }
  }

  function paymentKind(value) { return ({membership:'สมาชิกพิเศษ',support:'การสนับสนุน',payment:'การชำระเงิน'})[value] || 'การชำระเงิน'; }
  function paymentStatus(value) { return ({paid:'ชำระแล้ว',succeeded:'ชำระแล้ว',complete:'สำเร็จ',open:'รอชำระ',pending:'กำลังดำเนินการ',failed:'ไม่สำเร็จ',expired:'หมดอายุ',refunded:'คืนเงินแล้ว',partially_refunded:'คืนเงินบางส่วน',draft:'ฉบับร่าง',void:'ยกเลิก',uncollectible:'เรียกเก็บไม่ได้'})[value] || value || '-'; }
  function formatMoney(amount,currency='thb') { try { return new Intl.NumberFormat('th-TH',{style:'currency',currency:String(currency || 'thb').toUpperCase()}).format(Number(amount || 0)/100); } catch { return `${Number(amount || 0)/100} ${currency || 'THB'}`; } }
  function formatDate(value) { try { return new Intl.DateTimeFormat('th-TH',{dateStyle:'medium',timeZone:'Asia/Bangkok'}).format(new Date(value)); } catch { return value || '-'; } }
  function safeUrl(value) { try { const url = new URL(String(value || '')); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>\"']/g,char => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[char])); }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
