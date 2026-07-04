/**
 * Lightweight SV/EN toggle for the timestamp workspace.
 */
(function () {
  const STORAGE_KEY = 'otrust_lang';

  const STRINGS = {
    en: {
      'workspace.topline': 'Local-first record workspace',
      'workspace.title': 'Timestamp, verify and manage records.',
      'workspace.subtitle': 'Hash locally, sign with your browser key, anchor externally, and keep every receipt independently verifiable.',
      'tab.timestamp': 'Timestamp',
      'tab.text': 'Text',
      'tab.verify': 'Verify',
      'tab.history': 'History',
      'tab.more': 'More',
      'history.intro': 'Receipts saved in this browser only — not shared via URL or server lookup.',
      'keys.intro': 'Manage the Ed25519 signing key stored locally in this browser.',
      'backup.title': 'Encrypted backup',
      'backup.desc': 'Export keys and local history as a password-protected file. Import on another browser in this profile.',
      'toast.confirmed': 'Bitcoin confirmed!',
      'share.copy': 'Copy share text',
      'share.png': 'Download share card',
      'sign.topline': 'Signature evidence workspace',
      'sign.title': 'Create and track signing requests.',
      'sign.subtitle': 'Upload temporarily or keep documents local, invite parties, and produce a verifiable signature package.',
      'sign.history.intro': 'Your signed documents list is stored in this browser only.',
      'proof.title': 'ID & verification',
      'proof.subtitle': 'Create commitment-based ID packages and verify proofs independently.'
    },
    sv: {
      'workspace.topline': 'Lokal-först arbetsyta',
      'workspace.title': 'Tidsstämpla, verifiera och hantera kvitton.',
      'workspace.subtitle': 'Hasha lokalt, signera med webbläsarnyckeln, förankra externt och behåll varje kvitto verifierbart.',
      'tab.timestamp': 'Tidsstämpel',
      'tab.text': 'Text',
      'tab.verify': 'Verifiera',
      'tab.history': 'Historik',
      'tab.more': 'Mer',
      'history.intro': 'Kvitton sparas bara i den här webbläsaren — inte via URL eller serversökning.',
      'keys.intro': 'Hantera Ed25519-nyckeln som lagras lokalt i den här webbläsaren.',
      'backup.title': 'Krypterad backup',
      'backup.desc': 'Exportera nycklar och lokal historik som lösenordsskyddad fil. Importera i en annan webbläsare.',
      'toast.confirmed': 'Bitcoin bekräftad!',
      'share.copy': 'Kopiera delningstext',
      'share.png': 'Ladda ner delningskort',
      'sign.topline': 'Signeringsbevis arbetsyta',
      'sign.title': 'Skapa och följ signeringsförfrågningar.',
      'sign.subtitle': 'Ladda upp tillfälligt eller behåll dokument lokalt, bjud in parter och skapa ett verifierbart signaturpaket.',
      'sign.history.intro': 'Din lista över signerade dokument sparas bara i den här webbläsaren.',
      'proof.title': 'ID & verifiering',
      'proof.subtitle': 'Skapa commitment-baserade ID-paket och verifiera bevis självständigt.'
    }
  };

  function getLang() {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'sv' ? 'sv' : 'en';
  }

  function t(key) {
    const lang = getLang();
    return STRINGS[lang][key] || STRINGS.en[key] || key;
  }

  function applyTranslations() {
    const lang = getLang();
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      const value = STRINGS[lang][key];
      if (value) el.textContent = value;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      const value = STRINGS[lang][key];
      if (value) el.placeholder = value;
    });
    const toggle = document.getElementById('lang-toggle');
    if (toggle) toggle.textContent = lang === 'sv' ? 'EN' : 'SV';
  }

  function toggleLang() {
    const next = getLang() === 'sv' ? 'en' : 'sv';
    localStorage.setItem(STORAGE_KEY, next);
    applyTranslations();
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyTranslations();
    document.getElementById('lang-toggle')?.addEventListener('click', toggleLang);
  });

  window.otrustI18n = { t, getLang, applyTranslations, toggleLang };
})();