(() => {
  const root = document.querySelector('[data-me-tabs]');
  if (!root) return;

  const tabs = [...root.querySelectorAll('.t-tab')];
  const pill = root.querySelector('.t-tabs-pill');
  const panels = [...document.querySelectorAll('[data-me-panel]')];

  function movePill(tab, animate = true) {
    if (!tab || !pill) return;
    if (!animate) pill.style.transition = 'none';
    pill.style.transform = `translateX(${tab.offsetLeft}px)`;
    pill.style.width = `${tab.offsetWidth}px`;
    if (!animate) {
      void pill.offsetWidth;
      pill.style.transition = '';
    }
  }

  function activate(tab, { focus = false, animate = true } = {}) {
    if (!tab) return;
    const target = tab.dataset.tabTarget;
    tabs.forEach(item => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
    });
    panels.forEach(panel => {
      panel.hidden = panel.dataset.mePanel !== target;
    });
    movePill(tab, animate);
    if (focus) tab.focus();
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', event => {
      let next = null;
      if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
      else if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
      else if (event.key === 'Home') next = tabs[0];
      else if (event.key === 'End') next = tabs[tabs.length - 1];
      if (!next) return;
      event.preventDefault();
      activate(next, { focus: true });
    });
  });

  const params = new URLSearchParams(location.search);
  let initial = 'profile';
  if (params.get('manage') === 'membership') initial = 'membership';
  if (params.get('openBilling') === '1' || params.has('billing')) initial = 'billing';
  const initialTab = tabs.find(tab => tab.dataset.tabTarget === initial) || tabs[0];

  requestAnimationFrame(() => activate(initialTab, { animate: false }));
  addEventListener('resize', () => {
    const active = tabs.find(tab => tab.getAttribute('aria-selected') === 'true');
    movePill(active, false);
  });

  const loadPayments = () => {
    if (document.querySelector('script[data-me-payments]')) return;
    const paymentScript = document.createElement('script');
    paymentScript.src = './me-payments.js?v=20260831-2';
    paymentScript.dataset.mePayments = 'true';
    document.head.append(paymentScript);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', loadPayments, {once:true});
  else loadPayments();
})();