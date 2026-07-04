/**
 * Share proof card v2 — themes, QR, Bitcoin block.
 */
(function () {
  const THEMES = {
    minimal: { bg: '#fafaf9', text: '#1a1a1a', accent: '#2d5a3d', border: '#e5e5e5', sub: '#737373' },
    legal: { bg: '#ffffff', text: '#111111', accent: '#1a365d', border: '#cbd5e1', sub: '#475569' },
    hacker: { bg: '#0f0f0e', text: '#e8e8e6', accent: '#4ade80', border: '#333', sub: '#888' }
  };

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function buildShareText({ receiptId, hash, filename, blockchainStatus, verifyUrl, blockHeight }) {
    const lines = [
      'OTRUST timestamp',
      `Receipt: ${receiptId}`,
      filename ? `File: ${filename}` : null,
      hash ? `Hash: ${hash}` : null,
      blockchainStatus === 'confirmed' && blockHeight
        ? `Bitcoin: confirmed (block ${blockHeight})`
        : `Bitcoin: ${blockchainStatus || 'pending'}`,
      `Verify: ${verifyUrl}`
    ].filter(Boolean);
    return lines.join('\n');
  }

  async function drawShareCard(opts) {
    const themeName = opts.theme || 'minimal';
    const T = THEMES[themeName] || THEMES.minimal;
    const width = 600;
    const height = 360;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = T.border;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

    ctx.fillStyle = T.text;
    ctx.font = '600 22px Inter, system-ui, sans-serif';
    ctx.fillText('OTRUST', 28, 42);
    ctx.fillStyle = T.accent;
    ctx.font = '500 13px Inter, system-ui, sans-serif';
    ctx.fillText('Bitcoin-anchored timestamp', 28, 64);

    ctx.fillStyle = T.sub;
    ctx.font = '12px Inter, system-ui, sans-serif';
    ctx.fillText('Receipt', 28, 100);
    ctx.fillStyle = T.text;
    ctx.font = '600 16px ui-monospace, monospace';
    ctx.fillText(opts.receiptId, 28, 122);

    if (opts.filename) {
      ctx.fillStyle = T.sub;
      ctx.font = '12px Inter, system-ui, sans-serif';
      ctx.fillText('File', 28, 152);
      ctx.fillStyle = T.text;
      ctx.font = '14px Inter, system-ui, sans-serif';
      ctx.fillText(opts.filename.slice(0, 48), 28, 172);
    }

    const confirmed = opts.blockchainStatus === 'confirmed';
    ctx.fillStyle = T.sub;
    ctx.font = '12px Inter, system-ui, sans-serif';
    ctx.fillText('Blockchain', 28, opts.filename ? 202 : 152);
    ctx.fillStyle = confirmed ? T.accent : '#b45309';
    ctx.font = '600 14px Inter, system-ui, sans-serif';
    const chainText = confirmed
      ? (opts.blockHeight ? `Confirmed · block ${opts.blockHeight}` : 'Confirmed on Bitcoin')
      : 'Pending (~1–2h)';
    ctx.fillText(chainText, 28, opts.filename ? 224 : 174);

    const qrSize = 120;
    const qrX = width - qrSize - 28;
    const qrY = 88;
    const qrUrl = `/api/qr?size=${qrSize}&data=${encodeURIComponent(opts.verifyUrl)}`;
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = qrUrl;
    });
    ctx.drawImage(img, qrX, qrY, qrSize, qrSize);
    ctx.fillStyle = T.sub;
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.fillText('Scan to verify', qrX + 18, qrY + qrSize + 18);

    if (opts.hash) {
      ctx.fillStyle = T.sub;
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(opts.hash.slice(0, 32) + '…', 28, height - 24);
    }

    return canvas;
  }

  async function copyShareText(opts) {
    const text = buildShareText(opts);
    await navigator.clipboard.writeText(text);
    return text;
  }

  async function downloadShareCard(opts) {
    const canvas = await drawShareCard(opts);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${opts.receiptId}-share.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function shareActionsHtml(opts) {
    return `
      <div class="share-proof-actions">
        <button type="button" class="btn btn-secondary btn-share-text">Copy share text</button>
        <button type="button" class="btn btn-secondary btn-share-png">Download share card</button>
        <button type="button" class="btn btn-secondary btn-share-bundle">Evidence ZIP</button>
      </div>`;
  }

  function bindShareActions(container, opts) {
    container.querySelector('.btn-share-text')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      try {
        await copyShareText(opts);
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy share text'; }, 1500);
      } catch (err) {
        alert('Copy failed: ' + err.message);
      }
    });
    container.querySelector('.btn-share-png')?.addEventListener('click', async () => {
      try { await downloadShareCard(opts); } catch (err) { alert('Share card failed: ' + err.message); }
    });
    container.querySelector('.btn-share-bundle')?.addEventListener('click', () => {
      window.location.href = `/proof/${opts.receiptId}/evidence.zip`;
    });
  }

  window.otrustShareProof = {
    THEMES,
    buildShareText,
    copyShareText,
    downloadShareCard,
    shareActionsHtml,
    bindShareActions
  };
})();