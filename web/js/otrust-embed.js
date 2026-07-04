/**
 * OTRUST embeddable trust badge.
 * Usage: <script src="https://www.otrust.eu/js/otrust-embed.js" data-otrust-badge></script>
 */
(function () {
  const API = document.currentScript?.dataset?.api || 'https://www.otrust.eu/stats/badges.json';

  async function renderBadge(target) {
    const el = target || document.querySelector('[data-otrust-badge]')?.parentElement;
    if (!el) return;

    const wrap = document.createElement('a');
    wrap.href = 'https://www.otrust.eu/transparency';
    wrap.target = '_blank';
    wrap.rel = 'noopener noreferrer';
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:0.5rem;padding:0.5rem 0.75rem;border:1px solid #e5e5e5;border-radius:8px;font-family:Inter,system-ui,sans-serif;font-size:0.75rem;color:#1a1a1a;text-decoration:none;background:#fafaf9;';

    try {
      const res = await fetch(API);
      const data = await res.json();
      wrap.innerHTML = `
        <span style="width:8px;height:8px;border-radius:50%;background:#2d5a3d;display:inline-block;"></span>
        <span><strong>OTRUST</strong> · ${Number(data.anchored_records || 0).toLocaleString()} anchored · block ${data.latest_block || '—'}</span>`;
    } catch {
      wrap.innerHTML = '<span><strong>OTRUST</strong> · Trust infrastructure</span>';
    }

    const script = document.querySelector('script[data-otrust-badge]');
    if (script?.parentElement) {
      script.parentElement.insertBefore(wrap, script.nextSibling);
    } else {
      el.appendChild(wrap);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => renderBadge());
  } else {
    renderBadge();
  }

  window.OTRUSTEmbed = { renderBadge };
})();