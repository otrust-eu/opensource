/**
 * OTRUST ID Page JavaScript
 * Document upload + OCR + ZK proof generation
 */

// Theme toggle
const themeToggle = document.getElementById('theme-toggle');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const savedTheme = localStorage.getItem('theme');

if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
  document.documentElement.setAttribute('data-theme', 'dark');
}

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
  });
}

// Mobile menu
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const navSecondary = document.getElementById('nav-secondary');

if (mobileMenuBtn && navSecondary) {
  mobileMenuBtn.addEventListener('click', () => {
    navSecondary.classList.toggle('open');
  });
}

document.addEventListener('click', (e) => {
  if (navSecondary && !e.target.closest('.nav-links')) {
    navSecondary.classList.remove('open');
  }
});

// Check for recovery mode
const urlParams = new URLSearchParams(window.location.search);
const authChallengeId = urlParams.get('auth_challenge') || urlParams.get('challenge');
const authThemeId = urlParams.get('theme_id') || urlParams.get('themeId') || '';
const recoveryToken = urlParams.get('recovery');
let authChallengeData = null;

const AUTH_PARTNER_DEFAULTS = {
  backgroundColor: '#F5F7FA',
  primaryColor: '#2D5A3D',
  textColor: '#0F1B2D',
  fontFamily: 'system',
  borderRadius: 8,
  spacingScale: 'default',
  logoUrl: null,
  logoAlt: '',
  headline: 'Create your OTRUST ID',
  subhead: 'Create a reusable ID package, then return to the partner Auth flow.',
  footerText: 'Powered by OTRUST'
};

const AUTH_CSS_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$|^rgba?\(\s*(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\s*,\s*(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\s*,\s*(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i;
const AUTH_FONT_RE = /^[a-zA-Z0-9 ,.'"-]{1,80}$/;
const AUTH_THEME_ID_RE = /^[a-zA-Z0-9_.:-]{1,80}$/;

if (recoveryToken) {
  // Show recovery banner
  const recoveryBanner = document.createElement('div');
  recoveryBanner.style.cssText = `
    background: linear-gradient(135deg, #ff6b35, #f7931a);
    color: white;
    padding: 1rem;
    text-align: center;
    position: sticky;
    top: 0;
    z-index: 100;
    font-weight: 500;
  `;
  recoveryBanner.innerHTML = `
    <strong>Identity Recovery Mode</strong> — 
    Your old identity was revoked. Complete verification to create a new proof.
    <span style="opacity: 0.8; font-size: 0.85rem; display: block; margin-top: 0.25rem;">
      Recovery token expires in 24 hours
    </span>
  `;
  document.body.insertBefore(recoveryBanner, document.body.firstChild);
}

initAuthPartnerFlow();

async function initAuthPartnerFlow() {
  if (!authChallengeId || !/^[a-zA-Z0-9_=-]{3,200}$/.test(authChallengeId)) return;
  if (authThemeId && !AUTH_THEME_ID_RE.test(authThemeId)) return;

  try {
    const metadataUrl = new URL(`/api/v1/auth/challenge/${encodeURIComponent(authChallengeId)}`, window.location.origin);
    if (authThemeId) metadataUrl.searchParams.set('theme_id', authThemeId);
    const response = await fetch(`${metadataUrl.pathname}${metadataUrl.search}`, {
      headers: { Accept: 'application/json' }
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Login challenge could not be loaded.');
    }

    authChallengeData = data;
    applyAuthPartnerBranding(data);
  } catch (error) {
    console.warn('[ID] Auth partner theme unavailable:', error.message);
  }
}

function applyAuthPartnerBranding(data) {
  const theme = { ...AUTH_PARTNER_DEFAULTS, ...(data.branding || {}) };
  const root = document.documentElement;
  const clientLabel = data.clientId || 'the partner app';

  document.body.classList.add('auth-themed');
  document.getElementById('authPartnerBanner')?.removeAttribute('hidden');

  if (isAuthCssColor(theme.backgroundColor)) root.style.setProperty('--bg', theme.backgroundColor);
  if (isAuthCssColor(theme.primaryColor)) {
    root.style.setProperty('--accent', theme.primaryColor);
    root.style.setProperty('--success', theme.primaryColor);
    root.style.setProperty('--accent-hover', theme.primaryColor);
    root.style.setProperty('--accent-light', `color-mix(in srgb, ${theme.primaryColor} 10%, white)`);
  }
  if (isAuthCssColor(theme.textColor)) root.style.setProperty('--text', theme.textColor);

  const radius = Number(theme.borderRadius);
  if (Number.isFinite(radius) && radius >= 4 && radius <= 12) {
    root.style.setProperty('--partner-radius', `${radius}px`);
  }

  if (theme.fontFamily && theme.fontFamily !== 'system' && AUTH_FONT_RE.test(theme.fontFamily)) {
    root.style.setProperty('--partner-font-family', `${theme.fontFamily}, Inter, system-ui, -apple-system, sans-serif`);
  }

  setPlainText('authPartnerHeadline', `Create your ID for ${clientLabel}`);
  setPlainText('authPartnerSubhead', theme.subhead || AUTH_PARTNER_DEFAULTS.subhead);
  setPlainText('proofHeroBadge', 'Partner login proof');
  setPlainText('proofHeroTitle', `Create proof for ${clientLabel}`);
  setPlainText('proofHeroCopy', 'Create your OTRUST ID in this branded flow, then continue back to the hosted Auth screen.');

  const proofTypeCopy = document.querySelector('#proof-type-identity p');
  if (proofTypeCopy) {
    proofTypeCopy.textContent = 'Create the ID required for this Auth flow';
  }

  const generateButton = document.getElementById('btn-generate-age');
  if (generateButton) generateButton.textContent = 'Create ID and Continue';

  const verifyTab = document.querySelector('.tab[data-tab="verify"]');
  if (verifyTab) verifyTab.style.display = 'none';

  const partnerLogo = document.getElementById('authPartnerLogo');
  if (partnerLogo && isAuthHttpsUrl(theme.logoUrl)) {
    partnerLogo.src = theme.logoUrl;
    partnerLogo.alt = theme.logoAlt || `${clientLabel} logo`;
    partnerLogo.hidden = false;
  }
}

function buildAuthReturnUrl(proofId) {
  if (!authChallengeId) return null;
  const safeProofId = typeof proofId === 'string' && /^[a-zA-Z0-9_-]{3,100}$/.test(proofId) ? proofId : '';
  const url = new URL('/auth/login', window.location.origin);
  url.searchParams.set('challenge', authChallengeId);
  if (authThemeId && AUTH_THEME_ID_RE.test(authThemeId)) {
    url.searchParams.set('theme_id', authThemeId);
  }
  if (safeProofId) url.searchParams.set('proof_id', safeProofId);
  return `${url.pathname}${url.search}`;
}

function authReturnActionHtml(proofId) {
  const returnUrl = buildAuthReturnUrl(proofId);
  if (!returnUrl) return '';
  return `
    <div class="auth-return-action">
      <p>Your ID is ready. Continue back to the partner Auth screen and enter your PIN.</p>
      <a href="${returnUrl}" class="btn btn-primary">Continue to Auth</a>
    </div>
  `;
}

function isAuthCssColor(value) {
  return typeof value === 'string' && AUTH_CSS_COLOR_RE.test(value);
}

function isAuthHttpsUrl(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function setPlainText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

// Tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// Proof type selection
let selectedType = null;

function selectProofType(type) {
  document.querySelectorAll('.proof-type').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.proof-form').forEach(el => el.classList.remove('active'));
  
  const typeEl = document.querySelector(`.proof-type[data-type="${type}"]`);
  const formEl = document.getElementById(`form-${type}`);
  
  if (typeEl) typeEl.classList.add('selected');
  if (formEl) formEl.classList.add('active');
  selectedType = type;
}

// ========================================
// Document Data Storage
// ========================================
let ageDocumentData = null;
let incomeDocumentData = null;
let ageVerificationResult = null;

// ========================================
// NOTE: Manual birth date entry has been REMOVED for security.
// All proofs now require a valid ID document with OCR-readable data.
// This prevents users from uploading arbitrary images and entering
// fake birth dates manually.
// ========================================

// ========================================
// Age Document Upload - Step 1
// ========================================

function initAgeUpload() {
  const ageUploadZone = document.getElementById('age-upload-zone');
  const ageFileInput = document.getElementById('age-file-input');
  const ageClearDoc = document.getElementById('age-clear-doc');
  const btnSkipLiveness = document.getElementById('btn-skip-liveness');
  const btnReadNfc = document.getElementById('btn-read-nfc');
  const btnSkipNfc = document.getElementById('btn-skip-nfc');

  if (ageUploadZone) {
    ageUploadZone.addEventListener('click', () => ageFileInput?.click());
    
    ageUploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      ageUploadZone.classList.add('drag-over');
    });
    
    ageUploadZone.addEventListener('dragleave', () => {
      ageUploadZone.classList.remove('drag-over');
    });
    
    ageUploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      ageUploadZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) processAgeDocument(file);
    });
  }
  
  if (ageFileInput) {
    ageFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) processAgeDocument(file);
    });
  }
  
  if (ageClearDoc) {
    ageClearDoc.addEventListener('click', clearAgeDocument);
  }
  
  if (btnSkipLiveness) {
    btnSkipLiveness.addEventListener('click', skipLivenessCheck);
  }
  
  if (btnReadNfc) {
    btnReadNfc.addEventListener('click', startNfcRead);
  }
  
  if (btnSkipNfc) {
    btnSkipNfc.addEventListener('click', skipNfcStep);
  }
}

async function processAgeDocument(file) {
  const ageUploadZone = document.getElementById('age-upload-zone');
  const agePreview = document.getElementById('age-preview');
  const agePreviewImg = document.getElementById('age-preview-img');
  const ageOcrStatus = document.getElementById('age-ocr-status');
  const ageFaceStatus = document.getElementById('age-face-status');
  const birthDateInput = document.getElementById('birth-date');
  const ageConfidence = document.getElementById('age-confidence');
  
  console.log(' Processing age document:', file.name);
  
  ageUploadZone.style.display = 'none';
  agePreview.style.display = 'block';
  ageOcrStatus.innerHTML = '<span class="spinner"></span> Loading OCR engine...';
  
  const reader = new FileReader();
  reader.onload = (e) => {
    agePreviewImg.src = e.target.result;
  };
  reader.readAsDataURL(file);
  
  // Track if face was found on document (for validation)
  let hasFaceOnDocument = false;
  
  try {
    // Step 1a: OCR - Extract birth date
    if (!window.DocumentOCR) {
      throw new Error('OCR library not loaded. Refresh the page.');
    }
    
    ageOcrStatus.innerHTML = '<span class="spinner"></span> Scanning document...';
    
    const ocrResult = await window.DocumentOCR.extractBirthDate(file, (progress) => {
      if (progress.stage === 'ocr') {
        ageOcrStatus.innerHTML = `<span class="spinner"></span> Scanning... ${progress.progress}%`;
      }
    });
    
    // Step 1b: Face detection on ID (do this early for validation)
    if (window.FaceVerify) {
      ageFaceStatus.style.display = 'block';
      ageFaceStatus.innerHTML = '<span class="spinner"></span> Detecting face on ID...';
      
      try {
        const faceResult = await window.FaceVerify.extractFaceFromID(file);
        hasFaceOnDocument = faceResult.success;
        
        if (faceResult.success) {
          ageFaceStatus.innerHTML = '✅ Face detected on ID';
          console.log('Face detection score:', faceResult.score);
        } else {
          ageFaceStatus.innerHTML = '⚠️ No face found on ID';
        }
      } catch (faceErr) {
        console.error('Face detection error:', faceErr);
        ageFaceStatus.innerHTML = '⚠️ Face detection failed';
      }
    }
    
    // Step 1c: VALIDATE that this is actually an ID document
    ageOcrStatus.innerHTML = '<span class="spinner"></span> Validating ID document...';
    
    const validation = window.DocumentOCR.validateIDDocument(
      ocrResult.rawText,
      ocrResult.source === 'MRZ' ? ocrResult.dates[0] : null,
      ocrResult.dates,
      hasFaceOnDocument
    );
    
    console.log('📋 ID Validation result:', validation);
    
    // If document is NOT valid, reject it
    if (!validation.isValid) {
      ageOcrStatus.innerHTML = `
        <div class="validation-error" style="background: #fee; border: 1px solid #e74c3c; border-radius: 8px; padding: 16px;">
          <p style="color: #c0392b; font-weight: 600; margin-bottom: 12px;">
            This doesn't appear to be a valid ID document
          </p>
          <p style="font-size: 14px; margin-bottom: 12px; color: #333;">
            Please upload a passport, driver's license, or national ID card.
          </p>
          <ul style="font-size: 13px; color: #666; margin: 0; padding-left: 20px;">
            ${validation.reasons.slice(1).map(r => `<li>${r}</li>`).join('')}
          </ul>
          <button id="btn-retry-upload" style="
            margin-top: 16px;
            padding: 10px 20px;
            background: #c0392b;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
          ">Try with a different image</button>
        </div>
      `;
      
      // Add retry button handler
      setTimeout(() => {
        const btn = document.getElementById('btn-retry-upload');
        if (btn) btn.addEventListener('click', clearAgeDocument);
      }, 0);
      
      ageConfidence.textContent = 'Invalid document';
      ageConfidence.className = 'confidence low';
      return; // Stop processing - not a valid ID
    }
    
    // Document is valid - continue with processing
    ageDocumentData = {
      file,
      hash: ocrResult.documentHash,
      rawText: ocrResult.rawText,
      birthDate: null,
      personnummer: ocrResult.personnummer || null,
      name: null,
      idFaceDescriptor: null,
      validationConfidence: validation.confidence
    };
    
    if (ocrResult.dates.length > 0) {
      const best = ocrResult.dates[0];
      birthDateInput.value = best.date;
      ageDocumentData.birthDate = best.date;
      
      // Store name if found (from best result or from ocrResult)
      const nameData = best.name || ocrResult.name;
      if (nameData) {
        ageDocumentData.name = nameData;
        console.log('📝 Name stored:', nameData);
        
        // Display name in UI
        const nameField = document.getElementById('name-field');
        const nameInput = document.getElementById('extracted-name');
        if (nameField && nameInput) {
          nameInput.value = nameData.fullName || `${nameData.givenNames || ''} ${nameData.surname || ''}`.trim();
          nameField.style.display = 'flex';
        }
      }
      
      // Store personnummer if found (for unique identity proof)
      if (best.personnummer) {
        ageDocumentData.personnummer = best.personnummer;
        console.log('\ud83d\udcdd Personnummer stored for identity proof:', best.personnummer);
        
        // Display personnummer in UI (masked for privacy)
        const pnrField = document.getElementById('pnr-field');
        const pnrInput = document.getElementById('extracted-pnr');
        if (pnrField && pnrInput) {
          // Mask middle digits: 850309-**** 
          const masked = best.personnummer.replace(/^(\d{6})-?(\d{4})$/, '$1-****');
          pnrInput.value = masked;
          pnrField.style.display = 'flex';
        }
      } else if (ocrResult.personnummer) {
        ageDocumentData.personnummer = ocrResult.personnummer;
        console.log('\ud83d\udcdd Personnummer from OCR result:', ocrResult.personnummer);
        
        const pnrField = document.getElementById('pnr-field');
        const pnrInput = document.getElementById('extracted-pnr');
        if (pnrField && pnrInput) {
          const masked = ocrResult.personnummer.replace(/^(\d{6})-?(\d{4})$/, '$1-****');
          pnrInput.value = masked;
          pnrField.style.display = 'flex';
        }
      }
      
      let confClass = 'high';
      let confText = '✓ High confidence';
      if (best.confidence < 0.7) {
        confClass = 'low';
        confText = 'Low confidence';
      } else if (best.confidence < 0.9) {
        confClass = 'medium';
        confText = ' Medium confidence';
      }
      ageConfidence.textContent = confText;
      ageConfidence.className = 'confidence ' + confClass;
      ageOcrStatus.innerHTML = '✅ ID verified - Birth date found!';
      
      // Update face status with descriptor if we detected face
      if (hasFaceOnDocument && window.FaceVerify) {
        try {
          const faceResult = await window.FaceVerify.extractFaceFromID(file);
          if (faceResult.success) {
            ageDocumentData.idFaceDescriptor = faceResult.descriptor;
          }
        } catch (e) { /* already logged */ }
      }
      
      // Move to step 2 (selfie verification) or final step
      if (hasFaceOnDocument && ageDocumentData.idFaceDescriptor) {
        setTimeout(() => startLivenessCheck(), 500);
      } else {
        setTimeout(() => showFinalStep({ faceVerified: false }), 1000);
      }
    } else {
      // This shouldn't happen if validation passed, but handle it
      ageOcrStatus.innerHTML = `
        <div class="validation-error" style="background: #fef9e7; border: 1px solid #f1c40f; border-radius: 8px; padding: 16px;">
          <p style="color: #9a7b0a; font-weight: 600; margin-bottom: 12px;">
            Could not read birth date
          </p>
          <p style="font-size: 14px; margin-bottom: 12px; color: #333;">
            This looks like an ID document but we couldn't read the date.
          </p>
          <p style="font-size: 13px; color: #666;">
            Try with better lighting or a sharper image.
          </p>
          <button id="btn-retry-upload" style="
            margin-top: 16px;
            padding: 10px 20px;
            background: #9a7b0a;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
          ">Try with a different image</button>
        </div>
      `;
      
      setTimeout(() => {
        const btn = document.getElementById('btn-retry-upload');
        if (btn) btn.addEventListener('click', clearAgeDocument);
      }, 0);
      
      ageConfidence.textContent = 'Could not read date';
      ageConfidence.className = 'confidence low';
    }
    
  } catch (err) {
    console.error('Document processing error:', err);
    // SECURITY: Use textContent to prevent XSS from error messages
    ageOcrStatus.textContent = '❌ Error: ' + (err.message || 'Unknown error');
  }
}

function clearAgeDocument() {
  const ageUploadZone = document.getElementById('age-upload-zone');
  const agePreview = document.getElementById('age-preview');
  const birthDateInput = document.getElementById('birth-date');
  const ageFileInput = document.getElementById('age-file-input');
  
  // Reset all steps
  document.getElementById('age-step-1').style.display = 'block';
  document.getElementById('age-step-1').classList.add('active');
  document.getElementById('age-step-2').style.display = 'none';
  document.getElementById('age-step-3').style.display = 'none';
  document.getElementById('age-step-final').style.display = 'none';
  
  ageUploadZone.style.display = 'block';
  agePreview.style.display = 'none';
  birthDateInput.value = '';
  ageFileInput.value = '';
  ageDocumentData = null;
  ageVerificationResult = null;
  
  // Stop camera if running
  if (window.FaceVerify) {
    window.FaceVerify.stopCamera();
  }
}

// ========================================
// Step 2: Liveness Check (Selfie + Blink)
// ========================================

async function startLivenessCheck() {
  const step1 = document.getElementById('age-step-1');
  const step2 = document.getElementById('age-step-2');
  const webcam = document.getElementById('age-webcam');
  const webcamStatus = document.getElementById('age-webcam-status');
  const livenessStatus = document.getElementById('liveness-status');
  
  // Show step 2
  step1.classList.remove('active');
  step1.classList.add('completed');
  step2.style.display = 'block';
  step2.classList.add('active');
  
  // Always try to start camera directly first
  webcamStatus.innerHTML = '<span class="spinner"></span> Starting camera...';
  livenessStatus.innerHTML = '';
  
  try {
    const cameraResult = await window.FaceVerify.startCamera(webcam);
    
    if (cameraResult.success) {
      // Camera started! Continue with liveness check
      webcamStatus.innerHTML = '📹 Camera active';
      livenessStatus.textContent = 'Position your face in the frame and blink twice';
      await continueWithLiveness(webcam, webcamStatus, livenessStatus);
    } else {
      // Camera failed - show instructions
      webcamStatus.innerHTML = `❌ ${cameraResult.error}`;
      showCameraBlockedInstructions(livenessStatus);
    }
  } catch (err) {
    console.error('Camera error:', err);
    webcamStatus.innerHTML = `❌ ${err.message}`;
    showCameraBlockedInstructions(livenessStatus);
  }
}

function showCameraBlockedInstructions(livenessStatus) {
  livenessStatus.innerHTML = `
    <div style="text-align: center; padding: 20px;">
      <p style="color: #e74c3c; margin-bottom: 15px;">
        <strong> Camera could not be started</strong>
      </p>
      <p style="margin-bottom: 15px;">Here's how to fix it:</p>
      <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; text-align: left; max-width: 320px; margin: 0 auto;">
        <ol style="font-size: 13px; margin: 0; padding-left: 20px;">
          <li style="margin-bottom: 8px;">Click the <strong>lock icon</strong> in the address bar</li>
          <li style="margin-bottom: 8px;">Set <strong>Camera</strong> to "Allow"</li>
          <li style="margin-bottom: 8px;">Click <strong>"Reset permissions"</strong></li>
          <li>Reload the page</li>
        </ol>
      </div>
      <button id="btn-retry-camera" style="
        margin-top: 15px;
        padding: 12px 24px;
        background: var(--primary);
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
      ">Try again</button>
      <p style="margin-top: 15px; font-size: 12px; color: #888;">
        Or click "Skip verification" below for lower trust
      </p>
    </div>
  `;
  
  setTimeout(() => {
    const btn = document.getElementById('btn-retry-camera');
    if (btn) {
      btn.addEventListener('click', () => location.reload());
    }
  }, 0);
}

async function oldRequestAndStartCamera(webcam, webcamStatus, livenessStatus, permissionStatus = 'unknown') {
  // Check permission if not passed
  if (permissionStatus === 'unknown') {
    try {
      const perm = await navigator.permissions.query({ name: 'camera' });
      permissionStatus = perm.state;
    } catch (e) {}
  }
  
  try {
    const cameraResult = await window.FaceVerify.startCamera(webcam);
    
    if (!cameraResult.success) {
      webcamStatus.innerHTML = `❌ ${cameraResult.error}`;
      
      // Show different message based on permission state
      const isDenied = permissionStatus === 'denied';
      
      livenessStatus.innerHTML = `
        <div style="text-align: center; padding: 20px;">
          ${isDenied ? `
            <p style="color: #e74c3c; margin-bottom: 15px;">
              <strong> Camera is blocked for this site</strong>
            </p>
            <p style="margin-bottom: 15px;">You have previously denied access. Here's how to fix it:</p>
            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; text-align: left; max-width: 320px; margin: 0 auto;">
              <ol style="font-size: 13px; margin: 0; padding-left: 20px;">
                <li style="margin-bottom: 8px;">Click the <strong>lock icon</strong> in the address bar</li>
                <li style="margin-bottom: 8px;">Click <strong>"Site settings"</strong></li>
                <li style="margin-bottom: 8px;">Change <strong>Camera</strong> from "Block" to "Allow"</li>
                <li>Come back and reload the page</li>
              </ol>
            </div>
            <button onclick="location.reload()" style="
              margin-top: 15px;
              padding: 10px 20px;
              background: var(--primary);
              color: white;
              border: none;
              border-radius: 6px;
              cursor: pointer;
            ">I've changed it - reload</button>
          ` : `
            <p style="margin-bottom: 15px;">Camera could not be started. Click to try again:</p>
            <button id="btn-request-camera" style="
              padding: 12px 24px;
              font-size: 16px;
              background: var(--primary);
              color: white;
              border: none;
              border-radius: 8px;
              cursor: pointer;
              display: flex;
              align-items: center;
              gap: 8px;
              margin: 0 auto;
            ">
              📹 Allow camera
            </button>
          `}
          <p style="margin-top: 15px; font-size: 12px; color: #888;">
            Or click "Skip verification" below for lower trust
          </p>
        </div>
      `;
      // Add click handler
      setTimeout(() => {
        const btn = document.getElementById('btn-request-camera');
        if (btn) {
          btn.addEventListener('click', async () => {
            btn.innerHTML = '<span class="spinner"></span> Requesting access...';
            // Request camera again
            const retry = await window.FaceVerify.startCamera(webcam);
            if (retry.success) {
              webcamStatus.innerHTML = '📹 Camera active';
              livenessStatus.textContent = 'Position your face in the frame and blink twice';
              continueWithLiveness(webcam, webcamStatus, livenessStatus);
            } else {
              // Detect browser
              const isChrome = /Chrome/.test(navigator.userAgent) && !/Edg/.test(navigator.userAgent);
              const isEdge = /Edg/.test(navigator.userAgent);
              const isFirefox = /Firefox/.test(navigator.userAgent);
              const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
              
              let browserInstructions = '';
              let settingsLink = '';
              
              if (isChrome) {
                browserInstructions = `
                  <p><strong>Chrome:</strong></p>
                  <ol style="text-align: left; font-size: 13px;">
                    <li>Click the lock icon in the address bar</li>
                    <li>Change "Camera" to "Allow"</li>
                    <li>Reload the page</li>
                  </ol>
                `;
                settingsLink = 'chrome://settings/content/camera';
              } else if (isEdge) {
                browserInstructions = `
                  <p><strong>Edge:</strong></p>
                  <ol style="text-align: left; font-size: 13px;">
                    <li>Click the lock icon in the address bar</li>
                    <li>Click "Permissions for this site"</li>
                    <li>Change "Camera" to "Allow"</li>
                  </ol>
                `;
                settingsLink = 'edge://settings/content/camera';
              } else if (isFirefox) {
                browserInstructions = `
                  <p><strong>Firefox:</strong></p>
                  <ol style="text-align: left; font-size: 13px;">
                    <li>Click the lock icon in the address bar</li>
                    <li>Click "Connection secure" → "More information"</li>
                    <li>Under "Permissions" → "Use the camera" → "Allow"</li>
                  </ol>
                `;
              } else if (isSafari) {
                browserInstructions = `
                  <p><strong>Safari:</strong></p>
                  <ol style="text-align: left; font-size: 13px;">
                    <li>Safari → Settings → Websites → Camera</li>
                    <li>Find localhost and select "Allow"</li>
                  </ol>
                `;
              } else {
                browserInstructions = `
                  <p>Click the lock icon in the address bar and allow camera.</p>
                `;
              }
              
              btn.outerHTML = `
                <div style="text-align: center;">
                  <p style="color: #e74c3c; margin-bottom: 15px;">❌ Camera is blocked in ${isChrome ? 'Chrome' : isEdge ? 'Edge' : isFirefox ? 'Firefox' : isSafari ? 'Safari' : 'your browser'}</p>
                  <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 10px 0;">
                    ${browserInstructions}
                  </div>
                  <div style="display: flex; gap: 10px; justify-content: center; margin-top: 15px;">
                    <button onclick="location.reload()" style="
                      padding: 10px 20px;
                      background: var(--primary);
                      color: white;
                      border: none;
                      border-radius: 6px;
                      cursor: pointer;
                    ">Reload after change</button>
                  </div>
                </div>
              `;
            }
          });
        }
      }, 0);
      return;
    }
    
    webcamStatus.innerHTML = '📹 Camera active';
    livenessStatus.textContent = 'Position your face in the frame and blink twice';
    
    await continueWithLiveness(webcam, webcamStatus, livenessStatus);
    
  } catch (err) {
    console.error('Liveness check error:', err);
    webcamStatus.innerHTML = `❌ Error: ${err.message}`;
  }
}

async function continueWithLiveness(webcam, webcamStatus, livenessStatus) {
    // Start liveness detection
    const livenessResult = await window.FaceVerify.performLivenessCheck(webcam, (progress) => {
      if (progress.faceDetected) {
        livenessStatus.textContent = `Blinks: ${progress.blinkCount}/${progress.requiredBlinks} - Keep blinking!`;
        
        // Update blink dots
        if (progress.blinkCount >= 1) document.getElementById('blink-1').classList.add('detected');
        if (progress.blinkCount >= 2) document.getElementById('blink-2').classList.add('detected');
      } else {
        livenessStatus.textContent = 'Move your face into the frame';
      }
    }, 20000); // 20 second timeout
    
    if (livenessResult.success) {
      livenessStatus.textContent = '✅ Liveness verified!';
      livenessStatus.classList.add('success');
      
      // Compare faces
      webcamStatus.innerHTML = '<span class="spinner"></span> Comparing faces...';
      
      const matchResult = await window.FaceVerify.compareFaces(
        ageDocumentData.idFaceDescriptor,
        livenessResult.descriptor
      );
      
      ageVerificationResult = {
        livenessVerified: true,
        blinkCount: livenessResult.blinkCount,
        faceMatch: matchResult.match,
        similarity: matchResult.similarity,
        nfcVerified: false
      };
      
      if (matchResult.match) {
        webcamStatus.innerHTML = `✅ Face match: ${matchResult.similarity}% similarity`;
        
        // Stop camera after successful verification
        window.FaceVerify?.stopCamera();
        
        // Check if NFC is available
        if (window.FaceVerify.isNFCSupported()) {
          setTimeout(() => showNfcStep(), 1000);
        } else {
          setTimeout(() => showFinalStep(ageVerificationResult), 1000);
        }
      } else {
        // Low match - stop camera and offer retry
        window.FaceVerify?.stopCamera();
        
        webcamStatus.innerHTML = `
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <span>Face match: ${matchResult.similarity}% (low similarity)</span>
            <button id="btn-retry-face" style="
              padding: 6px 12px;
              font-size: 13px;
              background: var(--primary);
              color: white;
              border: none;
              border-radius: 6px;
              cursor: pointer;
            ">Try Again</button>
            <button id="btn-continue-anyway" style="
              padding: 6px 12px;
              font-size: 13px;
              background: #6c757d;
              color: white;
              border: none;
              border-radius: 6px;
              cursor: pointer;
            ">Continue Anyway →</button>
          </div>
        `;
        
        // Add handlers
        setTimeout(() => {
          const retryBtn = document.getElementById('btn-retry-face');
          const continueBtn = document.getElementById('btn-continue-anyway');
          
          if (retryBtn) {
            retryBtn.addEventListener('click', () => {
              // Reset and restart liveness check
              document.getElementById('blink-1')?.classList.remove('detected');
              document.getElementById('blink-2')?.classList.remove('detected');
              webcamStatus.innerHTML = '<span class="spinner"></span> Starting camera...';
              startLivenessCheck();
            });
          }
          
          if (continueBtn) {
            continueBtn.addEventListener('click', () => {
              ageVerificationResult.faceMatch = false;
              showFinalStep(ageVerificationResult);
            });
          }
        }, 0);
        
        ageVerificationResult.faceMatch = false;
        // Don't auto-proceed - let user retry or continue
      }
    } else {
      // Liveness failed - stop camera and offer retry
      window.FaceVerify?.stopCamera();
      
      livenessStatus.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          <span>${livenessResult.error}</span>
          <button id="btn-retry-liveness" style="
            padding: 6px 12px;
            font-size: 13px;
            background: var(--primary);
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
          ">Try Again</button>
        </div>
      `;
      
      setTimeout(() => {
        const retryBtn = document.getElementById('btn-retry-liveness');
        if (retryBtn) {
          retryBtn.addEventListener('click', () => {
            document.getElementById('blink-1')?.classList.remove('detected');
            document.getElementById('blink-2')?.classList.remove('detected');
            livenessStatus.innerHTML = '<span class="spinner"></span> Starting camera...';
            startLivenessCheck();
          });
        }
      }, 0);
      
      ageVerificationResult = { livenessVerified: false };
    }
}

function skipLivenessCheck() {
  window.FaceVerify?.stopCamera();
  
  ageVerificationResult = {
    livenessVerified: false,
    faceMatch: false,
    skippedLiveness: true,
    nfcVerified: false
  };
  
  showFinalStep(ageVerificationResult);
}

// ========================================
// Step 3: NFC (Optional)
// ========================================

function showNfcStep() {
  const step2 = document.getElementById('age-step-2');
  const step3 = document.getElementById('age-step-3');
  
  step2.classList.remove('active');
  step2.classList.add('completed');
  step3.style.display = 'block';
  step3.classList.add('active');
}

async function startNfcRead() {
  const nfcStatus = document.getElementById('nfc-status');
  nfcStatus.innerHTML = '<span class="spinner"></span> Hold your passport to the phone...';
  
  const result = await window.FaceVerify.readNFCChip();
  
  if (result.success) {
    nfcStatus.innerHTML = '✅ NFC chip verified!';
    ageVerificationResult.nfcVerified = true;
    ageVerificationResult.nfcSerial = result.serialNumber;
    setTimeout(() => showFinalStep(ageVerificationResult), 1000);
  } else {
    nfcStatus.innerHTML = `${result.error}. ${result.hint || ''}`;
  }
}

function skipNfcStep() {
  showFinalStep(ageVerificationResult);
}

// ========================================
// Final Step: Summary + Generate Proof
// ========================================

function showFinalStep(verification) {
  // Hide other steps
  document.getElementById('age-step-1').classList.remove('active');
  document.getElementById('age-step-1').classList.add('completed');
  
  const step2 = document.getElementById('age-step-2');
  const step3 = document.getElementById('age-step-3');
  
  if (step2.style.display !== 'none') {
    step2.classList.remove('active');
    step2.classList.add('completed');
  }
  if (step3.style.display !== 'none') {
    step3.classList.remove('active');
    step3.classList.add('completed');
  }
  
  // Show final step
  const stepFinal = document.getElementById('age-step-final');
  stepFinal.style.display = 'block';
  stepFinal.classList.add('active');
  
  // Build verification summary
  const summary = document.getElementById('age-verification-summary');
  
  let level = 1; // Base level: document uploaded
  let levelText = 'Basic';
  
  const checks = [];
  
  checks.push({
    name: 'ID Document Uploaded',
    passed: true,
    icon: ''
  });
  
  if (verification?.faceMatch) {
    checks.push({
      name: `Face Match (${verification.similarity}% similarity)`,
      passed: true,
      icon: ''
    });
    level = 2;
    levelText = 'Verified';
  } else if (verification?.livenessVerified) {
    checks.push({
      name: 'Liveness Check',
      passed: true,
      icon: ''
    });
    checks.push({
      name: 'Face Match',
      passed: false,
      icon: ''
    });
    level = 1;
    levelText = 'Partial';
  } else if (verification?.skippedLiveness) {
    checks.push({
      name: 'Face Verification',
      passed: false,
      skipped: true,
      icon: ''
    });
    level = 1;
    levelText = 'Basic';
  }
  
  if (verification?.nfcVerified) {
    checks.push({
      name: 'NFC Chip Verified',
      passed: true,
      icon: ''
    });
    level = 3;
    levelText = 'High Trust';
  }
  
  summary.innerHTML = `
    <h4>✅ Verification Complete</h4>
    <div class="verification-checks">
      ${checks.map(c => `
        <div class="verification-check ${c.passed ? 'passed' : (c.skipped ? 'skipped' : 'failed')}">
          <span class="icon">${c.passed ? '✓' : (c.skipped ? '−' : '✗')}</span>
          <span>${c.icon} ${c.name}</span>
        </div>
      `).join('')}
    </div>
    <div class="verification-level">
      Trust Level: <strong>${levelText}</strong> (Level ${level}/3)
    </div>
  `;
  
  ageVerificationResult = { ...verification, level, levelText };
}

// ========================================
// Income Document Upload  
// ========================================

function initIncomeUpload() {
  const incomeUploadZone = document.getElementById('income-upload-zone');
  const incomeFileInput = document.getElementById('income-file-input');
  const incomeClearDoc = document.getElementById('income-clear-doc');

  if (incomeUploadZone) {
    incomeUploadZone.addEventListener('click', () => incomeFileInput?.click());
    
    incomeUploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      incomeUploadZone.classList.add('drag-over');
    });
    
    incomeUploadZone.addEventListener('dragleave', () => {
      incomeUploadZone.classList.remove('drag-over');
    });
    
    incomeUploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      incomeUploadZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) processIncomeDocument(file);
    });
  }
  
  if (incomeFileInput) {
    incomeFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) processIncomeDocument(file);
    });
  }
  
  if (incomeClearDoc) {
    incomeClearDoc.addEventListener('click', clearIncomeDocument);
  }
}

async function processIncomeDocument(file) {
  const incomeUploadZone = document.getElementById('income-upload-zone');
  const incomePreview = document.getElementById('income-preview');
  const incomePreviewImg = document.getElementById('income-preview-img');
  const incomeOcrStatus = document.getElementById('income-ocr-status');
  const incomeParsedData = document.getElementById('income-parsed-data');
  const incomeMinSelect = document.getElementById('income-min-select');
  const btnGenerateIncome = document.getElementById('btn-generate-income');
  const incomeAmountInput = document.getElementById('income-amount');
  const incomeConfidence = document.getElementById('income-confidence');
  
  console.log(' Processing income document:', file.name);
  
  incomeUploadZone.style.display = 'none';
  incomePreview.style.display = 'block';
  incomeOcrStatus.innerHTML = '<span class="spinner"></span> Loading OCR engine...';
  
  const reader = new FileReader();
  reader.onload = (e) => {
    incomePreviewImg.src = e.target.result;
  };
  reader.readAsDataURL(file);
  
  try {
    if (!window.DocumentOCR) {
      throw new Error('OCR library not loaded. Refresh the page.');
    }
    
    incomeOcrStatus.innerHTML = '<span class="spinner"></span> Scanning document...';
    
    const result = await window.DocumentOCR.extractIncome(file, (progress) => {
      if (progress.stage === 'ocr') {
        incomeOcrStatus.innerHTML = `<span class="spinner"></span> Scanning... ${progress.progress}%`;
      }
    });
    
    incomeDocumentData = {
      file,
      hash: result.documentHash,
      rawText: result.rawText
    };
    
    if (result.amounts.length > 0) {
      const best = result.amounts[0];
      incomeAmountInput.value = best.amount;
      
      let confClass = 'high';
      let confText = '✓ High confidence';
      if (best.confidence < 0.6) {
        confClass = 'low';
        confText = 'Low confidence - please verify';
      } else if (best.confidence < 0.8) {
        confClass = 'medium';
        confText = ' Medium confidence';
      }
      incomeConfidence.textContent = confText;
      incomeConfidence.className = 'confidence ' + confClass;
      
      incomeOcrStatus.innerHTML = '✅ Income amount found!';
      incomeParsedData.style.display = 'block';
      incomeMinSelect.style.display = 'block';
      btnGenerateIncome.style.display = 'block';
      
      console.log('Found amounts:', result.amounts);
    } else {
      incomeOcrStatus.innerHTML = 'Could not find income amount. Please enter manually.';
      incomeParsedData.style.display = 'block';
      incomeMinSelect.style.display = 'block';
      btnGenerateIncome.style.display = 'block';
      incomeConfidence.textContent = 'Manual entry';
      incomeConfidence.className = 'confidence low';
    }
  } catch (err) {
    console.error('OCR error:', err);
    // SECURITY: Use textContent to prevent XSS from error messages
    incomeOcrStatus.textContent = '❌ Error: ' + (err.message || 'Unknown error');
    incomeParsedData.style.display = 'block';
    incomeMinSelect.style.display = 'block';
    btnGenerateIncome.style.display = 'block';
  }
}

function clearIncomeDocument() {
  const incomeUploadZone = document.getElementById('income-upload-zone');
  const incomePreview = document.getElementById('income-preview');
  const incomeParsedData = document.getElementById('income-parsed-data');
  const incomeMinSelect = document.getElementById('income-min-select');
  const btnGenerateIncome = document.getElementById('btn-generate-income');
  const incomeAmountInput = document.getElementById('income-amount');
  const incomeFileInput = document.getElementById('income-file-input');
  
  incomeUploadZone.style.display = 'block';
  incomePreview.style.display = 'none';
  incomeParsedData.style.display = 'none';
  incomeMinSelect.style.display = 'none';
  btnGenerateIncome.style.display = 'none';
  incomeAmountInput.value = '';
  incomeFileInput.value = '';
  incomeDocumentData = null;
}

// Initialize upload handlers when DOM is ready
initAgeUpload();
initIncomeUpload();

// ========================================
// Generate Unique Identity Proof
// ========================================

async function generateIdentityProof() {
  const birthDate = document.getElementById('birth-date').value;
  const resultDiv = document.getElementById('result-age');
  const pinInput = document.getElementById('proof-pin');
  const pin = pinInput?.value || '';
  
  // Validate PIN - must be exactly 6 digits
  if (!/^\d{6}$/.test(pin)) {
    showError(resultDiv, 'PIN must be exactly 6 digits');
    if (pinInput) pinInput.focus();
    return;
  }
  
  // Get personnummer from OCR result
  const personnummer = ageDocumentData?.personnummer || ageDocumentData?.documentId;
  
  if (!personnummer) {
    showError(resultDiv, 'No identity document found. Please upload an ID card or driver\'s license first.');
    return;
  }
  
  if (!birthDate) {
    showError(resultDiv, 'Birth date not found. Please upload a valid ID document.');
    return;
  }
  
  resultDiv.innerHTML = `
    <div style="margin-top: 1rem; padding: 1rem; background: var(--bg-muted); border-radius: 8px;">
      <p style="color: var(--text-dim); margin-bottom: 0.5rem;"><strong>Creating Unique Identity ID...</strong></p>
      <p style="color: var(--text-dim); font-size: 0.75rem;">Your personnummer is hashed (one-way) for Sybil-resistance.</p>
      <div class="progress-bar" style="height: 4px; background: var(--border); border-radius: 2px; margin-top: 0.5rem; overflow: hidden;">
        <div class="progress-fill" style="height: 100%; width: 0%; background: var(--accent); transition: width 0.3s;"></div>
      </div>
    </div>
  `;
  
  const progressFill = resultDiv.querySelector('.progress-fill');
  let progress = 0;
  const progressInterval = setInterval(() => {
    progress = Math.min(progress + Math.random() * 15, 90);
    if (progressFill) progressFill.style.width = progress + '%';
  }, 200);
  
  try {
    // Check for recovery token in URL (from revoked identity)
    const urlParams = new URLSearchParams(window.location.search);
    const recoveryToken = urlParams.get('recovery');
    
    const response = await fetch('/api/proof/identity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        personnummer,
        birthDate,
        pin, // Include PIN for encryption
        faceMatch: ageVerificationResult?.faceMatch || false,
        livenessVerified: ageVerificationResult?.livenessVerified || false,
        recoveryToken // Include if doing recovery
      })
    });
    
    const data = await response.json();
    
    clearInterval(progressInterval);
    if (progressFill) progressFill.style.width = '100%';
    
    await new Promise(r => setTimeout(r, 300));
    
    if (data.success) {
      const trustLevel = ageVerificationResult?.levelText || 'Basic';
      const trustColor = ageVerificationResult?.level >= 2 ? 'var(--success)' : 'var(--orange)';
      
      resultDiv.innerHTML = `
        <div class="result">
          <h4>Unique Identity ID Created</h4>
          <div class="result-row">
            <span class="label">Statement</span>
            <span class="value">Verified unique human</span>
          </div>
          <div class="result-row">
            <span class="label">Trust Level</span>
            <span class="value" style="color: ${trustColor}; font-weight: 600;">${trustLevel}</span>
          </div>
          <div class="result-row">
            <span class="label">Verification</span>
            <span class="value" style="font-size: 0.75rem;">
              ${data.verification?.documentVerified ? '✅ Document' : '❌ Document'}
              ${data.verification?.faceMatch ? '✅ Face' : 'Face missing'}
              ${data.verification?.livenessVerified ? '✅ Liveness' : 'Liveness missing'}
            </span>
          </div>
          <div class="result-row">
            <span class="label">ID</span>
            <span class="value" style="font-family: monospace;">${data.proofId}</span>
          </div>
          <div class="result-actions">
            <button class="btn btn-secondary" id="copy-identity-link">Copy verify link</button>
            <a href="${data.shareUrl}" target="_blank" class="btn btn-secondary">Open ID</a>
          </div>
          <div class="result-actions" style="margin-top: 0.5rem;">
            <button class="btn btn-secondary" id="add-apple-wallet" style="background: #000; color: white;">
              Apple Wallet
            </button>
          </div>
        </div>
        
        <!-- CRITICAL: Recovery Backup Section -->
        <div style="background: linear-gradient(135deg, #ff6b35, #e85d04); border-radius: 12px; padding: 1.5rem; margin-top: 1rem; color: white;">
          <h4 style="margin: 0 0 0.75rem 0; display: flex; align-items: center; gap: 0.5rem;">
            ⚠️ CRITICAL: Save Your Recovery Info
          </h4>
          <p style="margin: 0 0 1rem 0; font-size: 0.9rem; opacity: 0.95;">
            Without this information, you can <strong>NEVER</strong> recover your identity if lost. Save it now!
          </p>
          
          <div style="background: rgba(255,255,255,0.15); border-radius: 8px; padding: 0.75rem; margin-bottom: 1rem; font-size: 0.85rem;">
            <strong>🔐 PIN-kod:</strong> Din valda PIN används för inloggning. Den hemliga nyckeln är backup.
          </div>
          
          <div style="background: rgba(0,0,0,0.2); border-radius: 8px; padding: 1rem; margin-bottom: 1rem;">
            <div style="font-size: 0.75rem; opacity: 0.8; margin-bottom: 0.25rem;">Your Secret Key (backup)</div>
            <code style="font-size: 0.65rem; word-break: break-all; display: block; background: rgba(0,0,0,0.3); padding: 0.5rem; border-radius: 4px;">${data.secret}</code>
          </div>
          
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button class="btn" id="download-recovery" style="background: white; color: #e85d04; font-weight: 600;">
              📥 Download Backup File
            </button>
            <button class="btn" id="email-recovery" style="background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3);">
              ✉️ Email to Myself
            </button>
            <button class="btn" id="copy-secret" style="background: rgba(255,255,255,0.2); color: white; border: 1px solid rgba(255,255,255,0.3);">
              📋 Copy Secret
            </button>
          </div>
        </div>
        
        <div style="background: var(--success-bg); border: 1px solid var(--success); border-radius: 8px; padding: 1rem; margin-top: 1rem;">
          <p style="margin: 0; color: var(--success);">
            <strong>One identity per person!</strong><br>
            This proof is linked to your identity hash. You cannot create another one.
          </p>
        </div>
        ${authReturnActionHtml(data.proofId)}
      `;
      
      // Store for later use
      window.lastIdentityProof = data;
      
      // Copy link button
      document.getElementById('copy-identity-link').addEventListener('click', function() {
        const fullUrl = window.location.origin + data.shareUrl;
        navigator.clipboard.writeText(fullUrl);
        this.textContent = '✓ Copied!';
        setTimeout(() => { this.textContent = 'Copy verify link'; }, 2000);
      });
      
      // Copy secret button
      document.getElementById('copy-secret').addEventListener('click', function() {
        navigator.clipboard.writeText(data.secret);
        this.textContent = '✓ Copied!';
        setTimeout(() => this.textContent = 'Copy Secret', 2000);
      });
      
      // Download backup file
      document.getElementById('download-recovery').addEventListener('click', function() {
        const backupData = {
          _warning: "KEEP THIS FILE SAFE! You need it to recover your identity.",
          proofId: data.proofId,
          secret: data.secret,
          commitment: data.commitment,
          shareUrl: window.location.origin + data.shareUrl,
          createdAt: new Date().toISOString(),
          instructions: [
            "1. Store this file in a safe place (cloud storage, USB, etc.)",
            "2. If you lose access, go to your proof page and click 'Report Lost'",
            "3. You will need to re-verify with your ID document",
            "4. Your personnummer links you to your identity - same person = same hash"
          ]
        };
        
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `otrust-identity-backup-${data.proofId}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.innerHTML = '✓ Downloaded!';
        this.style.background = 'var(--success)';
      });
      
      // Email backup
      document.getElementById('email-recovery').addEventListener('click', async function() {
        const email = prompt('Enter your email address to receive your recovery backup:');
        if (!email) return;
        
        this.textContent = 'Sending...';
        this.disabled = true;
        
        try {
          const resp = await fetch('/api/proof/email-backup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email,
              proofId: data.proofId,
              secret: data.secret,
              commitment: data.commitment,
              shareUrl: window.location.origin + data.shareUrl
            })
          });
          
          const result = await resp.json();
          if (result.success) {
            this.innerHTML = '✓ Email Sent!';
            this.style.background = 'var(--success)';
            alert('Recovery backup sent to ' + email + '\n\nCheck your inbox (and spam folder).');
          } else {
            throw new Error(result.error || 'Failed to send email');
          }
        } catch (err) {
          alert('Error sending email: ' + err.message);
          this.textContent = 'Email to Myself';
          this.disabled = false;
        }
      });
      
      // Wallet buttons
      document.getElementById('add-apple-wallet').addEventListener('click', async function() {
        const walletResp = await fetch(`/api/proof/${data.proofId}/wallet?format=apple`);
        const walletData = await walletResp.json();
        alert('Apple Wallet requires a signed certificate. Use the verification link for now:\n\n' + walletData.verifyUrl);
      });
      
      window.lastIdentityProof = data;
    } else if (data.error === 'duplicate_identity') {
      // Already has a proof - show error with link to existing
      resultDiv.innerHTML = `
        <div class="result" style="border-color: var(--orange);">
          <h4 style="color: var(--orange);">Identity Already Verified</h4>
          <p style="margin: 1rem 0;">You already have a unique ID. Each person can only have one.</p>
          <div class="result-row">
            <span class="label">Existing ID</span>
            <span class="value">${data.existingProofId}</span>
          </div>
          <div class="result-row">
            <span class="label">Created</span>
            <span class="value">${new Date(data.createdAt).toLocaleDateString()}</span>
          </div>
          <div class="result-actions">
            <a href="/proof/${data.existingProofId}" target="_blank" class="btn btn-primary">View Your ID</a>
          </div>
        </div>
        ${authReturnActionHtml(data.existingProofId)}
      `;
    } else {
      showError(resultDiv, data.error || 'Failed to create ID');
    }
  } catch (err) {
    clearInterval(progressInterval);
    showError(resultDiv, err.message);
  }
}

// ========================================
// Generate Age Proof
// ========================================

async function generateAgeProof() {
  const birthDate = document.getElementById('birth-date').value;
  const minAge = parseInt(document.getElementById('min-age').value);
  const resultDiv = document.getElementById('result-age');
  
  if (!birthDate) {
    showError(resultDiv, 'Please enter or verify the birth date');
    return;
  }
  
  const birth = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || 
      (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) {
    age--;
  }
  
  if (age < minAge) {
    showError(resultDiv, `Cannot generate proof: age (${age}) is less than required (${minAge})`);
    return;
  }
  
  resultDiv.innerHTML = `
    <div style="margin-top: 1rem; padding: 1rem; background: var(--bg-muted); border-radius: 8px;">
      <p style="color: var(--text-dim); margin-bottom: 0.5rem;"><strong>Generating ZK-SNARK proof...</strong></p>
      <p style="color: var(--text-dim); font-size: 0.75rem;">Your birth date and document never leave this device.</p>
      <div class="progress-bar" style="height: 4px; background: var(--border); border-radius: 2px; margin-top: 0.5rem; overflow: hidden;">
        <div class="progress-fill" style="height: 100%; width: 0%; background: var(--accent); transition: width 0.3s;"></div>
      </div>
    </div>
  `;
  
  const progressFill = resultDiv.querySelector('.progress-fill');
  let progress = 0;
  const progressInterval = setInterval(() => {
    progress = Math.min(progress + Math.random() * 15, 90);
    if (progressFill) progressFill.style.width = progress + '%';
  }, 200);
  
  try {
    let data = null;
    
    // Try browser-side proof generation first
    if (window.ZKProof) {
      try {
        console.log(' Attempting browser-side proof generation...');
        data = await window.ZKProof.generateAgeProof(birthDate, minAge);
        
        if (data && data.success) {
          // Add document hash to proof data
          data.documentHash = ageDocumentData?.hash || null;
          const serverResponse = await window.ZKProof.submitToServer(data);
          data.shareUrl = serverResponse.shareUrl;
          data.proofId = serverResponse.proofId;
          console.log('✅ Browser-side proof generated and submitted!');
        }
      } catch (browserErr) {
        console.warn('Browser-side proof failed:', browserErr.message);
        data = null;
      }
    }
    
    // Fall back to server-side if browser proof failed
    if (!data || !data.success) {
      console.log(' Using server-side proof generation...');
      const response = await fetch('/api/proof/age', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          birthDate, 
          minAge,
          documentHash: ageDocumentData?.hash || null,
          verificationLevel: ageVerificationResult?.level || 1,
          faceVerified: ageVerificationResult?.faceMatch || false,
          livenessVerified: ageVerificationResult?.livenessVerified || false,
          nfcVerified: ageVerificationResult?.nfcVerified || false
        })
      });
      data = await response.json();
    }
    
    clearInterval(progressInterval);
    if (progressFill) progressFill.style.width = '100%';
    
    await new Promise(r => setTimeout(r, 300));
    
    if (data.success) {
      const proofLocation = data.generatedLocally ? 'Generated locally' : 'Generated on server';
      const trustLevel = ageVerificationResult?.levelText || 'Basic';
      const trustColor = ageVerificationResult?.level >= 2 ? 'var(--success)' : 'var(--orange)';
      
      const docHashDisplay = ageDocumentData?.hash 
        ? `<div class="result-row">
            <span class="label">Document</span>
            <span class="value" style="font-size: 0.55rem;">${ageDocumentData.hash.substring(0, 16)}...</span>
          </div>` 
        : '';
      
      const verificationDisplay = `
        <div class="result-row">
          <span class="label">Trust Level</span>
          <span class="value" style="color: ${trustColor}; font-weight: 600;">${trustLevel}</span>
        </div>
      `;
      
      resultDiv.innerHTML = `
        <div class="result">
          <h4>Age ID Generated</h4>
          <div class="result-row">
            <span class="label">Statement</span>
            <span class="value">Age ≥ ${minAge} years</span>
          </div>
          ${verificationDisplay}
          ${docHashDisplay}
          <div class="result-row">
            <span class="label">Commitment</span>
            <span class="value" style="font-size: 0.55rem;">${data.commitment?.substring(0, 20)}...</span>
          </div>
          <div class="result-row">
            <span class="label">Method</span>
            <span class="value" style="font-size: 0.7rem;">${proofLocation}</span>
          </div>
          <div class="result-actions">
            <button class="btn btn-secondary" id="copy-age-link">Copy verify link</button>
            <a href="${data.shareUrl}" target="_blank" class="btn btn-secondary">Open ID</a>
          </div>
        </div>
        <div class="warning-box">
          <strong>Save your secret!</strong> You'll need this to prove ownership later.
          <code>${data.secret}</code>
        </div>
      `;
      
      document.getElementById('copy-age-link').addEventListener('click', function() {
        navigator.clipboard.writeText(data.shareUrl);
        this.textContent = '✓ Copied!';
      });
      
      window.lastAgeProof = data;
    } else {
      showError(resultDiv, data.error);
    }
  } catch (err) {
    clearInterval(progressInterval);
    showError(resultDiv, err.message);
  }
}

// ========================================
// Generate Income Proof
// ========================================

async function generateIncomeProof() {
  const income = parseInt(document.getElementById('income-amount').value);
  const minIncome = parseInt(document.getElementById('min-income').value);
  const resultDiv = document.getElementById('result-income');
  
  if (!income) {
    showError(resultDiv, 'Please enter or verify the income amount');
    return;
  }
  
  if (income < minIncome) {
    showError(resultDiv, `Cannot generate proof: income ($${income.toLocaleString()}) is less than required ($${minIncome.toLocaleString()})`);
    return;
  }
  
  resultDiv.innerHTML = `
    <div style="margin-top: 1rem; padding: 1rem; background: var(--bg-muted); border-radius: 8px;">
      <p style="color: var(--text-dim); margin-bottom: 0.5rem;"><strong>Generating ZK-SNARK proof...</strong></p>
      <p style="color: var(--text-dim); font-size: 0.75rem;">Your exact income is never revealed.</p>
      <div class="progress-bar" style="height: 4px; background: var(--border); border-radius: 2px; margin-top: 0.5rem; overflow: hidden;">
        <div class="progress-fill" style="height: 100%; width: 0%; background: var(--accent); transition: width 0.3s;"></div>
      </div>
    </div>
  `;
  
  const progressFill = resultDiv.querySelector('.progress-fill');
  let progress = 0;
  const progressInterval = setInterval(() => {
    progress = Math.min(progress + Math.random() * 15, 90);
    if (progressFill) progressFill.style.width = progress + '%';
  }, 200);
  
  try {
    let data = null;
    
    if (window.ZKProof) {
      try {
        console.log(' Attempting browser-side income proof...');
        data = await window.ZKProof.generateIncomeProof(income, minIncome);
        
        if (data && data.success) {
          data.documentHash = incomeDocumentData?.hash || null;
          const serverResponse = await window.ZKProof.submitToServer(data);
          data.shareUrl = serverResponse.shareUrl;
          data.proofId = serverResponse.proofId;
          console.log('✅ Browser-side income proof generated!');
        }
      } catch (browserErr) {
        console.warn('Browser-side income proof failed:', browserErr.message);
        data = null;
      }
    }
    
    if (!data || !data.success) {
      console.log(' Using server-side proof generation...');
      const response = await fetch('/api/proof/income', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          income, 
          minIncome,
          documentHash: incomeDocumentData?.hash || null
        })
      });
      data = await response.json();
    }
    
    clearInterval(progressInterval);
    if (progressFill) progressFill.style.width = '100%';
    
    await new Promise(r => setTimeout(r, 300));
    
    if (data.success) {
      const proofLocation = data.generatedLocally ? 'Generated locally' : 'Generated on server';
      const docHashDisplay = incomeDocumentData?.hash 
        ? `<div class="result-row">
            <span class="label">Document</span>
            <span class="value" style="font-size: 0.55rem;">${incomeDocumentData.hash.substring(0, 16)}...</span>
          </div>` 
        : '';
      
      resultDiv.innerHTML = `
        <div class="result">
          <h4>Income ID Generated</h4>
          <div class="result-row">
            <span class="label">Statement</span>
            <span class="value">Income ≥ $${minIncome.toLocaleString()}/year</span>
          </div>
          ${docHashDisplay}
          <div class="result-row">
            <span class="label">Commitment</span>
            <span class="value" style="font-size: 0.55rem;">${data.commitment?.substring(0, 20)}...</span>
          </div>
          <div class="result-row">
            <span class="label">Method</span>
            <span class="value" style="font-size: 0.7rem;">${proofLocation}</span>
          </div>
          <div class="result-actions">
            <button class="btn btn-secondary" id="copy-income-link">Copy verify link</button>
            <a href="${data.shareUrl}" target="_blank" class="btn btn-secondary">Open ID</a>
          </div>
        </div>
      `;
      
      document.getElementById('copy-income-link').addEventListener('click', function() {
        navigator.clipboard.writeText(data.shareUrl);
        this.textContent = '✓ Copied!';
      });
      
      window.lastIncomeProof = data;
    } else {
      showError(resultDiv, data.error);
    }
  } catch (err) {
    clearInterval(progressInterval);
    showError(resultDiv, err.message);
  }
}

async function verifyProofById() {
  const input = document.getElementById('verify-id').value.trim();
  const resultDiv = document.getElementById('verify-result');
  
  if (!input) {
    showError(resultDiv, 'Please enter a proof ID or URL');
    return;
  }
  
  const proofId = input.includes('/') ? input.split('/').pop() : input;
  
  resultDiv.innerHTML = '<p style="margin-top: 1rem; color: var(--text-dim);">Verifying proof...</p>';
  
  try {
    const verifyRes = await fetch(`/api/proof/${proofId}/verify`, { method: 'POST' });
    const verifyData = await verifyRes.json();
    
    if (verifyData.error && verifyData.error === 'Proof not found') {
      showError(resultDiv, 'ID not found');
      return;
    }
    
    const statement = verifyData.statement || 'Verified claim';
    
    resultDiv.innerHTML = `
      <div class="result" style="${verifyData.valid ? '' : 'background: #fee2e2; border-color: #f87171;'}">
        <h4 style="${verifyData.valid ? '' : 'color: #dc2626;'}">${verifyData.valid ? 'ID valid' : 'Invalid ID'}</h4>
        <div class="result-row">
          <span class="label">Type</span>
          <span class="value">${verifyData.proofType || 'Unknown'}</span>
        </div>
        <div class="result-row">
          <span class="label">Statement</span>
          <span class="value">${statement}</span>
        </div>
        ${verifyData.commitment ? `
        <div class="result-row">
          <span class="label">Commitment</span>
          <span class="value" style="font-size: 0.6rem;">${verifyData.commitment}</span>
        </div>
        ` : ''}
        <div class="result-row">
          <span class="label">Verifications</span>
          <span class="value">${verifyData.verifiedCount || 1}×</span>
        </div>
      </div>
    `;
  } catch (err) {
    showError(resultDiv, err.message);
  }
}

function showError(div, message) {
  if (div) {
    div.innerHTML = `<p style="margin-top: 1rem; color: #dc2626;">❌ ${message}</p>`;
  }
}

// Event Listeners
const proofTypeAge = document.getElementById('proof-type-age');
const proofTypeIncome = document.getElementById('proof-type-income');
const proofTypeIdentity = document.getElementById('proof-type-identity');

if (proofTypeAge) proofTypeAge.addEventListener('click', () => selectProofType('age'));
if (proofTypeIncome) proofTypeIncome.addEventListener('click', () => selectProofType('income'));
if (proofTypeIdentity) proofTypeIdentity.addEventListener('click', () => selectProofType('identity'));

// Generate buttons - Identity proof is the default now
const btnGenerateAge = document.getElementById('btn-generate-age');
const btnGenerateIncome = document.getElementById('btn-generate-income');

// Use generateIdentityProof for the main button
if (btnGenerateAge) btnGenerateAge.addEventListener('click', generateIdentityProof);
if (btnGenerateIncome) btnGenerateIncome.addEventListener('click', generateIncomeProof);

// Verify button
const btnVerify = document.getElementById('btn-verify');
if (btnVerify) btnVerify.addEventListener('click', verifyProofById);

console.log('✅ proof-page.js loaded with Unique Identity support');
