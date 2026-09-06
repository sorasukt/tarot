/* Mobile drawer; desktop navigation remains visible and keyboard accessible. */
(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('adminSidebar');
    const toggle = document.getElementById('menuToggle');
    const close = document.getElementById('closeMenu');
    const backdrop = document.getElementById('menuBackdrop');
    const main = document.getElementById('mainContent');
    const mobile = window.matchMedia('(max-width: 760px)');
    let opened = false;

    function setOpen(value, restoreFocus = false) {
      opened = mobile.matches && value;
      document.body.classList.toggle('menu-open', opened);
      toggle.setAttribute('aria-expanded', String(opened));
      toggle.setAttribute('aria-label', opened ? 'ปิดเมนู' : 'เปิดเมนู');
      backdrop.hidden = !opened;
      sidebar.inert = mobile.matches && !opened;
      main.inert = opened;
      if (opened) close.focus();
      else if (restoreFocus && mobile.matches) toggle.focus();
    }

    toggle.addEventListener('click', () => setOpen(!opened));
    close.addEventListener('click', () => setOpen(false, true));
    backdrop.addEventListener('click', () => setOpen(false, true));
    document.addEventListener('keydown', event => {
      if (!opened) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false, true);
      } else if (event.key === 'Tab') {
        const items = [...sidebar.querySelectorAll('button:not(:disabled), a[href]')]
          .filter(item => item.getClientRects().length);
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
    });
    document.addEventListener('admin:view', event => {
      sidebar.querySelectorAll('[data-view]').forEach(item => {
        if (item.dataset.view === event.detail.name) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
      });
      const wasOpen = opened;
      setOpen(false);
      if (wasOpen) document.getElementById('pageTitle').focus();
    });
    mobile.addEventListener('change', () => {
      const focusInSidebar = sidebar.contains(document.activeElement);
      const focusOnMobileControl = document.activeElement === toggle || document.activeElement === close;
      setOpen(false);
      if (mobile.matches && focusInSidebar) toggle.focus();
      else if (!mobile.matches && focusOnMobileControl) sidebar.querySelector('[aria-current="page"]').focus();
    });
    setOpen(false);
  });
})();
