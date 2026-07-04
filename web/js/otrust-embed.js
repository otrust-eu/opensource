/**
 * OTRUST embeddable trust badge v2
 * Usage:
 *   <script src="https://www.otrust.eu/js/otrust-embed.js" data-otrust-badge></script>
 *   <script src="..." data-otrust-badge data-otrust-theme="dark" data-otrust-lang="sv"></script>
 */
(function () {
  const script = document.currentScript;
  const API = script?.dataset?.api || 'https://www.otrust.eu/stats/badges.json';
  const theme = (script?.dataset?.otrustTheme || script?.dataset?.theme || 'light').toLowerCase();
  const lang = (script?.dataset?.otrustLang || script?.dataset?.lang || 'en').toLowerCase();

  const LABELS = {
    en: { anchored: 'anchored', block: 'block', fallback: 'Trust infrastructure' },
    sv: { anchored: 'förankrade', block: 'block', fallback: 'Trust-infrastruktur' }
  };
  const L = LABELS[lang] || LABELS.en;

  const THEMES = {
    light: { bg: '#fafaf9', border: '#e5e5e5', text: '#1a1a1a', dot: '#2d5a3d' },
    dark: { bg: '#1a1a1a', border: '#404040', text: '#fafaf9', dot: '#4ade80' }
  };
  const T = THEMES[theme] || THEMES.light;

  async function renderBadge(target) {
    const el = target || script?.parentElement;
    if (!el) return;

    const wrap = document.createElement('a');
    wrap.href = 'https://www.otrust.eu/transparency';
    wrap.target = '_blank';
    wrap.rel = 'noopener noreferrer';
    wrap.style.cssText = `display:inline-flex;align-items:center;gap:0.5rem;padding:0.5rem 0.75rem;border:1px solid ${T.border};border-radius:8px;font-family:Inter,system-ui,sans-serif;font-size:0.75rem;color:${T.text};text-decoration:none;background:${T.bg};`;

    try {
      const res = await fetch(API);
      const data = await res.json();
      wrap.innerHTML = `
        <span style="width:8px;height:8px;border-radius:50%;background:${T.dot};display:inline-block;"></span>
        <span><strong>OTRUST</strong> · ${Number(data.anchored_records || 0).toLocaleString()} ${L.anchored} · ${L.block} ${data.latest_block || '—'}</span>`;
    } catch {
      wrap.innerHTML = `<span><strong>OTRUST</strong> · ${L.fallback}</span>`;
    }

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

  window.OTRUSTEmbed = { renderBadge, theme, lang };
})();