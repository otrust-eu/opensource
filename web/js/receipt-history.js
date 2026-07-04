/**
 * Browser-local timestamp receipt history (never synced to server lists).
 */
(function () {
  const STORAGE_KEY = 'otrust_my_receipts';
  const MAX_RECEIPTS = 200;

  function getMyReceipts() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveMyReceipts(receipts) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(receipts.slice(0, MAX_RECEIPTS)));
  }

  function addToMyReceipts(entry) {
    if (!entry?.receipt_id || !entry?.hash) return;
    const receipts = getMyReceipts().filter((r) => r.receipt_id !== entry.receipt_id);
    receipts.unshift({
      receipt_id: entry.receipt_id,
      hash: entry.hash,
      filename: entry.filename || null,
      timestamp: entry.timestamp || new Date().toISOString(),
      blockchain_confirmed: !!entry.blockchain_confirmed,
      blockchain_block: entry.blockchain_block || null
    });
    saveMyReceipts(receipts);
    return receipts;
  }

  function updateReceiptInHistory(receiptId, patch) {
    const receipts = getMyReceipts();
    const index = receipts.findIndex((r) => r.receipt_id === receiptId);
    if (index === -1) return receipts;
    receipts[index] = { ...receipts[index], ...patch };
    saveMyReceipts(receipts);
    return receipts;
  }

  window.otrustReceiptHistory = {
    STORAGE_KEY,
    getMyReceipts,
    saveMyReceipts,
    addToMyReceipts,
    updateReceiptInHistory
  };
})();