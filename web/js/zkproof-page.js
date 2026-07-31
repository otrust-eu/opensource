(() => {
  'use strict';

  const byId = id => document.getElementById(id);
  const ageMode = byId('zk-mode-age');
  const incomeMode = byId('zk-mode-income');
  const ageFields = byId('zk-age-fields');
  const incomeFields = byId('zk-income-fields');
  const generateButton = byId('zk-generate');
  const exportButton = byId('zk-export');
  const publishButton = byId('zk-publish');
  const status = byId('zk-status');
  const statusDot = byId('zk-status-dot');
  const result = byId('zk-result');
  const ceremonyLabel = byId('zk-ceremony-label');

  if (!generateButton || !window.ZKProof) return;

  let mode = 'age';
  let currentProof = null;

  function setMode(nextMode) {
    mode = nextMode;
    const isAge = mode === 'age';
    ageMode.setAttribute('aria-selected', String(isAge));
    incomeMode.setAttribute('aria-selected', String(!isAge));
    ageFields.hidden = !isAge;
    incomeFields.hidden = isAge;
    currentProof = null;
    exportButton.disabled = true;
    publishButton.disabled = true;
    result.innerHTML = '<p>Enter a private value, then generate and verify the proof locally.</p>';
  }

  function setBusy(busy, message) {
    generateButton.disabled = busy;
    ageMode.disabled = busy;
    incomeMode.disabled = busy;
    status.textContent = message;
    statusDot.classList.toggle('ready', !busy && Boolean(currentProof));
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function renderProof(proof) {
    const publicRecord = {
      proofType: proof.proofType,
      version: proof.version,
      statement: proof.statement,
      commitment: proof.commitment,
      publicSignals: proof.publicSignals
    };
    result.innerHTML = `
      <strong>Locally generated and verified</strong>
      <p>${escapeHtml(proof.statement)}. The input is self-attested and has no issuer binding.</p>
      <pre>${escapeHtml(JSON.stringify(publicRecord, null, 2))}</pre>
    `;
  }

  function numberValue(id, label) {
    const raw = byId(id).value;
    const value = Number(raw);
    if (raw === '' || !Number.isSafeInteger(value)) {
      throw new Error(`${label} must be a whole number`);
    }
    return value;
  }

  async function generateProof() {
    currentProof = null;
    exportButton.disabled = true;
    publishButton.disabled = true;
    setBusy(true, 'Generating and verifying locally');
    result.innerHTML = '<p>Computing the Groth16 witness and proof in this browser...</p>';

    try {
      if (!window.ZKProof.isLoaded()) {
        const loaded = await window.ZKProof.init();
        if (!loaded) throw new Error('The local proving engine could not be loaded');
      }

      if (mode === 'age') {
        const birthDate = byId('zk-birth-date').value;
        if (!birthDate) throw new Error('Birth date is required');
        currentProof = await window.ZKProof.generateAgeProof(
          birthDate,
          numberValue('zk-min-age', 'Minimum age')
        );
      } else {
        currentProof = await window.ZKProof.generateIncomeProof(
          numberValue('zk-income-value', 'Private annual value'),
          numberValue('zk-income-min', 'Public minimum'),
          numberValue('zk-income-max', 'Public maximum')
        );
      }

      if (!currentProof?.success) {
        throw new Error('Proof generation did not complete');
      }

      renderProof(currentProof);
      exportButton.disabled = false;
      publishButton.disabled = false;
      setBusy(false, 'Proof verified locally');
    } catch (error) {
      currentProof = null;
      result.innerHTML = `<p><strong>Generation failed:</strong> ${escapeHtml(error.message)}</p>`;
      setBusy(false, 'No proof generated');
    }
  }

  async function publishProof() {
    if (!currentProof) return;
    publishButton.disabled = true;
    status.textContent = 'Submitting public proof data';

    try {
      const stored = await window.ZKProof.submitToServer(currentProof);
      const link = document.createElement('a');
      link.href = stored.shareUrl;
      link.textContent = stored.proofId;
      result.append(document.createElement('hr'));
      result.append('Published proof: ', link);
      status.textContent = 'Proof published and server-verified';
      statusDot.classList.add('ready');
    } catch (error) {
      const explanation = error.message === 'zk_ceremony_incomplete'
        ? 'Publication is correctly disabled until the public proving-key ceremony is complete. Export remains available.'
        : error.message;
      result.insertAdjacentHTML(
        'beforeend',
        `<p><strong>Not published:</strong> ${escapeHtml(explanation)}</p>`
      );
      status.textContent = 'Proof remains local';
      publishButton.disabled = false;
    }
  }

  async function loadReadiness() {
    try {
      const response = await fetch('/health', { headers: { Accept: 'application/json' } });
      const health = await response.json();
      const ready = health.zk_artifacts?.production_ready === true ||
        health.zk_artifacts?.productionReady === true;
      ceremonyLabel.textContent = ready ? 'Ceremony complete' : 'Ceremony pending';
    } catch {
      ceremonyLabel.textContent = 'Ceremony status unavailable';
    }
  }

  ageMode.addEventListener('click', () => setMode('age'));
  incomeMode.addEventListener('click', () => setMode('income'));
  generateButton.addEventListener('click', generateProof);
  exportButton.addEventListener('click', () => {
    if (currentProof) window.ZKProof.exportProof(currentProof);
  });
  publishButton.addEventListener('click', publishProof);

  window.ZKProof.init()
    .then(loaded => {
      status.textContent = loaded ? 'Local proving engine ready' : 'Local proving engine unavailable';
    })
    .catch(() => {
      status.textContent = 'Local proving engine unavailable';
    });
  loadReadiness();
})();
