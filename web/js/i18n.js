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
      'proof.topline': 'Privacy ID workspace',
      'proof.title': 'Create and verify ID packages.',
      'proof.subtitle': 'Build purpose-bound ID packages, verify them independently, and keep raw identity data out of verifier hands.',
      'proof.meta.local': 'Local document parsing',
      'proof.meta.commitment': 'Commitment record',
      'proof.meta.url': 'Reusable ID URL',
      'proof.tab.create': 'Create ID',
      'proof.tab.create.sub': 'Identity package',
      'proof.tab.verify': 'Verify',
      'proof.tab.verify.sub': 'ID or URL',
      'proof.create.step': '01 / Create ID',
      'proof.create.heading': 'ID package',
      'proof.create.desc': 'Create a privacy-preserving ID package from local document checks and scoped disclosure.',
      'status.title': 'OTRUST Status',
      'status.loading': 'Loading…',
      'status.operational': 'Operational',
      'status.error': 'Could not load status.',
      'status.link.transparency': 'Transparency log',
      'status.link.stats': 'Full stats',
      'status.link.health': 'Health JSON'
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
      'proof.topline': 'Integritets-ID arbetsyta',
      'proof.title': 'Skapa och verifiera ID-paket.',
      'proof.subtitle': 'Bygg ändamålsbundna ID-paket, verifiera dem självständigt och håll rå identitetsdata borta från verifierare.',
      'proof.meta.local': 'Lokal dokumenttolkning',
      'proof.meta.commitment': 'Commitment-post',
      'proof.meta.url': 'Återanvändbar ID-URL',
      'proof.tab.create': 'Skapa ID',
      'proof.tab.create.sub': 'Identitetspaket',
      'proof.tab.verify': 'Verifiera',
      'proof.tab.verify.sub': 'ID eller URL',
      'proof.create.step': '01 / Skapa ID',
      'proof.create.heading': 'ID-paket',
      'proof.create.desc': 'Skapa ett integritetsbevarande ID-paket från lokala dokumentkontroller och scoped disclosure.',
      'status.title': 'OTRUST Status',
      'status.loading': 'Laddar…',
      'status.operational': 'Drift',
      'status.error': 'Kunde inte ladda status.',
      'status.link.transparency': 'Transparenslogg',
      'status.link.stats': 'Full statistik',
      'status.link.health': 'Health JSON'
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