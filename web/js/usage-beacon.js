/**
 * Privacy-preserving usage beacons — counts activity, never sends hashes or content.
 */
(function () {
  const API = '/api/usage/event';

  function track(event, count = 1) {
    const safeCount = Math.min(Math.max(Number(count) || 1, 1), 100);
    const payload = JSON.stringify({ event, count: safeCount });

    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
      credentials: 'same-origin'
    }).catch(() => {});
  }

  window.otrustTrackUsage = track;

  if (document.getElementById('timestamp-tool')) {
    track('timestamp_tool_view');
  }
})();