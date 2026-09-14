/* Hamburger drawer at every viewport size. */
(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('adminSidebar');
    const toggle = document.getElementById('menuToggle');
    const close = document.getElementById('closeMenu');
    const backdrop = document.getElementById('menuBackdrop');
    const main = document.getElementById('mainContent');
    let opened = false;

    function setOpen(value, restoreFocus = false) {
      opened = Boolean(value);
      document.body.classList.toggle('menu-open', opened);
      toggle.setAttribute('aria-expanded', String(opened));
      toggle.setAttribute('aria-label', opened ? 'ปิดเมนู' : 'เปิดเมนู');
      backdrop.hidden = !opened;
      sidebar.inert = !opened;
      main.inert = opened;
      if (opened) close.focus();
      else if (restoreFocus) toggle.focus();
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
    setOpen(false);
  });
})();
