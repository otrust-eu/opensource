/**
 * Share proof card — copy text or download PNG with QR.
 */
(function () {
  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function buildShareText({ receiptId, hash, filename, blockchainStatus, verifyUrl }) {
    const lines = [
      'OTRUST timestamp',
      `Receipt: ${receiptId}`,
      filename ? `File: ${filename}` : null,
      hash ? `Hash: ${hash}` : null,
      `Bitcoin: ${blockchainStatus || 'pending'}`,
      `Verify: ${verifyUrl}`
    ].filter(Boolean);
    return lines.join('\n');
  }

  async function drawShareCard({ receiptId, hash, filename, blockchainStatus, verifyUrl }) {
    const width = 600;
    const height = 340;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#fafaf9';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#e5e5e5';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

    ctx.fillStyle = '#1a1a1a';
    ctx.font = '600 22px Inter, system-ui, sans-serif';
    ctx.fillText('OTRUST', 28, 42);
    ctx.fillStyle = '#2d5a3d';
    ctx.font = '500 13px Inter, system-ui, sans-serif';
    ctx.fillText('Bitcoin-anchored timestamp', 28, 64);

    ctx.fillStyle = '#737373';
    ctx.font = '12px Inter, system-ui, sans-serif';
    ctx.fillText('Receipt', 28, 100);
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '600 16px ui-monospace, monospace';
    ctx.fillText(receiptId, 28, 122);

    if (filename) {
      ctx.fillStyle = '#737373';
      ctx.font = '12px Inter, system-ui, sans-serif';
      ctx.fillText('File', 28, 152);
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '14px Inter, system-ui, sans-serif';
      ctx.fillText(filename.slice(0, 48), 28, 172);
    }

    ctx.fillStyle = '#737373';
    ctx.font = '12px Inter, system-ui, sans-serif';
    ctx.fillText('Blockchain', 28, filename ? 202 : 152);
    ctx.fillStyle = blockchainStatus === 'confirmed' ? '#2d5a3d' : '#b45309';
    ctx.font = '600 14px Inter, system-ui, sans-serif';
    ctx.fillText(blockchainStatus === 'confirmed' ? 'Confirmed on Bitcoin' : 'Pending (~1–2h)', 28, filename ? 224 : 174);

    const qrSize = 120;
    const qrX = width - qrSize - 28;
    const qrY = 88;
    const qrUrl = `/api/qr?size=${qrSize}&data=${encodeURIComponent(verifyUrl)}`;
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = qrUrl;
    });
    ctx.drawImage(img, qrX, qrY, qrSize, qrSize);

    ctx.fillStyle = '#737373';
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.fillText('Scan to verify', qrX + 18, qrY + qrSize + 18);

    if (hash) {
      ctx.fillStyle = '#a3a3a3';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(hash.slice(0, 32) + '…', 28, height - 24);
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
    const id = `share-${opts.receiptId.replace(/[^a-z0-9]/gi, '')}`;
    return `
      <div class="share-proof-actions" data-share-id="${id}">
        <button type="button" class="btn btn-secondary btn-share-text" data-receipt="${escapeHtml(opts.receiptId)}">Copy share text</button>
        <button type="button" class="btn btn-secondary btn-share-png" data-receipt="${escapeHtml(opts.receiptId)}">Download share card</button>
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
      try {
        await downloadShareCard(opts);
      } catch (err) {
        alert('Share card failed: ' + err.message);
      }
    });
  }

  window.otrustShareProof = {
    buildShareText,
    copyShareText,
    downloadShareCard,
    shareActionsHtml,
    bindShareActions
  };
})();