(() => {
  const STORAGE = {
    onboard: 'otrust_timestamp_onboarded',
    changelog: 'otrust_changelog_dismissed_v1'
  };

  function initTimestampOnboarding() {
    if (localStorage.getItem(STORAGE.onboard) === '1') return;
    const tool = document.getElementById('timestamp-tool');
    if (!tool) return;

    const banner = document.createElement('aside');
    banner.className = 'otrust-onboard-banner';
    banner.setAttribute('aria-label', 'Getting started');
    banner.innerHTML = `
      <div class="otrust-onboard-copy">
        <strong>New here?</strong>
        <ol>
          <li>Drop a file or paste text</li>
          <li>Click <em>Create timestamp</em></li>
          <li>Optionally add email — we notify you automatically when Bitcoin confirms</li>
        </ol>
      </div>
      <button type="button" class="otrust-onboard-dismiss">Got it</button>
    `;
    tool.prepend(banner);
    banner.querySelector('.otrust-onboard-dismiss')?.addEventListener('click', () => {
      localStorage.setItem(STORAGE.onboard, '1');
      banner.remove();
    });
  }

  function initChangelogBanner() {
    if (localStorage.getItem(STORAGE.changelog) === '1') return;
    const anchor = document.querySelector('.bento-hero-actions');
    if (!anchor) return;

    const note = document.createElement('p');
    note.className = 'otrust-changelog-banner';
    note.innerHTML = `
      <span>What&rsquo;s new: bento UX, Bitcoin alerts, live transparency.</span>
      <a href="/changelog">Changelog</a>
      <button type="button" aria-label="Dismiss">&times;</button>
    `;
    anchor.insertAdjacentElement('afterend', note);
    note.querySelector('button')?.addEventListener('click', () => {
      localStorage.setItem(STORAGE.changelog, '1');
      note.remove();
    });
  }

  function initTransparencyRefresh() {
    const ids = {
      total: 'metric-total',
      verified: 'metric-verified',
      anchored: 'metric-anchored',
      block: 'metric-block',
      blockRow: 'latest-block-row'
    };
    if (!document.getElementById(ids.total)) return;

    const formatNumber = (value) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Number(value || 0));

    async function refresh() {
      try {
        const res = await fetch('/stats', { cache: 'no-store' });
        const stats = await res.json();
        document.getElementById(ids.total).textContent = formatNumber(stats.total_records);
        document.getElementById(ids.verified).textContent = formatNumber(stats.verified_records);
        document.getElementById(ids.anchored).textContent = formatNumber(stats.anchored_records);
        document.getElementById(ids.block).textContent = stats.latest_block ? formatNumber(stats.latest_block) : 'Pending';
        const row = document.getElementById(ids.blockRow);
        if (row) row.textContent = `bitcoin:block ${stats.latest_block || 'pending'}`;
      } catch {
        /* keep last values */
      }
    }

    refresh();
    setInterval(refresh, 60000);
  }

  function initHealthChecklist() {
    const root = document.getElementById('health-checklist');
    if (!root) return;

    const checks = [
      { id: 'health', label: 'Health endpoint', url: '/health', expect: (d) => d.status === 'ok' },
      { id: 'stats', label: 'Public stats', url: '/stats', expect: (d) => typeof d.total_records === 'number' },
      { id: 'challenge', label: 'Timestamp challenge', url: '/challenge', expect: (d) => !!d.challenge },
      { id: 'docs', label: 'Documentation', url: '/docs', html: true },
      { id: 'timestamp', label: 'Timestamp workspace', url: '/timestamp', html: true },
      { id: 'proof', label: 'ID workspace', url: '/proof', html: true }
    ];

    root.innerHTML = checks.map((c) => `
      <li class="health-check-item" data-check="${c.id}">
        <span class="health-check-status" aria-hidden="true">…</span>
        <span class="health-check-label">${c.label}</span>
        <code class="health-check-detail"></code>
      </li>
    `).join('');

    async function runCheck(check) {
      const item = root.querySelector(`[data-check="${check.id}"]`);
      const status = item.querySelector('.health-check-status');
      const detail = item.querySelector('.health-check-detail');
      try {
        const res = await fetch(check.url, { cache: 'no-store' });
        if (check.html) {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          status.textContent = '✓';
          item.classList.add('ok');
          detail.textContent = `${res.status} OK`;
          return;
        }
        const data = await res.json();
        if (!check.expect(data)) throw new Error('Unexpected response');
        status.textContent = '✓';
        item.classList.add('ok');
        detail.textContent = check.id === 'health' ? `v${data.version || '?'}` : 'OK';
      } catch (error) {
        status.textContent = '✗';
        item.classList.add('fail');
        detail.textContent = error.message || 'Failed';
      }
    }

    Promise.all(checks.map(runCheck));
    document.getElementById('health-recheck')?.addEventListener('click', () => {
      root.querySelectorAll('.health-check-item').forEach((el) => {
        el.classList.remove('ok', 'fail');
        el.querySelector('.health-check-status').textContent = '…';
        el.querySelector('.health-check-detail').textContent = '';
      });
      Promise.all(checks.map(runCheck));
    });
  }

  function initPartnerPreview() {
    const root = document.getElementById('partner-preview-root');
    if (!root) return;

    const nameInput = document.getElementById('preview-brand-name');
    const colorInput = document.getElementById('preview-brand-color');
    const logoInput = document.getElementById('preview-brand-logo');
    const screen = document.getElementById('partner-preview-screen');

    const render = () => {
      const name = nameInput?.value?.trim() || 'Your brand';
      const color = colorInput?.value || '#1a1a1a';
      const logo = logoInput?.value?.trim();
      screen.style.setProperty('--preview-accent', color);
      screen.querySelectorAll('.preview-brand-name, .preview-brand-name-inline').forEach((el) => {
        el.textContent = name;
      });
      const logoEl = screen.querySelector('.preview-brand-logo');
      if (logo) {
        logoEl.src = logo;
        logoEl.hidden = false;
      } else {
        logoEl.hidden = true;
      }
    };

    [nameInput, colorInput, logoInput].forEach((el) => el?.addEventListener('input', render));
    render();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.dataset.otrustPage || document.documentElement.dataset.otrustPage;
    if (page === 'timestamp' || page === 'home') initChangelogBanner();
    if (page === 'timestamp') initTimestampOnboarding();
    if (page === 'transparency') initTransparencyRefresh();
    if (document.getElementById('health-checklist')) initHealthChecklist();
    if (document.getElementById('partner-preview-root')) initPartnerPreview();
  });
})();