(function () {
  const root = document.documentElement;
  if (root.dataset.otrustPolishInitialized === 'true') return;
  root.dataset.otrustPolishInitialized = 'true';
  const themeKey = 'theme';
  const docsPaths = ['/docs', '/docs.html', '/api-docs', '/api-docs.html', '/playground', '/playground/'];
  const docsSectionPaths = new Set([
    '/docs',
    '/about',
    '/transparency',
    '/privacy-policy',
    '/terms',
    '/report-abuse',
    '/notes/why-otrust',
    '/notes-why-otrust',
    '/krisledel',
    '/partners/hemsted',
    '/partners-hemsted'
  ]);
  const developerSectionPaths = new Set([
    '/api-docs',
    '/swagger',
    '/install',
    '/setup',
    '/camera-test',
    '/playground',
    '/auth-login'
  ]);

  function pathOf(url) {
    try {
      return new URL(url, window.location.origin).pathname;
    } catch {
      return '';
    }
  }

  function isCurrentLink(anchor) {
    const rawHref = anchor.getAttribute('href') || '';
    if (rawHref === '#' || rawHref === '') return false;
    if (rawHref.startsWith('#')) return false;
    if (rawHref.includes('#')) return false;

    const hrefUrl = new URL(anchor.href, window.location.origin);
    const hrefPath = hrefUrl.pathname;
    const current = window.location.pathname;
    const normalizedHref = hrefPath.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    const normalizedCurrent = current.replace(/\.html$/, '').replace(/\/$/, '') || '/';

    if ((current === '/' || current === '/index.html') && (hrefPath === '/' || normalizedHref === '/timestamp')) return true;
    if (normalizedHref === '/timestamp' && (normalizedCurrent === '/index' || normalizedCurrent === '/timestamp' || normalizedCurrent.startsWith('/timestamp/'))) return true;
    if (['/sign-in', '/signin', '/login', '/auth-login'].includes(normalizedCurrent) && normalizedHref === '/sign-in') return true;
    if ((normalizedCurrent === '/sign' || normalizedCurrent.startsWith('/sign/')) && normalizedHref === '/sign') return true;
    if ((normalizedCurrent === '/proof' || normalizedCurrent.startsWith('/proof/')) && normalizedHref === '/proof') return true;
    if (normalizedHref === '/docs' && (docsSectionPaths.has(normalizedCurrent) || normalizedCurrent.startsWith('/notes/') || normalizedCurrent.startsWith('/partners/'))) return true;
    if (normalizedHref === '/api-docs' && (developerSectionPaths.has(normalizedCurrent) || normalizedCurrent.startsWith('/playground/'))) return true;
    if ((current === '/docs' || current === '/docs.html') && (hrefPath === '/docs' || hrefPath === '/docs.html')) return true;
    if ((current === '/api-docs' || current === '/api-docs.html') && (hrefPath === '/api-docs' || hrefPath === '/api-docs.html')) return true;
    if (current.startsWith('/playground') && hrefPath.startsWith('/playground')) return true;
    if ((current === '/about' || current === '/about.html') && (hrefPath === '/about' || hrefPath === '/about.html')) return true;
    if (normalizedHref === normalizedCurrent) return true;

    return false;
  }

  function syncActiveLinks(nav) {
    nav.querySelectorAll('.nav-links a, .docs-submenu-bar a, .dashboard-links a').forEach((anchor) => {
      const active = isCurrentLink(anchor);
      anchor.classList.toggle('active', active);
      if (active) anchor.setAttribute('aria-current', 'page');
      else anchor.removeAttribute('aria-current');
    });
  }

  function applyTheme(theme) {
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else {
      root.removeAttribute('data-theme');
    }

    document.querySelectorAll('.theme-toggle').forEach((button) => {
      button.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
      button.setAttribute('title', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
      button.dataset.themeState = theme;
    });
  }

  function initTheme() {
    // Monochrome edition: light only.
    applyTheme('light');
  }

  function ensureButton(navLinks, className, id, label) {
    let button = document.getElementById(id) || navLinks.querySelector(`.${className}`);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = className;
      button.id = id;
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
      button.innerHTML = '<span></span>';
      navLinks.appendChild(button);
    }
    return button;
  }

  function normalizeNav(navLinks) {
    if (navLinks.dataset.otrustNavNormalized === 'true') return;

    const primary = navLinks.querySelector('.nav-primary');
    const secondary = navLinks.querySelector('.nav-secondary');
    if (primary) {
      primary.innerHTML = `
        <a href="/timestamp">Timestamp</a>
        <a href="/sign">Sign</a>
        <a href="/sign-in">Auth</a>
      `;
    }
    if (secondary) {
      secondary.innerHTML = `
        <a href="/docs" class="docs-trigger" id="docs-trigger">Docs</a>
        <a href="/api-docs">Developers</a>
        <a href="/about">About</a>
      `;
    }

    navLinks.dataset.otrustNavNormalized = 'true';
  }

  function buildMobileNavPanel(nav, navLinks) {
    let panel = nav.querySelector('.mobile-nav-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'mobile-nav-panel';
      panel.id = 'mobile-nav-panel';
      panel.setAttribute('aria-label', 'Mobile navigation');
      panel.hidden = true;

      const navContainer = nav.querySelector('.nav-container') || nav;
      navContainer.appendChild(panel);
    }

    panel.innerHTML = '';
    navLinks.querySelectorAll('.nav-primary a, .nav-secondary a').forEach((anchor) => {
      const item = anchor.cloneNode(true);
      item.removeAttribute('id');
      item.classList.remove('docs-trigger', 'open');
      item.addEventListener('click', () => {
        closeMobileMenu(navLinks);
      });
      panel.appendChild(item);
    });

    return panel;
  }

  function closeMobileMenu(navLinks) {
    const navSecondary = navLinks.querySelector('.nav-secondary');
    const mobilePanel = navLinks.closest('nav')?.querySelector('.mobile-nav-panel');

    navLinks.classList.remove('nav-open');
    navSecondary?.classList.remove('open');
    mobilePanel?.classList.remove('open');
    if (mobilePanel) mobilePanel.hidden = true;
  }

  function injectStandardNav() {
    if (document.querySelector('nav[role="navigation"]') || document.querySelector('.dashboard-home') || document.querySelector('.nav-links')) return false;

    const body = document.body;
    const nav = document.createElement('nav');
    nav.setAttribute('role', 'navigation');
    nav.setAttribute('aria-label', 'Main navigation');
    nav.innerHTML = `
      <div class="nav-container">
        <a href="/" class="logo">OTRUST</a>
        <div class="nav-links">
          <span class="nav-primary">
            <a href="/timestamp">Timestamp</a>
            <a href="/sign">Sign</a>
            <a href="/sign-in">Auth</a>
          </span>
          <span class="nav-secondary" id="nav-secondary">
            <a href="/docs" class="docs-trigger" id="docs-trigger">Docs</a>
            <a href="/api-docs">Developers</a>
            <a href="/about">About</a>
          </span>
          <button class="theme-toggle" id="theme-toggle" aria-label="Toggle dark mode" title="Toggle dark mode"></button>
        </div>
      </div>
    `;
    body.insertBefore(nav, body.firstChild.nextSibling || body.firstChild);
    return true;
  }

  function hydrateNav() {
    injectStandardNav();

    if (document.querySelector('.dashboard-home')) {
      return false;
    }

    const nav = document.querySelector('body > nav[role="navigation"], body > nav.main-nav, body > nav');
    if (!nav || nav.dataset.otrustHydrated === 'true') return false;

    const navLinks = nav.querySelector('.nav-links');
    if (!navLinks) return false;

    normalizeNav(navLinks);

    const navSecondary = navLinks.querySelector('.nav-secondary');
    if (navSecondary && !navSecondary.id) navSecondary.id = 'nav-secondary';

    const themeButton = ensureButton(navLinks, 'theme-toggle', 'theme-toggle', 'Toggle color theme');
    // mobile menu button removed as requested - no hamburger
    const mobilePanel = buildMobileNavPanel(nav, navLinks);
    const docsBar = document.getElementById('docs-submenu-bar') || document.querySelector('.docs-submenu-bar');
    const docsTrigger = navLinks.querySelector('.docs-trigger');

    // Hamburger menu removed per request - mobile panel still built for potential future use, but no button

    themeButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const nextTheme = root.hasAttribute('data-theme') ? 'light' : 'dark';
      localStorage.setItem(themeKey, nextTheme);
      applyTheme(nextTheme);
    }, true);

    if (docsTrigger && docsBar) {
      docsTrigger.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const isOpen = docsBar.classList.toggle('open');
        docsTrigger.classList.toggle('open', isOpen);
        closeMobileMenu(navLinks);
      }, true);
    }

    document.addEventListener('click', (event) => {
      if (!event.target.closest('nav') && !event.target.closest('.docs-submenu-bar')) {
        closeMobileMenu(navLinks);
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeMobileMenu(navLinks);
        docsBar?.classList.remove('open');
        docsTrigger?.classList.remove('open');
      }
    });

    if (docsBar && docsPaths.some((path) => window.location.pathname.startsWith(path.replace('.html', '')))) {
      docsBar.classList.add('open');
      docsTrigger?.classList.add('open');
    }

    syncActiveLinks(document);
    applyTheme('light');
    nav.dataset.otrustHydrated = 'true';
    return true;
  }

  function formatStat(value) {
    const number = Number(value || 0);
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(number);
  }

  function setStat(name, value) {
    document.querySelectorAll(`[data-stat="${name}"]`).forEach((el) => {
      el.textContent = value;
    });
  }

  function initStatsWidgets() {
    if (!document.querySelector('[data-stat]')) return;

    fetch('/stats')
      .then((response) => {
        if (!response.ok) throw new Error('stats_unavailable');
        return response.json();
      })
      .then((data) => {
        const totalItems = (data.total_claims || 0) + (data.total_signatures || 0);
        const confirmedItems = (data.confirmed_claims || 0) + (data.confirmed_signatures || 0);
        setStat('api_status', 'Online');
        setStat('total_items', formatStat(totalItems));
        setStat('confirmed_items', formatStat(confirmedItems));
        setStat('pending_claims', formatStat(data.pending_claims || 0));
        setStat('latest_block', data.latest_block ? formatStat(data.latest_block) : 'Pending');
      })
      .catch(() => {
        setStat('api_status', 'Offline');
      });
  }

  function initCodeCopyButtons() {
    document.querySelectorAll('pre').forEach((pre) => {
      if (pre.dataset.copyReady === 'true') return;
      const code = pre.querySelector('code');
      if (!code) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'copy-code-btn';
      button.textContent = 'Copy';
      button.setAttribute('aria-label', 'Copy code');
      button.addEventListener('click', async () => {
        const text = code.innerText;
        try {
          await navigator.clipboard.writeText(text);
          button.textContent = 'Copied';
          button.classList.add('copied');
          window.setTimeout(() => {
            button.textContent = 'Copy';
            button.classList.remove('copied');
          }, 1400);
        } catch {
          button.textContent = 'Select';
        }
      });

      pre.classList.add('has-copy');
      pre.dataset.copyReady = 'true';
      pre.appendChild(button);
    });
  }

  function initScrollReveal() {
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const targets = document.querySelectorAll('.feature-card, .endpoint, .function-card, .content-card, .proof-type, .subpage-function-card, .subpage-info-block');
    if (!targets.length) return;

    if (reduceMotion || !('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

    targets.forEach((el, index) => {
      el.classList.add('reveal-on-scroll');
      el.style.animationDelay = `${Math.min(index % 6, 5) * 55}ms`;
      observer.observe(el);
    });
  }

  const productFunctions = [
    {
      key: 'timestamp',
      href: '/timestamp',
      label: 'Timestamp',
      detail: 'Hash locally, anchor records, verify later.'
    },
    {
      key: 'proof',
      href: '/proof',
      label: 'ID',
      detail: 'Verify identity facts without exposing raw data.'
    },
    {
      key: 'sign',
      href: '/sign',
      label: 'Sign',
      detail: 'Create signing requests from document hashes.'
    },
    {
      key: 'signin',
      href: '/sign-in',
      label: 'Auth',
      detail: 'Hosted auth challenge for partner apps.'
    }
  ];

  const briefingConfigs = {
    timestamp: {
      kicker: 'Timestamp',
      title: 'Timestamp a file.',
      body: 'Hash locally, sign the record, and send only the hash and metadata for anchoring. The file itself stays on your device.',
      stepsTitle: 'What happens',
      stepLabels: ['Hash', 'Sign', 'Anchor', 'Verify'],
      steps: ['Select a file, paste text, or provide an existing SHA-256 hash.', 'Your browser signs the record with its local key.', 'OTRUST prepares the signed record for OpenTimestamps anchoring.', 'You keep a receipt and verification page for later checks.'],
      trustTitle: 'Trust boundaries',
      principlesHeading: 'Trust is<br>earned by design.',
      principlesLead: 'OTRUST exists to make digital truth verifiable without permission, accounts or intermediaries.',
      trustLabels: ['No upload', 'Signed record', 'Independent verify'],
      trust: ['No file upload is required for timestamping.', 'The hash, browser key, and timestamp metadata are bound into one record.', 'Verification works later as long as the original input and receipt are available.'],
      actions: [['Open timestamp tool', '/timestamp'], ['Read verification model', '/docs']]
    },
    sign: {
      kicker: 'Sign',
      title: 'Sign, with evidence.',
      body: 'Turn a document hash into a multi-party signing record built for auditability, not opaque document storage.',
      stepsTitle: 'Signing flow',
      stepLabels: ['Create', 'Invite', 'Sign', 'Anchor'],
      steps: ['Create a signing request and define signer roles.', 'Each signer signs the document hash with their key.', 'The final signature package is sealed into a verification record.', 'Anyone with the record can inspect signer, document hash and timestamp metadata.'],
      trustTitle: 'Useful for',
      principlesHeading: 'Built for<br>audit trails.',
      principlesLead: 'Common signing patterns where hash-level evidence and signer metadata matter more than storing the full file.',
      trustLabels: ['Agreements', 'Research', 'Partners', 'Audit'],
      trust: ['Founder agreements and board records.', 'Research approvals and invention disclosures.', 'Partner documents where hash-level evidence is enough.', 'Independently verifiable signature metadata.'],
      actions: [['Create signing request', '/sign'], ['API reference', '/api-docs']]
    },
    proof: {
      kicker: 'ID',
      title: 'ID, without revealing.',
      body: 'Prove a scoped identity claim while keeping the underlying evidence outside the public record.',
      stepsTitle: 'ID flow',
      stepLabels: ['Check', 'Commit', 'Verify', 'Share'],
      steps: ['Run document and liveness checks in your browser.', 'Create a commitment-bound ID package.', 'Verifiers check the claim without receiving raw documents.', 'Share the ID URL only where the claim is needed.'],
      trustTitle: 'Boundaries',
      principlesHeading: 'Verify the claim,<br>not the document.',
      principlesLead: 'Verifiers receive a commitment ID package and metadata - not your passport scan or selfie.',
      trustLabels: ['Local checks', 'Commitments', 'Reusable URL', 'Scoped disclosure'],
      trust: ['OCR and face matching run in your browser before any ID is created.', 'Claims are bound to cryptographic commitments, not raw identity fields.', 'Share an ID link; verifiers check the package independently.', 'Each ID is purpose-bound - age, unique identity, or similar facts only.'],
      actions: [['Create ID', '/proof'], ['Partner Auth', '/sign-in']]
    },
    signin: {
      kicker: 'Auth',
      title: 'Hosted Auth for partners.',
      body: 'Create a short-lived challenge, send the user to OTRUST for ID verification, then return to your registered callback with token and state.',
      stepsTitle: 'Auth sequence',
      stepLabels: ['Challenge', 'Redirect', 'Verify', 'Callback'],
      steps: ['Partner creates a short-lived challenge through the API.', 'User completes the hosted Auth flow on otrust.eu.', 'OTRUST verifies ID ownership and challenge binding.', 'The user returns to the registered callback with token and state.'],
      trustTitle: 'Production requirements',
      principlesHeading: 'Partner-ready<br>hosted auth.',
      principlesLead: 'Hosted Auth keeps verification on OTRUST while partners keep control of their app state.',
      trustLabels: ['Visible domain', 'Safe branding', 'Bound callbacks'],
      trust: ['The OTRUST domain remains visible during verification.', 'Partner branding cannot inject JavaScript.', 'Callbacks must preserve challenge, state, redirect URI, and expiry.'],
      actions: [['View Auth flow', '/sign-in'], ['Hemsted example', '/partners/hemsted']]
    },
    docs: {
      shellMode: 'compact',
      kicker: 'Documentation',
      title: 'Docs & resources.',
      body: 'The docs explain the product model, security boundaries, verification assumptions and integration steps behind the public tools.',
      stepsTitle: 'Start here',
      stepLabels: ['Functions', 'Local-first', 'API model', 'Playground'],
      steps: ['Understand Timestamp, ID, Sign, and Auth.', 'Review local-first hashing and ID verification.', 'Connect API endpoints only after the verification model is clear.', 'Use the playground for request and response shape testing.'],
      trustTitle: 'Included topics',
      principlesHeading: 'Docs that match<br>the product.',
      principlesLead: 'Implementation detail for the four public tools and their verification assumptions.',
      trustLabels: ['Timestamps', 'Signing', 'ID Auth', 'Transparency'],
      trust: ['OpenTimestamps anchoring.', 'Document signing records.', 'Hosted Auth callbacks.', 'Operational transparency and audit logs.'],
      actions: [['Open docs', '/docs'], ['API reference', '/api-docs']]
    },
    api: {
      shellMode: 'compact',
      kicker: 'API',
      title: 'API reference.',
      body: 'The API surface is designed around explicit hashes, signed records, verification endpoints, and short-lived partner Auth challenges.',
      stepsTitle: 'Integration path',
      stepLabels: ['Hash in app', 'Create records', 'Store IDs', 'Verify server-side'],
      steps: ['Generate or accept hashes in your application.', 'Create claims, signing requests or Auth challenges through the API.', 'Store returned ID links and verification URLs.', 'Verify callbacks and ID metadata server-side.'],
      trustTitle: 'Engineering notes',
      principlesHeading: 'Verify on<br>your server.',
      principlesLead: 'The API is hash-first: claims, signatures, ID packages, and short-lived Auth challenges.',
      trustLabels: ['Callbacks', 'State checks', 'Hash-first'],
      trust: ['Never treat a client callback as final without server verification.', 'Preserve state and expiry checks for hosted Auth.', 'Prefer hash references over document uploads where possible.'],
      actions: [['View endpoints', '/api-docs'], ['Open playground', '/playground/']]
    },
    founder: {
      shellMode: 'compact',
      kicker: 'Why',
      title: 'Prior art, without disclosure.',
      body: 'In my research on cognition I kept running into the same problem: how do you prove something existed before a certain date without sharing the idea? That’s why I built OTRUST.',
      stepsTitle: 'The constraint',
      stepLabels: ['Keep the work', 'Hash locally', 'Timestamp', 'Verify later'],
      steps: ['The invention stays private until you choose otherwise.', 'Only a cryptographic hash leaves your machine.', 'The record anchors to an independent timeline.', 'Anyone can verify existence — not content.'],
      trustTitle: 'What it avoids',
      principlesHeading: 'Proof,<br>not exposure.',
      principlesLead: 'Publishing early, filing first, or handing files to a platform each trade secrecy for evidence. Hash-first timestamping does not.',
      trustLabels: ['No upload', 'No custody', 'No trust-me', 'Open source'],
      trust: ['Raw files are not required for a valid proof.', 'OTRUST does not need to hold your work.', 'Verification is cryptographic, not reputational.', 'The core path is open and self-hostable.'],
      actions: [['Use otrust.eu', '/'], ['Technical note', '/notes/why-otrust']]
    },
    about: {
      shellMode: 'compact',
      kicker: 'About',
      title: 'Built for verifiable trust.',
      body: 'OTRUST connects timestamping, signing, commitment ID packages, and hosted Auth through one local-first verification model.',
      stepsTitle: 'What it is',
      stepLabels: ['Timestamp', 'ID', 'Sign', 'Auth'],
      steps: ['Timestamp files and claims with independently verifiable record metadata.', 'Collect signer attestations around document hashes.', 'Create commitment-based IDs for selective disclosure.', 'Run hosted Auth with challenge-bound callbacks.'],
      trustTitle: 'Design position',
      principlesHeading: 'Four tools,<br>one model.',
      principlesLead: 'Timestamp, ID, Sign, and Auth share local-first hashing, visible processing boundaries, and independent verification.',
      trustLabels: ['Verifiable', 'Clear processor', 'Open source', 'Public boundaries'],
      trust: ['Cryptographic records should remain independently verifiable over time.', 'Hosted identity moments must keep OTRUST visible as processor.', 'Open source should cover the core ID path and integrations.', 'Service boundaries should be explicit in docs, terms, and privacy language.'],
      actions: [['Read technical note', '/notes/why-otrust'], ['Privacy policy', '/privacy-policy']]
    },
    transparency: {
      shellMode: 'compact',
      kicker: 'Transparency',
      title: 'Public trust log.',
      body: 'The transparency page exposes operational trust signals instead of asking users to accept vague security claims.',
      stepsTitle: 'What to inspect',
      stepLabels: ['Totals', 'Open source', 'Privacy', 'Anchoring'],
      steps: ['Processed verification and timestamp totals.', 'Open source status and repository links.', 'Privacy posture for files, hashes and optional notifications.', 'Anchoring and verification assumptions.'],
      trustTitle: 'Why it matters',
      trustLabels: ['Real counters', 'Mapped claims', 'No hype'],
      trust: ['Counters must be sourced from real system records.', 'Security claims should map to verifiable behavior.', 'Public trust pages should avoid inflating production promises.'],
      actions: [['View trust log', '/transparency'], ['Open source repo', 'https://github.com/otrust-eu/opensource']]
    },
    note: {
      shellMode: 'compact',
      kicker: 'Technical note',
      title: 'Why OTRUST.',
      body: 'The technical note explains the product philosophy: local computation, ID-first identity, auditable records and clear provider boundaries.',
      stepsTitle: 'Core argument',
      stepLabels: ['Local data', 'Public records', 'Visible processor', 'Verify first'],
      steps: ['Keep files and sensitive data out of the service where possible.', 'Use public verification records for permanence.', 'Make the processor visible during identity moments.', 'Prefer verification over promises.'],
      trustTitle: 'Read with',
      trustLabels: ['Docs', 'Trust log', 'API ref'],
      trust: ['The documentation for implementation detail.', 'The transparency log for operational signals.', 'The API reference for exact request and response contracts.'],
      actions: [['Read note', '/notes/why-otrust'], ['Documentation', '/docs']]
    },
    proofview: {
      shellMode: 'compact',
      kicker: 'ID',
      title: 'Verify ID.',
      body: 'View and verify a shared ID package. Only the claim and cryptographic metadata are shown to verifiers.',
      actions: [['Create ID', '/proof'], ['Documentation', '/docs']]
    },
    signview: {
      shellMode: 'compact',
      kicker: 'Sign',
      title: 'Signing status.',
      body: 'Track signers, document hash, and the cryptographic record for this signing request.',
      actions: [['New request', '/sign'], ['Documentation', '/docs']]
    },
    signact: {
      shellMode: 'compact',
      kicker: 'Sign',
      title: 'Sign document.',
      body: 'Review the document hash, generate your keypair, and sign without uploading the file in local-hash mode.',
      actions: [['Sign home', '/sign'], ['Help', '/docs']]
    },
    auth: {
      shellMode: 'compact',
      kicker: 'Auth',
      title: 'Hosted Auth.',
      body: 'Present your OTRUST ID to complete a partner challenge. Verification runs on otrust.eu with visible disclosure.',
      actions: [['How it works', '/docs#proofauth'], ['Privacy', '/privacy-policy']]
    },
    partner: {
      shellMode: 'compact',
      kicker: 'Partner flow',
      title: 'Branded Auth handoff.',
      body: 'Partner pages show how hosted ID verification can carry partner context while keeping the OTRUST domain and disclosure visible.',
      stepsTitle: 'Handoff model',
      stepLabels: ['Challenge', 'Redirect', 'Branded UI', 'Callback'],
      steps: ['Partner creates a challenge.', 'User redirects to OTRUST hosted Auth UI.', 'The screen uses approved partner context.', 'Verification returns to the registered callback.'],
      trustTitle: 'Must remain visible',
      trustLabels: ['OTRUST provider', 'otrust.eu domain', 'DPO links'],
      trust: ['OTRUST as ID-processing provider.', 'The otrust.eu domain during verification.', 'DPO/GDPR and security disclosure links.'],
      actions: [['View partner example', '/partners/hemsted'], ['Hosted Auth', '/sign-in']]
    },
    privacy: {
      shellMode: 'compact',
      kicker: 'Privacy',
      title: 'Privacy by design.',
      body: 'The privacy policy explains which data stays local, which ID metadata is stored, and how hosted Auth and analytics are scoped.',
      principlesLead: 'Privacy language mirrors actual data handling: local hashing where possible, commitment-bound ID packages, and challenge-bound hosted Auth callbacks.',
      stepsTitle: 'Data posture',
      stepLabels: ['Local processing', 'ID package', 'Hosted auth', 'Analytics scope'],
      steps: ['Hash files locally before timestamping or signing where possible.', 'Store commitment ID packages and verification metadata, not raw identity documents.', 'Bind hosted Auth callbacks to challenge, state, redirect URI, and expiry.', 'Use privacy-friendly analytics without cross-site profiling.'],
      trustTitle: 'User expectation',
      trustLabels: ['No raw files', 'Commitment model', 'Visible hosted flow', 'Clear retention'],
      trust: ['Raw content is not required for timestamp verification.', 'ID claims are backed by commitments instead of exposing source identity fields.', 'Hosted Auth clearly shows when OTRUST processes partner verification.', 'Retention choices are documented per service so verification remains possible.'],
      actions: [['Read privacy policy', '/privacy-policy'], ['Transparency log', '/transparency']]
    },
    terms: {
      shellMode: 'compact',
      kicker: 'Terms',
      title: 'Terms of service.',
      body: 'The terms describe service boundaries for timestamping, signing, ID packages, and hosted Auth, including practical liability limits.',
      principlesLead: 'The terms focus on verification boundaries, partner callback obligations, and third-party dependencies rather than marketing promises.',
      stepsTitle: 'Covered areas',
      stepLabels: ['Services', 'Hosted auth', 'No warranty', 'Dependencies'],
      steps: ['Timestamp, ID, Sign, and Auth service behavior.', 'Partner callback verification and challenge-bound Auth expectations.', 'No-warranty limits for cryptographic records and operational availability.', 'Third-party anchoring and infrastructure assumptions.'],
      trustTitle: 'Important boundary',
      trustLabels: ['Evidence only', 'Verify inputs', 'External deps', 'Partner checks'],
      trust: ['A record is evidence, not automatic legal advice.', 'Independent verification still requires original inputs.', 'Hosted availability and blockchain anchoring depend on external systems.', 'Partners must verify callback tokens, state, and expiry server-side.'],
      actions: [['Read terms', '/terms'], ['Documentation', '/docs']]
    },
    site: {
      shellMode: 'compact',
      kicker: 'OTRUST',
      title: 'Trust infrastructure.',
      body: 'Cryptographic timestamps, signing, ID packages and hosted verification on otrust.eu.',
      stepsTitle: 'Core surfaces',
      stepLabels: ['Timestamp', 'ID', 'Sign', 'Auth'],
      steps: ['Timestamp files and claims locally.', 'Create privacy-preserving IDs.', 'Sign documents with verifiable hashes.', 'Use hosted Auth for partners.'],
      trustTitle: 'Principles',
      trustLabels: ['Local-first', 'Zero-knowledge', 'Verifiable', 'Open source'],
      trust: ['Everything possible stays on the device.', 'Raw content is not required for verification.', 'Records should be independently auditable.', 'The core path is open source.'],
      actions: [['Timestamp a file', '/timestamp'], ['Documentation', '/docs']]
    },
    install: {
      shellMode: 'compact',
      kicker: 'Install',
      title: 'Install OTRUST.',
      body: 'Install the browser extension, CLI, or self-hosted stack to use OTRUST outside the web tools.',
      actions: [['Open docs', '/docs'], ['GitHub', 'https://github.com/otrust-eu/opensource']]
    },
    setup: {
      shellMode: 'compact',
      kicker: 'Setup',
      title: 'Configure OTRUST.',
      body: 'Run the setup wizard to configure features, database, email, and deployment options for a self-hosted instance.',
      actions: [['Documentation', '/docs#selfhost'], ['Install wizard', '/install']]
    },
    playground: {
      shellMode: 'compact',
      kicker: 'Playground',
      title: 'Developer playground.',
      body: 'The playground is for inspecting SDK and API behavior before wiring ID and Auth flows into a product.',
      stepsTitle: 'Use it to',
      stepLabels: ['Payloads', 'ID links', 'Auth patterns', 'Integrate'],
      steps: ['Try request and response payloads.', 'Understand ID links and verification URLs.', 'Inspect challenge-bound auth patterns.', 'Move stable flows into server-side integration.'],
      trustTitle: 'Do not skip',
      trustLabels: ['Verify callbacks', 'Check state', 'Persist IDs'],
      trust: ['Server-side callback verification.', 'State and expiry checks.', 'Hash and ID record persistence in your own system.'],
      actions: [['Open playground', '/playground/'], ['API reference', '/api-docs']]
    },
    support: {
      shellMode: 'compact',
      kicker: 'Support',
      title: 'Report abuse.',
      body: 'Use this page when an OTRUST signing request, ID link or hosted flow appears abusive, misleading or unexpected.',
      stepsTitle: 'What to include',
      stepLabels: ['Contact', 'Link or ID', 'Description', 'Context'],
      steps: ['Your contact email if follow-up is needed.', 'The signing request, ID URL or sender details.', 'A short description of what looked suspicious.', 'Any timing or context that helps us investigate.'],
      trustTitle: 'Response model',
      trustLabels: ['Fraud review', 'Block senders', 'No secrets'],
      trust: ['Reports are reviewed for fraud, phishing and misuse.', 'Abusive senders can be blocked from email signing flows.', 'Security reports should never include private keys or secrets.'],
      actions: [['Submit report', '#abuse-form'], ['Privacy policy', '/privacy-policy']]
    }
  };

  function currentBriefingKey() {
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    const normalized = path.replace(/\.html$/, '');
    if (normalized === '/timestamp' || normalized === '/index') return 'timestamp';
    if (normalized === '/sign') return 'sign';
    if (normalized === '/proof') return 'proof';
    if (normalized === '/sign-in' || normalized === '/signin' || normalized === '/login') return 'signin';
    if (normalized === '/docs') return 'docs';
    if (normalized === '/api-docs') return 'api';
    if (normalized === '/playground') return 'playground';
    if (normalized === '/about') return 'about';
    if (normalized === '/krisledel') return 'founder';
    if (normalized === '/privacy-policy') return 'privacy';
    if (normalized === '/terms') return 'terms';
    if (normalized === '/transparency') return 'transparency';
    if (normalized === '/notes/why-otrust' || normalized === '/notes-why-otrust') return 'note';
    if (normalized === '/partners/hemsted' || normalized === '/partners-hemsted') return 'partner';
    if (normalized === '/report-abuse') return 'support';
    if (normalized === '/install') return 'install';
    if (normalized === '/setup') return 'setup';
    if (normalized === '/swagger') return 'api';
    if (normalized === '/camera-test') return 'site';
    if (normalized === '/proof-view' || (normalized.startsWith('/proof/') && normalized !== '/proof')) {
      return 'proofview';
    }
    if (normalized === '/sign-view' || normalized.startsWith('/sign/view')) return 'signview';
    if (normalized === '/sign-act' || normalized.startsWith('/sign/act')) return 'signact';
    if (normalized === '/auth-login' || normalized.startsWith('/auth/login')) return 'auth';
    return null;
  }

  function isCurrentFunction(item) {
    const path = (window.location.pathname.replace(/\/$/, '') || '/').replace(/\.html$/, '');
    if (item.key === 'timestamp') return path === '/timestamp' || path === '/index';
    if (item.key === 'signin') return ['/sign-in', '/signin', '/login'].includes(path);
    return path === item.href;
  }

  function appendList(parent, items) {
    const list = document.createElement('ul');
    items.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      list.appendChild(li);
    });
    parent.appendChild(list);
  }

  const DASHBOARD_NAV_LINKS = [
    ['/timestamp', 'Timestamp'],
    ['/proof', 'ID'],
    ['/sign', 'Sign'],
    ['/sign-in', 'Auth']
  ];

  function isDashboardNavActive(href) {
    const path = (window.location.pathname.replace(/\/$/, '') || '/').replace(/\.html$/, '');
    const normalizedHref = href.replace(/\.html$/, '');
    const hrefPath = normalizedHref.split('#')[0] || '/';

    if (hrefPath === '/timestamp') {
      return path === '/' || path === '/index' || path === '/timestamp' || path.startsWith('/timestamp/');
    }
    if (hrefPath === '/proof') {
      return path === '/proof' || path.startsWith('/proof/');
    }
    if (hrefPath === '/sign') {
      return path === '/sign' || (path.startsWith('/sign/') && !path.startsWith('/sign-in'));
    }
    if (hrefPath === '/sign-in') {
      return ['/sign-in', '/signin', '/login', '/auth-login'].includes(path) || path === '/partners/hemsted';
    }
    return path === hrefPath;
  }

  function normalizeDashboardTopbar(header) {
    if (!header) return;
    const anchors = DASHBOARD_NAV_LINKS.map(([href, label]) => {
      const active = isDashboardNavActive(href);
      return `<a href="${href}"${active ? ' class="active" aria-current="page"' : ''}>${label}</a>`;
    }).join('');

    let logo = header.querySelector('.dashboard-logo');
    if (!logo) {
      logo = document.createElement('a');
      logo.className = 'dashboard-logo';
      logo.href = '/';
      logo.textContent = 'OTRUST';
      header.prepend(logo);
    } else {
      logo.href = '/';
      logo.textContent = 'OTRUST';
    }

    let nav = header.querySelector('.dashboard-links');
    if (!nav) {
      nav = document.createElement('nav');
      nav.className = 'dashboard-links';
      nav.setAttribute('aria-label', 'OTRUST site navigation');
      header.appendChild(nav);
    }
    nav.innerHTML = `
      ${anchors}
    `;
  }

  function dashboardNavMarkup() {
    const anchors = DASHBOARD_NAV_LINKS.map(([href, label]) => {
      const active = isDashboardNavActive(href);
      return `<a href="${href}"${active ? ' class="active" aria-current="page"' : ''}>${label}</a>`;
    }).join('');
    return `
      <a href="/" class="dashboard-logo">OTRUST</a>
      <nav class="dashboard-links" aria-label="OTRUST site navigation">
        ${anchors}
      </nav>
    `;
  }

  function isDashboardNavigationPage() {
    const page = root.dataset.otrustPage;
    return (
      Boolean(document.querySelector('.dashboard-site-nav, .dashboard-home')) ||
      root.classList.contains('otrust-dashboard-shell') ||
      ['home', 'timestamp', 'proof', 'sign', 'signin', 'docs', 'api', 'about', 'founder', 'legal', 'transparency', 'note', 'partner', 'support', 'playground', 'install', 'setup', 'swagger', 'camera', 'auth'].includes(page)
    );
  }

  function ensureSingleDashboardNav() {
    const primary = document.querySelector('.dashboard-landing > .dashboard-site-nav')
      || document.querySelector('.dashboard-site-nav');
    if (!primary) return null;

    document.querySelectorAll('.dashboard-site-nav').forEach((header) => {
      if (header !== primary) header.remove();
    });
    return primary;
  }

  function hideLegacySiteNavigation() {
    if (!isDashboardNavigationPage()) return;
    document.querySelectorAll('body > nav, body > .docs-submenu-bar').forEach((node) => {
      node.remove();
    });
  }

  function syncDashboardNavigation() {
    hideLegacySiteNavigation();
    document.querySelectorAll('.dashboard-site-nav-unified').forEach((node) => node.remove());
    ensureSingleDashboardNav();
    document.querySelectorAll('.dashboard-site-nav').forEach((header) => {
      normalizeDashboardTopbar(header);
      const links = header.querySelector('.dashboard-links');
      if (!links) return;
      links.querySelectorAll('a[href]').forEach((anchor) => {
        const href = anchor.getAttribute('href') || '';
        const active = isDashboardNavActive(href);
        anchor.classList.toggle('active', active);
        if (active) anchor.setAttribute('aria-current', 'page');
        else anchor.removeAttribute('aria-current');
      });
    });
    syncActiveLinks(document);
    initDashboardMenu();
  }

  const dashboardSidebarLinks = [
    { key: 'timestamp', href: '/timestamp', label: 'TIMESTAMP' },
    { key: 'proof', href: '/proof', label: 'ID' },
    { key: 'sign', href: '/sign', label: 'SIGN' },
    { key: 'signin', href: '/sign-in', label: 'AUTH' }
  ];

  function isSidebarNavActive(key) {
    const path = (window.location.pathname.replace(/\/$/, '') || '/').replace(/\.html$/, '');
    if (key === 'timestamp') return path === '/timestamp' || path === '/index';
    if (key === 'proof') return path === '/proof' || path.startsWith('/proof/');
    if (key === 'sign') return path === '/sign' || (path.startsWith('/sign/') && !path.startsWith('/sign-in'));
    if (key === 'signin') return ['/sign-in', '/signin', '/login', '/auth-login'].includes(path);
    return false;
  }

  function buildSubpageSidebar() {
    const aside = document.createElement('aside');
    aside.className = 'otrust-sidebar';
    aside.setAttribute('aria-label', 'Workspace navigation');
    const nav = document.createElement('nav');
    nav.className = 'otrust-sidebar-nav';
    dashboardSidebarLinks.forEach((item, index) => {
      const link = document.createElement('a');
      link.href = item.href;
      if (isSidebarNavActive(item.key)) {
        link.className = 'active';
        link.setAttribute('aria-current', 'page');
      }
      link.innerHTML = `<span>${String(index + 1).padStart(2, '0')}</span><strong>${item.label}</strong>`;
      nav.appendChild(link);
    });
    aside.appendChild(nav);
    return aside;
  }

  function subpagePromptLines(config) {
    const key = currentBriefingKey() || root.dataset.otrustPage;
    const promptMap = {
      timestamp: ['DRAG & DROP A FILE', 'OR CLICK TO SELECT', 'Max size 5GB  &middot;  Any file type'],
      proof: ['PASTE ID', 'OR CREATE A CLAIM', 'ID package  &middot;  Commitment'],
      sign: ['SELECT A DOCUMENT', 'OR START WITH A HASH', 'Local hash  &middot;  Invite signers'],
      signin: ['CREATE CHALLENGE', 'OR VERIFY CALLBACK', 'Hosted auth  &middot;  Partner flow'],
      docs: ['READ THE MODEL', 'OR OPEN API DOCS', 'Security  &middot;  Verification'],
      api: ['EXPLORE ENDPOINTS', 'OR OPEN PLAYGROUND', 'JSON  &middot;  Server verify'],
      about: ['FOUR TOOLS', 'ONE VERIFICATION MODEL', 'Local-first  &middot;  Open source'],
      founder: ['PRIOR ART', 'WITHOUT DISCLOSURE', 'Hash locally  &middot;  Verify later'],
      privacy: ['LOCAL-FIRST DATA', 'CLEAR RETENTION', 'No raw files  &middot;  Scoped IDs'],
      terms: ['SERVICE BOUNDARIES', 'VERIFICATION DUTIES', 'Evidence  &middot;  Dependencies']
    };
    return promptMap[key] || [
      String(config.kicker || 'OTRUST').toUpperCase(),
      'OPEN THE WORKSPACE',
      'Verifiable  &middot;  Local-first'
    ];
  }

  function buildSubpagePrompt(config) {
    const prompt = document.createElement('div');
    prompt.className = 'dashboard-subpage-prompt';
    const [lineOne, lineTwo, meta] = subpagePromptLines(config);
    prompt.innerHTML = `
      <strong>${lineOne}<br>${lineTwo}</strong>
      <span>${meta}</span>
    `;
    return prompt;
  }

  function subpageTrustLines() {
    const key = currentBriefingKey() || root.dataset.otrustPage;
    const trustMap = {
      timestamp: ['Your file is never uploaded.', 'Everything is computed locally on your device.'],
      proof: ['Raw identity data stays out of verifier hands.', 'Only the scoped claim and ID package are shared.'],
      sign: ['Documents can stay local in hash-only mode.', 'Signatures bind people to the document hash.'],
      signin: ['OTRUST remains visible during verification.', 'Callbacks stay bound to challenge, state, and expiry.'],
      api: ['Keep verification server-side.', 'Preserve state, expiry and ID references.'],
      docs: ['Implementation detail stays close to the tools.', 'Security boundaries are documented explicitly.'],
      privacy: ['Data handling follows the verification model.', 'Retention is scoped by service surface.'],
      terms: ['Records are evidence, not legal advice.', 'Independent verification still needs original inputs.']
    };
    return trustMap[key] || ['Cryptographic records stay independently verifiable.', 'No accounts are required for public verification.'];
  }

  function buildSubpageTrustNote() {
    const note = document.createElement('div');
    note.className = 'dashboard-subpage-trust-note';
    const [strong, text] = subpageTrustLines();
    note.innerHTML = `
      <span class="dashboard-subpage-lock" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
      </span>
      <p><strong>${strong}</strong><span>${text}</span></p>
    `;
    return note;
  }

  function subpageFigureKey() {
    const key = currentBriefingKey() || root.dataset.otrustPage || 'site';
    if (key === 'timestamp') return 'timestamp';
    if (key === 'proof' || key === 'proofview') return 'proof';
    if (key === 'sign' || key === 'signview' || key === 'signact') return 'sign';
    if (key === 'signin' || key === 'auth' || key === 'partner') return 'signin';
    if (key === 'api' || key === 'playground' || key === 'swagger') return 'api';
    if (key === 'docs') return 'docs';
    if (key === 'note') return 'note';
    if (key === 'privacy') return 'privacy';
    if (key === 'terms' || key === 'legal') return 'terms';
    if (key === 'transparency') return 'seal';
    return 'system';
  }

  function buildDashboardSubpageHero(config) {
    const hero = document.createElement('section');
    hero.className = 'dashboard-subpage-hero dashboard-hero-block';

    const copy = document.createElement('div');
    copy.className = 'dashboard-subpage-copy dashboard-hero-copy';
    copy.innerHTML = `
      <span class="dashboard-kicker">${config.kicker}</span>
      <h1>${formatDashboardTitle(config.title)}</h1>
      <p class="dashboard-subpage-rule" aria-hidden="true"></p>
      <p>${config.body}</p>
    `;
    copy.appendChild(buildSubpageTrustNote());

    if (config.actions?.length) {
      const actions = document.createElement('div');
      actions.className = 'dashboard-actions';
      config.actions.slice(0, 2).forEach(([label, href], index) => {
        const link = document.createElement('a');
        link.href = href;
        link.className = index === 0 ? 'dashboard-primary-action' : 'dashboard-text-action';
        if (index === 0) {
          const icon = document.createElement('span');
          link.append(icon, document.createTextNode(label));
        } else {
          link.textContent = label;
        }
        if (href.startsWith('http')) link.rel = 'noopener noreferrer';
        actions.appendChild(link);
      });
      copy.appendChild(actions);
    }

    const visual = document.createElement('div');
    visual.className = 'dashboard-subpage-visual';
    const orbit = document.createElement('div');
    orbit.className = 'dashboard-subpage-orbit dashboard-orbit dashboard-orbit-hero';
    orbit.setAttribute('aria-hidden', 'true');
    orbit.dataset.otrustFigure = subpageFigureKey();
    visual.append(orbit, buildSubpagePrompt(config));
    hero.append(copy, visual);
    return hero;
  }

  function buildDashboardSubpageLower(config) {
    const hasSteps = Array.isArray(config.steps) && config.steps.length;
    const hasTrust = Array.isArray(config.trust) && config.trust.length;
    if (!hasSteps && !hasTrust) return null;

    const lower = document.createElement('section');
    lower.className = 'dashboard-subpage-lower';
    lower.setAttribute('aria-label', `${config.kicker || 'OTRUST'} details`);
    if (hasSteps) lower.appendChild(buildDashboardStepsBlock(config));
    if (hasTrust) lower.appendChild(buildDashboardPrinciplesBlock(config));
    return lower;
  }

  function normalizeSubpageHero(landing, config) {
    const nav = landing.querySelector(':scope > .dashboard-site-nav');
    let hero = landing.querySelector(':scope > .dashboard-subpage-hero, :scope > .dashboard-hero-block, :scope > .dashboard-subpage-head');
    if (!hero) {
      hero = buildDashboardSubpageHero(config);
      if (nav) nav.insertAdjacentElement('afterend', hero);
      else landing.prepend(hero);
      return;
    }

    hero.classList.add('dashboard-subpage-hero');
    hero.classList.remove('dashboard-subpage-head');

    let copy = hero.querySelector(':scope > .dashboard-subpage-copy, :scope > .dashboard-hero-copy, :scope > .dashboard-subpage-headcopy');
    if (!copy) {
      copy = document.createElement('div');
      copy.className = 'dashboard-subpage-copy dashboard-hero-copy';
      copy.innerHTML = `
        <span class="dashboard-kicker">${config.kicker}</span>
        <h1>${formatDashboardTitle(config.title)}</h1>
        <p class="dashboard-subpage-rule" aria-hidden="true"></p>
        <p>${config.body}</p>
      `;
      hero.prepend(copy);
    }
    copy.classList.add('dashboard-subpage-copy');
    if (!copy.querySelector('.dashboard-subpage-rule')) {
      const title = copy.querySelector('h1');
      const rule = document.createElement('p');
      rule.className = 'dashboard-subpage-rule';
      rule.setAttribute('aria-hidden', 'true');
      title?.insertAdjacentElement('afterend', rule);
    }
    if (!copy.querySelector('.dashboard-subpage-trust-note')) {
      const actions = copy.querySelector(':scope > .dashboard-actions');
      const trust = buildSubpageTrustNote();
      if (actions) copy.insertBefore(trust, actions);
      else copy.appendChild(trust);
    }

    let visual = hero.querySelector(':scope > .dashboard-subpage-visual');
    if (!visual) {
      visual = document.createElement('div');
      visual.className = 'dashboard-subpage-visual';
      [...hero.children].forEach((child) => {
        if (child !== copy && !child.classList?.contains('dashboard-subpage-prompt')) {
          visual.appendChild(child);
        }
      });
      hero.appendChild(visual);
    }

    let orbit = visual.querySelector('.dashboard-orbit');
    if (!orbit) {
      orbit = document.createElement('div');
      orbit.className = 'dashboard-subpage-orbit dashboard-orbit dashboard-orbit-hero';
      orbit.setAttribute('aria-hidden', 'true');
      orbit.dataset.otrustFigure = subpageFigureKey();
      visual.prepend(orbit);
    } else {
      orbit.classList.add('dashboard-subpage-orbit', 'dashboard-orbit-hero');
      if (!orbit.dataset.otrustFigure) orbit.dataset.otrustFigure = subpageFigureKey();
    }

    if (!visual.querySelector('.dashboard-subpage-prompt')) {
      visual.appendChild(buildSubpagePrompt(config));
    }
  }

  function normalizeSubpageLower(mainColumn, landing, config) {
    const toolSlot = mainColumn.querySelector(':scope > .dashboard-tool-slot');
    let lower = mainColumn.querySelector(':scope > .dashboard-subpage-lower');
    const movedSections = [...landing.querySelectorAll(':scope > .dashboard-steps, :scope > .dashboard-principles-panel')];

    if (movedSections.length) {
      if (!lower) {
        lower = document.createElement('section');
        lower.className = 'dashboard-subpage-lower';
        lower.setAttribute('aria-label', `${config.kicker || 'OTRUST'} details`);
      }
      movedSections.forEach((section) => lower.appendChild(section));
    } else if (!lower) {
      lower = buildDashboardSubpageLower(config);
    }

    if (lower && !lower.parentElement) {
      if (toolSlot) toolSlot.insertAdjacentElement('afterend', lower);
      else landing.insertAdjacentElement('afterend', lower);
    }

    const footer = landing.querySelector(':scope > .dashboard-left-footer');
    if (footer) {
      const anchor = lower || toolSlot || landing;
      anchor.insertAdjacentElement('afterend', footer);
    }
  }

  function absorbSubpageSiblings(dashboardHome, mainColumn) {
    const parent = dashboardHome?.parentElement;
    if (!parent || !mainColumn) return;
    const footer = mainColumn.querySelector(':scope > .dashboard-left-footer');
    const siblings = [];
    let node = dashboardHome.nextElementSibling;
    while (node) {
      const next = node.nextElementSibling;
      const isScript = node.tagName === 'SCRIPT';
      const isFooterWrapper = node.classList?.contains('footer-wrapper');
      if (!isScript && !isFooterWrapper) siblings.push(node);
      node = next;
    }
    siblings.forEach((sibling) => {
      if (footer?.parentElement === mainColumn) mainColumn.insertBefore(sibling, footer);
      else mainColumn.appendChild(sibling);
    });
  }

  function normalizeSubpageTemplate(dashboardHome) {
    const page = root.dataset.otrustPage;
    if (!dashboardHome || page === 'home') return;
    const config = briefingConfigs[currentBriefingKey()] || briefingConfigs.site;
    const mainColumn = dashboardHome.querySelector(':scope > .otrust-main') || dashboardHome;
    const landing = mainColumn.querySelector(':scope > .dashboard-landing, :scope > .dashboard-subpage-landing');
    if (!landing || !config) return;

    landing.classList.add('dashboard-subpage-landing');
    normalizeSubpageHero(landing, config);
    normalizeSubpageLower(mainColumn, landing, config);
    absorbSubpageSiblings(dashboardHome, mainColumn);
    const panel = mainColumn.querySelector(':scope > .dashboard-tool-slot .dashboard-page-panel');
    pruneDashboardPanelContent(page, panel);
  }

  function applySubpageTemplateLayout() {
    const page = root.dataset.otrustPage;
    const dashboardHome = document.querySelector('.dashboard-home');
    document.documentElement.classList.toggle('otrust-image1-home', page === 'home');
    document.documentElement.classList.toggle('otrust-image2-shell', page !== 'home');
    if (!dashboardHome || page === 'home') return;

    if (!dashboardHome.classList.contains('otrust-subpage-shell')) {
      const mainColumn = document.createElement('div');
      mainColumn.className = 'otrust-main';
      [...dashboardHome.children].forEach((node) => {
        if (!node.classList?.contains('otrust-sidebar')) {
          mainColumn.appendChild(node);
        }
      });
      dashboardHome.replaceChildren(mainColumn);
      dashboardHome.prepend(buildSubpageSidebar());
      dashboardHome.classList.add('otrust-subpage-shell');
      dashboardHome.dataset.otrustSubpageShell = 'true';
      normalizeSubpageTemplate(dashboardHome);
      return;
    }

    const currentSidebar = dashboardHome.querySelector(':scope > .otrust-sidebar');
    if (currentSidebar) currentSidebar.replaceWith(buildSubpageSidebar());
    normalizeSubpageTemplate(dashboardHome);
  }

  const dashboardShellSkipPages = new Set(['home', 'timestamp', 'proof', 'sign', 'signin', 'quickstart']);

  const dashboardBodyWrapPages = new Set(['install', 'setup', 'swagger', 'camera', 'playground']);

  const dashboardStepIcons = [
    'dashboard-step-hash',
    'dashboard-step-sign',
    'dashboard-step-anchor',
    'dashboard-step-prove'
  ];

  const dashboardPrincipleIcons = [
    'dashboard-principle-local',
    'dashboard-principle-zero',
    'dashboard-principle-lock',
    'dashboard-principle-open'
  ];

  function formatDashboardTitle(title) {
    const clean = String(title || '').replace(/\.$/, '').trim();
    if (!clean) return 'OTRUST';
    if (clean.includes(',')) {
      const [lead, ...rest] = clean.split(',');
      return `${lead.trim()},<br><span>${rest.join(',').trim()}.</span>`;
    }
    const words = clean.split(/\s+/);
    if (words.length <= 4) return `${clean}.`;
    const pivot = Math.ceil(words.length / 2);
    return `${words.slice(0, pivot).join(' ')}<br><span>${words.slice(pivot).join(' ')}.</span>`;
  }

  function buildDashboardLeftFooter() {
    const footer = document.createElement('footer');
    footer.className = 'dashboard-left-footer';
    footer.innerHTML = `
      <strong>OTRUST</strong>
      <span>&copy; 2026 OTRUST</span>
      <span class="dashboard-made">Made in Sweden, Europe</span>
      <nav aria-label="Dashboard footer">
        <a href="/docs">Docs</a>
        <a href="/api-docs">API</a>
        <a href="/about">About</a>
        <a href="https://github.com/otrust-eu/opensource" rel="noopener noreferrer">GitHub</a>
        <a href="/privacy-policy">Privacy</a>
        <a href="/terms">Terms</a>
      </nav>
      <a href="#" class="dashboard-footer-dot" aria-label="Back to top"></a>
    `;
    footer.querySelector('.dashboard-footer-dot')?.addEventListener('click', (event) => {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    return footer;
  }

  function buildDashboardLandingPanel(config, options = {}) {
    const includeNav = options.includeNav !== false;
    const article = document.createElement('article');
    article.className = 'dashboard-panel dashboard-landing dashboard-subpage-landing';

    if (includeNav) {
      const nav = document.createElement('header');
      nav.className = 'dashboard-site-nav';
      nav.setAttribute('aria-label', 'Dashboard navigation');
      nav.innerHTML = dashboardNavMarkup();
      article.appendChild(nav);
    }

    article.appendChild(buildDashboardSubpageHero(config));
    return article;
  }

  function buildDashboardStepsBlock(config, headingId = 'dashboard-shell-steps-heading') {
    const steps = document.createElement('section');
    steps.className = 'dashboard-steps';
    steps.setAttribute('aria-labelledby', headingId);
    const stepsKicker = document.createElement('span');
    stepsKicker.className = 'dashboard-kicker';
    stepsKicker.id = headingId;
    stepsKicker.textContent = config.stepsTitle || 'How it works';
    const stepGrid = document.createElement('div');
    stepGrid.className = 'dashboard-step-grid';
    (config.steps || []).slice(0, 4).forEach((copy, index) => {
      const item = document.createElement('article');
      const icon = document.createElement('div');
      icon.className = `dashboard-step-icon ${dashboardStepIcons[index % dashboardStepIcons.length]}`;
      icon.setAttribute('aria-hidden', 'true');
      const number = document.createElement('span');
      number.textContent = `0${index + 1}`;
      const heading = document.createElement('h2');
      heading.textContent = config.stepLabels?.[index] || `Step ${index + 1}`;
      const text = document.createElement('p');
      text.textContent = copy;
      item.append(icon, number, heading, text);
      stepGrid.appendChild(item);
    });
    steps.append(stepsKicker, stepGrid);
    return steps;
  }

  function buildDashboardPrinciplesBlock(config, headingId = 'dashboard-shell-principles-heading') {
    const principles = document.createElement('section');
    principles.className = 'dashboard-principles-panel';
    principles.setAttribute('aria-labelledby', headingId);
    const principlesCopy = document.createElement('div');
    principlesCopy.className = 'dashboard-principles-copy';
    const principlesLead = config.principlesLead || config.body || '';
    const principlesHeading = config.principlesHeading || 'Trust is<br>earned by design.';
    principlesCopy.innerHTML = `
      <span class="dashboard-kicker">${config.trustTitle || 'Useful for'}</span>
      <h2 id="${headingId}">${principlesHeading}</h2>
    `;
    if (principlesLead) {
      const lead = document.createElement('p');
      lead.textContent = principlesLead;
      principlesCopy.appendChild(lead);
    }
    const principlesList = document.createElement('div');
    principlesList.className = 'dashboard-principles-list';
    (config.trust || []).slice(0, 4).forEach((copy, index) => {
      const item = document.createElement('article');
      const icon = document.createElement('span');
      icon.className = `dashboard-principle-icon ${dashboardPrincipleIcons[index % dashboardPrincipleIcons.length]}`;
      icon.setAttribute('aria-hidden', 'true');
      const body = document.createElement('div');
      const heading = document.createElement('h3');
      heading.textContent = config.trustLabels?.[index] || `Point ${index + 1}`;
      const text = document.createElement('p');
      text.textContent = copy;
      body.append(heading, text);
      item.append(icon, body);
      principlesList.appendChild(item);
    });
    principles.append(principlesCopy, principlesList);
    return principles;
  }

  function pruneDashboardPanelContent(page, panel) {
    if (!panel) return;

    if (page === 'docs') {
      panel.querySelector('#overview')?.remove();
      panel.querySelector('[data-section="overview"]')?.remove();
      panel.querySelector('.sidebar-nav a[href="#overview"]')?.remove();
      const hash = window.location.hash.slice(1);
      const sectionId = hash && hash !== 'overview' ? hash : 'web';
      panel.querySelectorAll('.doc-section').forEach((section) => {
        section.classList.toggle('active', section.id === sectionId);
      });
      panel.querySelectorAll('.sidebar-nav a').forEach((anchor) => {
        anchor.classList.toggle('active', anchor.dataset.section === sectionId);
      });
    }

    if (page === 'about' || page === 'founder') {
      const layout = panel.querySelector('.main-layout');
      panel.querySelector('.left-col')?.remove();
      layout?.classList.add('dashboard-panel-single-col');
    }

    if (page === 'api') {
      const leftCol = panel.querySelector('.left-col');
      if (leftCol) {
        [...leftCol.children].forEach((child) => {
          if (!child.classList?.contains('endpoint-list')) child.remove();
        });
      }
    }

    if (page === 'legal') {
      panel.querySelector('.hero')?.remove();
    }

    if (page === 'transparency') {
      panel.querySelector('.trust-hero')?.remove();
    }

    if (page === 'note') {
      panel.querySelector('.note-head')?.remove();
    }

    if (page === 'partner') {
      const heroCopy = panel.querySelector('.partner-hero-copy');
      heroCopy?.querySelector('h1')?.remove();
      heroCopy?.querySelector('p')?.remove();
      heroCopy?.querySelector('.partner-actions')?.remove();
    }

    if (page === 'support') {
      panel.querySelector('h1')?.remove();
      panel.querySelector('.intro')?.remove();
    }

    if (page === 'install' || page === 'setup') {
      panel.querySelector('.logo')?.remove();
      const title = panel.querySelector(':scope > h1');
      if (title && !title.closest('.installer, .wizard, .step-content')) title.remove();
      panel.querySelector(':scope > .subtitle')?.remove();
      panel.querySelector(':scope > p.subtitle')?.remove();
    }

    if (page === 'swagger') {
      panel.querySelector('.navbar')?.remove();
    }

    if (page === 'camera') {
      panel.querySelector(':scope > h1')?.remove();
    }

    if (page === 'auth') {
      panel.querySelector('.brand-header h1')?.remove();
      panel.querySelector('.brand-header #subhead')?.remove();
      panel.querySelector('.brand-header .otrust-disclosure')?.remove();
    }
  }

  function ensureDashboardMainTarget(page) {
    let main = document.getElementById('main-content');
    if (main) return main;

    const existingMain = document.querySelector('main');
    if (existingMain) {
      if (!existingMain.id) existingMain.id = 'main-content';
      return existingMain;
    }

    const appRoot = document.getElementById('root');
    if (page === 'playground' && appRoot) {
      main = document.createElement('main');
      main.id = 'main-content';
      main.setAttribute('role', 'main');
      appRoot.parentNode.insertBefore(main, appRoot);
      main.appendChild(appRoot);
      return main;
    }

    if (!dashboardBodyWrapPages.has(page)) return null;

    if (!document.querySelector('.skip-link')) {
      const skip = document.createElement('a');
      skip.href = '#main-content';
      skip.className = 'skip-link';
      skip.textContent = 'Skip to content';
      document.body.prepend(skip);
    }

    main = document.createElement('main');
    main.id = 'main-content';
    main.setAttribute('role', 'main');

    const toWrap = [...document.body.children].filter((child) => {
      if (child.tagName === 'SCRIPT') return false;
      if (child.classList?.contains('skip-link')) return false;
      return true;
    });
    if (!toWrap.length) return null;

    const skip = document.querySelector('.skip-link');
    toWrap.forEach((node) => main.appendChild(node));
    if (skip) skip.insertAdjacentElement('afterend', main);
    else document.body.prepend(main);
    return main;
  }

  function buildFunctionWorkspaceSection(page) {
    const tool = workspaceToolMarkup(page);
    const context = workspaceContextMarkup(page);
    if (!tool && !context) return null;

    const section = document.createElement('section');
    section.className = `function-workspace function-workspace-${page}`;
    section.dataset.workspace = page;
    section.innerHTML = `
      <div class="function-workspace-shell">
        ${tool}
        ${context}
      </div>
    `;
    return section;
  }

  function rebuildBentoAsSubpageShell(page, main, config) {
    const bentoShell = main?.querySelector(':scope > .dashboard-home.otrust-bento');
    if (!bentoShell || !config) return false;

    const shell = document.createElement('section');
    shell.className = 'dashboard-home';
    shell.setAttribute('aria-label', `OTRUST ${config.kicker} workspace`);

    const existingToolSlot = page === 'timestamp'
      ? bentoShell.querySelector(':scope > .dashboard-tool-slot')
      : null;
    const toolSlot = existingToolSlot || document.createElement('section');
    toolSlot.classList.add('dashboard-tool-slot');
    toolSlot.hidden = false;
    toolSlot.setAttribute('aria-label', `${config.kicker} tool`);

    if (!existingToolSlot) {
      const panel = document.createElement('div');
      panel.className = 'dashboard-panel dashboard-page-panel dashboard-function-page-panel';
      const workspace = buildFunctionWorkspaceSection(page);
      if (workspace) panel.appendChild(workspace);
      toolSlot.appendChild(panel);
    }

    const landingPanel = buildDashboardLandingPanel(config);
    const lower = buildDashboardSubpageLower(config);
    shell.append(landingPanel, toolSlot);
    if (lower) shell.appendChild(lower);
    shell.appendChild(buildDashboardLeftFooter());

    main.replaceChildren(shell);
    document.documentElement.classList.add('otrust-dashboard-shell');
    return true;
  }

  function assembleDashboardShell() {
    const page = root.dataset.otrustPage;
    const main = ensureDashboardMainTarget(page);
    const key = currentBriefingKey();
    const config = briefingConfigs[key] || briefingConfigs.site;
    if (page !== 'home' && rebuildBentoAsSubpageShell(page, main, config)) return;
    if (dashboardShellSkipPages.has(page)) return;

    if (!main || main.querySelector('.dashboard-home')) return;

    if (!config) return;

    const existingNav = main.querySelector(':scope > .dashboard-site-nav');
    const contentNodes = [...main.children].filter((node) => {
      if (node === existingNav) return false;
      return !node.classList?.contains('subpage-briefing');
    });
    if (!contentNodes.length) return;

    main.querySelector('.subpage-briefing')?.remove();

    const shell = document.createElement('section');
    shell.className = 'dashboard-home';
    shell.setAttribute('aria-label', `OTRUST ${config.kicker} workspace`);

    const toolSlot = document.createElement('section');
    toolSlot.className = 'dashboard-tool-slot';
    toolSlot.setAttribute('aria-label', `${config.kicker} tool`);

    const panel = document.createElement('div');
    panel.className = 'dashboard-panel dashboard-page-panel';
    contentNodes.forEach((node) => panel.appendChild(node));
    toolSlot.appendChild(panel);

    const landingPanel = buildDashboardLandingPanel(config, { includeNav: !existingNav });
    if (existingNav) {
      existingNav.classList.remove('dashboard-site-nav-unified', 'dashboard-site-nav-global');
      landingPanel.prepend(existingNav);
    }

    const lower = buildDashboardSubpageLower(config);
    shell.append(landingPanel, toolSlot);
    if (lower) shell.appendChild(lower);
    shell.appendChild(buildDashboardLeftFooter());
    main.replaceChildren(shell);
    document.documentElement.classList.add('otrust-dashboard-shell');
    pruneDashboardPanelContent(page, panel);
    if (page === 'docs' || page === 'api') {
      const pageLayout = panel.querySelector('.main-container, .main-layout');
      if (pageLayout) pageLayout.scrollTop = 0;
    }
    syncDashboardNavigation();
  }

  function insertDashboardSiteChrome() {
    syncDashboardNavigation();
  }

  function insertPageBriefing() {
    if (
      root.dataset.otrustPage === 'home' ||
      root.dataset.otrustPage === 'timestamp' ||
      document.querySelector('.dashboard-home') ||
      document.querySelector('.subpage-briefing')
    ) return;

    const key = currentBriefingKey();
    const config = key ? briefingConfigs[key] : null;
    const main = document.getElementById('main-content') || document.querySelector('main');
    if (!config || !main) return;
    if (!main.id) main.id = 'main-content';

    const section = document.createElement('section');
    section.className = 'subpage-briefing';
    section.setAttribute('aria-labelledby', 'subpage-briefing-title');

    const rail = document.createElement('nav');
    rail.className = 'subpage-function-rail';
    rail.setAttribute('aria-label', 'Core OTRUST functions');
    productFunctions.forEach((item, index) => {
      const link = document.createElement('a');
      link.href = item.href;
      link.className = 'subpage-function-card';
      if (isCurrentFunction(item)) link.classList.add('active');

      const number = document.createElement('span');
      number.textContent = `0${index + 1}`;
      const label = document.createElement('strong');
      label.textContent = item.label;
      const detail = document.createElement('small');
      detail.textContent = item.detail;

      link.append(number, label, detail);
      rail.appendChild(link);
    });

    const layout = document.createElement('div');
    layout.className = 'subpage-briefing-layout';

    const intro = document.createElement('div');
    intro.className = 'subpage-briefing-intro';
    const kicker = document.createElement('span');
    kicker.className = 'subpage-kicker';
    kicker.textContent = config.kicker;
    const heading = document.createElement('h1');
    heading.id = 'subpage-briefing-title';
    heading.textContent = config.title;
    const body = document.createElement('p');
    body.textContent = config.body;
    intro.append(kicker, heading, body);

    const details = document.createElement('div');
    details.className = 'subpage-briefing-details';

    const steps = document.createElement('article');
    steps.className = 'subpage-info-block';
    const stepsHeading = document.createElement('h2');
    stepsHeading.textContent = config.stepsTitle;
    steps.appendChild(stepsHeading);
    appendList(steps, config.steps);

    const trust = document.createElement('article');
    trust.className = 'subpage-info-block';
    const trustHeading = document.createElement('h2');
    trustHeading.textContent = config.trustTitle;
    trust.appendChild(trustHeading);
    appendList(trust, config.trust);

    details.append(steps, trust);
    layout.append(intro, details);

    const actions = document.createElement('div');
    actions.className = 'subpage-briefing-actions';
    config.actions.forEach(([label, href]) => {
      const link = document.createElement('a');
      link.href = href;
      link.textContent = label;
      if (href.startsWith('http')) {
        link.rel = 'noopener noreferrer';
      }
      actions.appendChild(link);
    });

    section.append(rail, layout, actions);

    const dashboardHome = main.querySelector('.dashboard-home');
    if (dashboardHome && dashboardHome.parentElement === main) {
      main.insertBefore(section, dashboardHome.nextSibling);
    } else {
      main.prepend(section);
    }
  }

  function classifyPage() {
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    const normalized = path.replace(/\.html$/, '');
    const page =
      normalized === '/' ? 'home' :
      normalized === '/index' || normalized === '/timestamp' ? 'timestamp' :
      normalized === '/proof' ? 'proof' :
      normalized === '/proof-view' || normalized.startsWith('/proof/') ? 'proofview' :
      normalized === '/sign-in' || normalized === '/signin' || normalized === '/login' ? 'signin' :
      normalized === '/sign' ? 'sign' :
      normalized === '/sign-view' || normalized.startsWith('/sign/view') ? 'signview' :
      normalized === '/sign-act' || normalized.startsWith('/sign/act') ? 'signact' :
      normalized === '/docs' ? 'docs' :
      normalized === '/api-docs' ? 'api' :
      normalized === '/playground' || normalized.startsWith('/playground/') ? 'playground' :
      normalized === '/about' ? 'about' :
      normalized === '/krisledel' ? 'founder' :
      normalized === '/privacy-policy' || normalized === '/terms' ? 'legal' :
      normalized.startsWith('/partners') ? 'partner' :
      normalized.startsWith('/transparency') ? 'transparency' :
      normalized.startsWith('/notes') || normalized === '/notes-why-otrust' ? 'note' :
      normalized === '/auth-login' || normalized.startsWith('/auth/login') ? 'auth' :
      normalized === '/install' ? 'install' :
      normalized === '/setup' ? 'setup' :
      normalized === '/report-abuse' ? 'support' :
      normalized === '/swagger' ? 'swagger' :
      normalized === '/camera-test' ? 'camera' :
      'page';

    root.dataset.otrustPage = page;
    root.dataset.otrustBriefing = currentBriefingKey() || page;
    if (document.body) {
      document.body.dataset.otrustPage = page;
      document.body.dataset.otrustBriefing = root.dataset.otrustBriefing;
      document.body.classList.add('otrust-redesign-ready', `otrust-page-${page}`);
      document.body.classList.add(`otrust-briefing-${root.dataset.otrustBriefing}`);
    }
  }

  function seededValue(seed) {
    const x = Math.sin(seed * 987.654321) * 10000;
    return x - Math.floor(x);
  }

  function svgNode(NS, tag, attrs = {}) {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, String(value)));
    return node;
  }

  function appendOrbitCore(svg, NS, shape = 'square') {
    svg.appendChild(svgNode(NS, 'circle', { class: 'orbit-core-ring', r: 13 }));
    if (shape === 'circle') {
      svg.appendChild(svgNode(NS, 'circle', { class: 'orbit-core', r: 4.8 }));
      return;
    }
    if (shape === 'keyhole') {
      svg.appendChild(svgNode(NS, 'circle', { class: 'orbit-core', cx: 0, cy: -3, r: 4 }));
      svg.appendChild(svgNode(NS, 'rect', { class: 'orbit-core', x: -2.2, y: 1, width: 4.4, height: 7, rx: 0.8 }));
      return;
    }
    svg.appendChild(svgNode(NS, 'rect', { class: 'orbit-core', x: -4, y: -4, width: 8, height: 8 }));
  }

  function createOrbitGraphicVariant(variant = 'timestamp') {
    if (variant === 'system') {
      const system = createOrbitGraphic();
      system.dataset.figure = 'system';
      return system;
    }

    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '-220 -220 440 440');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.dataset.figure = variant;

    if (variant === 'timestamp') {
      svg.appendChild(svgNode(NS, 'rect', {
        class: 'orbit-timestamp-drop',
        x: -146,
        y: -114,
        width: 292,
        height: 228,
        rx: 8,
        opacity: 0.34
      }));
      svg.appendChild(svgNode(NS, 'rect', {
        class: 'orbit-timestamp-file',
        x: -58,
        y: -82,
        width: 116,
        height: 144,
        rx: 5,
        opacity: 0.48
      }));
      svg.appendChild(svgNode(NS, 'path', {
        class: 'orbit-timestamp-fold',
        d: 'M 24 -82 L 58 -48 L 24 -48 Z',
        opacity: 0.52
      }));
      [-36, -14, 8, 30].forEach((y, index) => {
        svg.appendChild(svgNode(NS, 'line', {
          class: 'orbit-timestamp-line',
          x1: -34,
          y1: y,
          x2: index % 2 ? 36 : 24,
          y2: y,
          opacity: 0.36
        }));
      });
      for (let i = 0; i < 72; i += 1) {
        const angle = seededValue(i + 191) * Math.PI * 2;
        const radius = 82 + seededValue(i + 193) * 96;
        svg.appendChild(svgNode(NS, 'circle', {
          class: 'orbit-dot',
          cx: Math.cos(angle) * radius,
          cy: Math.sin(angle) * radius,
          r: i % 9 === 0 ? 2.1 : 0.85,
          opacity: 0.22 + seededValue(i + 197) * 0.42
        }));
      }
      [88, 126, 164].forEach((r, index) => {
        svg.appendChild(svgNode(NS, 'circle', {
          class: 'orbit-timestamp-ring',
          r,
          opacity: 0.16 + index * 0.1
        }));
      });
      [-150, -96, 96, 150].forEach((x, index) => {
        const y = index % 2 ? 142 : -142;
        svg.appendChild(svgNode(NS, 'line', {
          class: 'orbit-soft-line',
          x1: x,
          y1: y,
          x2: 0,
          y2: 0,
          opacity: 0.16
        }));
        svg.appendChild(svgNode(NS, 'circle', {
          class: 'orbit-timestamp-anchor',
          cx: x,
          cy: y,
          r: index % 2 ? 2.2 : 1.7,
          opacity: 0.7
        }));
      });
      svg.appendChild(svgNode(NS, 'circle', {
        class: 'orbit-timestamp-clock',
        r: 24,
        opacity: 0.78
      }));
      svg.appendChild(svgNode(NS, 'path', {
        class: 'orbit-timestamp-hand',
        d: 'M 0 -15 V 0 L 12 8',
        opacity: 0.82
      }));
      appendOrbitCore(svg, NS, 'circle');
      return svg;
    }

    if (variant === 'proof') {
      [-150, 150].forEach((x) => {
        [-150, 150].forEach((y) => {
          const sx = Math.sign(x);
          const sy = Math.sign(y);
          svg.appendChild(svgNode(NS, 'path', {
            class: 'orbit-proof-bracket',
            d: `M ${x} ${y - sy * 34} L ${x} ${y} L ${x - sx * 34} ${y}`,
            opacity: 0.72
          }));
        });
      });
      for (let ix = -14; ix <= 14; ix += 1) {
        for (let iy = -14; iy <= 14; iy += 1) {
          const distance = Math.hypot(ix, iy);
          if (distance > 16 || (ix + iy) % 2) continue;
          svg.appendChild(svgNode(NS, 'circle', {
            class: 'orbit-dot',
            cx: ix * 10,
            cy: iy * 10,
            r: distance < 3 ? 1.2 : 0.7,
            opacity: Math.max(0.08, 0.55 - distance * 0.024)
          }));
        }
      }
      [164, 128, 96, 68, 42].forEach((size, index) => {
        svg.appendChild(svgNode(NS, 'rect', {
          class: 'orbit-outline orbit-proof-square',
          x: -size / 2,
          y: -size / 2,
          width: size,
          height: size,
          opacity: 0.2 + index * 0.13
        }));
      });
      svg.appendChild(svgNode(NS, 'rect', {
        class: 'orbit-proof-core',
        x: -20,
        y: -20,
        width: 40,
        height: 40,
        rx: 2,
        opacity: 0.92
      }));
      appendOrbitCore(svg, NS, 'square');
      return svg;
    }

    if (variant === 'sign') {
      svg.appendChild(svgNode(NS, 'rect', {
        class: 'orbit-doc-outline',
        x: -122,
        y: -154,
        width: 244,
        height: 308,
        rx: 8,
        opacity: 0.28
      }));
      svg.appendChild(svgNode(NS, 'path', {
        class: 'orbit-doc-fold',
        d: 'M 70 -154 L 122 -102 L 70 -102 Z',
        opacity: 0.34
      }));
      [-78, -46, -14].forEach((y) => {
        svg.appendChild(svgNode(NS, 'line', {
          class: 'orbit-soft-line',
          x1: -82,
          y1: y,
          x2: 78,
          y2: y,
          opacity: 0.22
        }));
      });
      for (let i = 0; i < 80; i += 1) {
        const x = -170 + seededValue(i + 7) * 340;
        const y = -78 + seededValue(i + 13) * 156;
        const angle = -0.82 + (seededValue(i + 19) - 0.5) * 0.35;
        const len = 20 + seededValue(i + 23) * 86;
        svg.appendChild(svgNode(NS, 'line', {
          class: 'orbit-line orbit-sign-hatch',
          x1: x,
          y1: y,
          x2: x + Math.cos(angle) * len,
          y2: y + Math.sin(angle) * len,
          opacity: 0.08 + seededValue(i + 29) * 0.22
        }));
      }
      [
        'M -165 50 C -118 -16 -84 112 -38 30 S 52 -83 106 -20 S 142 32 174 -54',
        'M -138 82 C -88 42 -48 74 -6 40 S 86 -8 142 16',
        'M -92 -88 C -64 -36 -64 18 -72 86',
        'M 28 -96 C 12 -30 18 38 40 98'
      ].forEach((d, index) => {
        svg.appendChild(svgNode(NS, 'path', {
          class: index === 0 ? 'orbit-sign-stroke' : 'orbit-soft-line',
          d,
          opacity: index === 0 ? 0.88 : 0.38
        }));
      });
      [-132, -36, 68, 150].forEach((x, index) => {
        svg.appendChild(svgNode(NS, 'circle', {
          class: 'orbit-dot',
          cx: x,
          cy: index % 2 ? -10 : 28,
          r: index === 1 ? 2.2 : 1.6,
          opacity: 0.75
        }));
      });
      appendOrbitCore(svg, NS, 'circle');
      return svg;
    }

    if (variant === 'signin') {
      svg.appendChild(svgNode(NS, 'rect', {
        class: 'orbit-login-window',
        x: -126,
        y: -92,
        width: 252,
        height: 184,
        rx: 12,
        opacity: 0.34
      }));
      svg.appendChild(svgNode(NS, 'line', {
        class: 'orbit-soft-line',
        x1: -126,
        y1: -48,
        x2: 126,
        y2: -48,
        opacity: 0.28
      }));
      [176, 138, 104, 72].forEach((size, index) => {
        svg.appendChild(svgNode(NS, 'rect', {
          class: 'orbit-outline orbit-gateway',
          x: -size / 2,
          y: -size / 2,
          width: size,
          height: size,
          rx: 18 - index * 2,
          opacity: 0.18 + index * 0.14
        }));
      });
      [[-120, -78], [0, -138], [122, -80], [138, 0], [92, 112], [0, 142], [-96, 112], [-138, 0]]
        .forEach(([x, y], index) => {
          svg.appendChild(svgNode(NS, 'line', {
            class: 'orbit-soft-line',
            x1: 0,
            y1: 0,
            x2: x,
            y2: y,
            opacity: index % 2 ? 0.2 : 0.34
          }));
          svg.appendChild(svgNode(NS, 'circle', {
            class: 'orbit-dot',
            cx: x,
            cy: y,
            r: index % 3 === 0 ? 3 : 2,
            opacity: 0.78
          }));
        });
      svg.appendChild(svgNode(NS, 'path', {
        class: 'orbit-sign-stroke',
        d: 'M -68 28 C -32 -18 30 -18 68 28',
        opacity: 0.58
      }));
      svg.appendChild(svgNode(NS, 'path', {
        class: 'orbit-login-arrow',
        d: 'M -164 0 H -42 M -70 -28 L -42 0 L -70 28 M 42 0 H 164 M 136 -28 L 164 0 L 136 28',
        opacity: 0.55
      }));
      appendOrbitCore(svg, NS, 'keyhole');
      return svg;
    }

    if (variant === 'api') {
      const nodes = [];
      for (let i = 0; i < 22; i += 1) {
        const angle = (i / 22) * Math.PI * 2 + seededValue(i + 3) * 0.18;
        const radius = i % 4 === 0 ? 148 : 70 + seededValue(i + 9) * 90;
        nodes.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
      }
      nodes.forEach(([x1, y1], index) => {
        const [x2, y2] = nodes[(index * 5 + 7) % nodes.length];
        svg.appendChild(svgNode(NS, 'line', {
          class: 'orbit-soft-line',
          x1,
          y1,
          x2,
          y2,
          opacity: 0.12 + seededValue(index + 14) * 0.2
        }));
      });
      nodes.forEach(([cx, cy], index) => {
        svg.appendChild(svgNode(NS, 'circle', {
          class: 'orbit-dot',
          cx,
          cy,
          r: index % 5 === 0 ? 3 : 1.7,
          opacity: 0.46 + seededValue(index + 21) * 0.36
        }));
      });
      appendOrbitCore(svg, NS, 'circle');
      return svg;
    }

    if (variant === 'docs') {
      [-70, 0, 70].forEach((x, index) => {
        svg.appendChild(svgNode(NS, 'rect', {
          class: 'orbit-outline orbit-doc-card',
          x: x - 48,
          y: -84 + index * 12,
          width: 96,
          height: 130,
          rx: 4,
          opacity: 0.24 + index * 0.18
        }));
        for (let line = 0; line < 5; line += 1) {
          svg.appendChild(svgNode(NS, 'line', {
            class: 'orbit-soft-line',
            x1: x - 30,
            y1: -50 + index * 12 + line * 19,
            x2: x + 28,
            y2: -50 + index * 12 + line * 19,
            opacity: 0.35
          }));
        }
      });
      for (let i = 0; i < 44; i += 1) {
        const angle = seededValue(i + 41) * Math.PI * 2;
        const radius = 112 + seededValue(i + 42) * 82;
        svg.appendChild(svgNode(NS, 'circle', {
          class: 'orbit-dot',
          cx: Math.cos(angle) * radius,
          cy: Math.sin(angle) * radius,
          r: 0.7 + seededValue(i + 43),
          opacity: 0.28
        }));
      }
      appendOrbitCore(svg, NS, 'square');
      return svg;
    }

    if (variant === 'note') {
      svg.appendChild(svgNode(NS, 'rect', {
        class: 'orbit-note-sheet',
        x: -96,
        y: -126,
        width: 192,
        height: 252,
        rx: 7,
        opacity: 0.32
      }));
      [-80, -56, -32, -8, 16, 40, 64].forEach((y, index) => {
        svg.appendChild(svgNode(NS, 'line', {
          class: 'orbit-note-line',
          x1: -58,
          y1: y,
          x2: index % 3 === 0 ? 46 : 62,
          y2: y,
          opacity: 0.24 + index * 0.035
        }));
      });
      [-138, -88, -28, 34, 94, 148].forEach((x, index) => {
        const y = index % 2 ? 126 : -138;
        svg.appendChild(svgNode(NS, 'line', {
          class: 'orbit-soft-line',
          x1: x,
          y1: y,
          x2: 0,
          y2: 0,
          opacity: 0.16
        }));
        svg.appendChild(svgNode(NS, 'circle', {
          class: 'orbit-dot',
          cx: x,
          cy: y,
          r: index === 2 ? 2.6 : 1.8,
          opacity: 0.68
        }));
      });
      svg.appendChild(svgNode(NS, 'path', {
        class: 'orbit-note-mark',
        d: 'M -62 92 C -18 52 26 52 66 92',
        opacity: 0.55
      }));
      appendOrbitCore(svg, NS, 'circle');
      return svg;
    }

    if (variant === 'privacy') {
      svg.appendChild(svgNode(NS, 'path', {
        class: 'orbit-privacy-shield',
        d: 'M 0 -150 C 42 -126 82 -120 122 -116 L 112 -34 C 102 52 60 106 0 146 C -60 106 -102 52 -112 -34 L -122 -116 C -82 -120 -42 -126 0 -150 Z',
        opacity: 0.36
      }));
      [168, 132, 96].forEach((r, index) => {
        svg.appendChild(svgNode(NS, 'circle', {
          class: 'orbit-outline',
          r,
          opacity: 0.12 + index * 0.1
        }));
      });
      for (let i = 0; i < 34; i += 1) {
        const angle = (i / 34) * Math.PI * 2;
        const radius = i % 3 === 0 ? 174 : 136;
        svg.appendChild(svgNode(NS, 'circle', {
          class: 'orbit-dot',
          cx: Math.cos(angle) * radius,
          cy: Math.sin(angle) * radius,
          r: i % 5 === 0 ? 2.2 : 1.1,
          opacity: 0.24 + seededValue(i + 71) * 0.36
        }));
      }
      svg.appendChild(svgNode(NS, 'rect', {
        class: 'orbit-lock-body',
        x: -30,
        y: 4,
        width: 60,
        height: 48,
        rx: 5,
        opacity: 0.76
      }));
      svg.appendChild(svgNode(NS, 'path', {
        class: 'orbit-lock-arc',
        d: 'M -20 4 V -16 C -20 -40 20 -40 20 -16 V 4',
        opacity: 0.76
      }));
      appendOrbitCore(svg, NS, 'keyhole');
      return svg;
    }

    if (variant === 'terms') {
      svg.appendChild(svgNode(NS, 'rect', {
        class: 'orbit-terms-sheet',
        x: -118,
        y: -152,
        width: 236,
        height: 304,
        rx: 7,
        opacity: 0.3
      }));
      [-92, -62, -32, -2, 28].forEach((y, index) => {
        svg.appendChild(svgNode(NS, 'line', {
          class: 'orbit-note-line',
          x1: -76,
          y1: y,
          x2: index % 2 ? 76 : 54,
          y2: y,
          opacity: 0.3
        }));
      });
      [-142, 142].forEach((x) => {
        svg.appendChild(svgNode(NS, 'line', {
          class: 'orbit-terms-boundary',
          x1: x,
          y1: -124,
          x2: x,
          y2: 124,
          opacity: 0.42
        }));
      });
      svg.appendChild(svgNode(NS, 'circle', {
        class: 'orbit-terms-seal',
        cx: 48,
        cy: 78,
        r: 31,
        opacity: 0.44
      }));
      svg.appendChild(svgNode(NS, 'path', {
        class: 'orbit-terms-boundary',
        d: 'M 30 78 L 42 91 L 69 61',
        opacity: 0.72
      }));
      appendOrbitCore(svg, NS, 'square');
      return svg;
    }

    if (variant === 'seal') {
      [52, 84, 116, 148].forEach((r, index) => {
        svg.appendChild(svgNode(NS, 'circle', {
          class: 'orbit-outline',
          r,
          opacity: 0.18 + index * 0.12
        }));
      });
      for (let i = 0; i < 42; i += 1) {
        const angle = (i / 42) * Math.PI * 2;
        const inner = i % 2 ? 118 : 96;
        const outer = 164;
        svg.appendChild(svgNode(NS, 'line', {
          class: 'orbit-soft-line',
          x1: Math.cos(angle) * inner,
          y1: Math.sin(angle) * inner,
          x2: Math.cos(angle) * outer,
          y2: Math.sin(angle) * outer,
          opacity: 0.25
        }));
      }
      appendOrbitCore(svg, NS, 'square');
      return svg;
    }

    const fallback = createOrbitGraphic();
    fallback.dataset.figure = 'timestamp';
    return fallback;
  }

  function createOrbitGraphic() {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '-220 -220 440 440');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    // Dense radial sunburst: hundreds of fine lines emanating from one
    // point, longer/denser than a few rings — matches the reference hero.
    // No concentric rings (the reference has none).
    const LINES = 300;
    for (let i = 0; i < LINES; i += 1) {
      // even angular spread with slight per-line jitter so it reads organic
      const angle = (i / LINES) * Math.PI * 2 + (seededValue(i + 3) - 0.5) * 0.05;
      const inner = 6 + seededValue(i + 1) * 16;
      // varied lengths give the ragged outer edge of the reference burst
      const reach = seededValue(i + 17);
      const outer = 70 + reach * reach * 150; // bias toward shorter, a few long
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('class', 'orbit-line');
      line.setAttribute('x1', String(Math.cos(angle) * inner));
      line.setAttribute('y1', String(Math.sin(angle) * inner));
      line.setAttribute('x2', String(Math.cos(angle) * outer));
      line.setAttribute('y2', String(Math.sin(angle) * outer));
      line.setAttribute('opacity', String(0.22 + seededValue(i + 31) * 0.5));
      svg.appendChild(line);
    }

    // scattered dots, concentrated toward the core and thinning outward
    for (let i = 0; i < 150; i += 1) {
      const angle = seededValue(i + 61) * Math.PI * 2;
      const radius = Math.pow(seededValue(i + 83), 0.7) * 210;
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('class', 'orbit-dot');
      dot.setAttribute('cx', String(Math.cos(angle) * radius));
      dot.setAttribute('cy', String(Math.sin(angle) * radius));
      dot.setAttribute('r', String(0.6 + seededValue(i + 109) * 1.4));
      dot.setAttribute('opacity', String(0.35 + seededValue(i + 127) * 0.5));
      svg.appendChild(dot);
    }

    // crisp center: a clear ring with a small solid square inside
    const halo = document.createElementNS(NS, 'circle');
    halo.setAttribute('class', 'orbit-core-ring');
    halo.setAttribute('r', '13');
    svg.appendChild(halo);

    const core = document.createElementNS(NS, 'rect');
    core.setAttribute('class', 'orbit-core');
    core.setAttribute('x', '-4');
    core.setAttribute('y', '-4');
    core.setAttribute('width', '8');
    core.setAttribute('height', '8');
    svg.appendChild(core);

    return svg;
  }

  function initOrbitGraphic() {
    const placeholders = document.querySelectorAll('.dashboard-orbit:not([data-orbit-ready])');
    if (placeholders.length) {
      placeholders.forEach((placeholder) => {
        const variant = placeholder.dataset.otrustFigure || placeholder.dataset.figure || subpageFigureKey();
        placeholder.appendChild(createOrbitGraphicVariant(variant));
        placeholder.dataset.orbitReady = 'true';
      });
      return;
    }

    return; // monochrome edition: no standalone background orbit (prevented giant disc)
    const main = document.querySelector('#main-content .main-layout') || document.querySelector('#main-content');
    if (!main) return;

    const wrap = document.createElement('div');
    wrap.className = 'otrust-orbit-graphic';
    wrap.appendChild(createOrbitGraphicVariant(subpageFigureKey()));
    main.appendChild(wrap);
  }

  const workspaceContext = {
    timestamp: {
      label: 'Timestamp',
      number: '01',
      title: 'Create an immutable timestamp.',
      body: 'Hash, sign and submit a timestamp record without leaving the workspace.',
      checks: ['Local SHA-256 hash', 'Ed25519 signature', 'OpenTimestamps receipt']
    },
    proof: {
      label: 'ID',
      number: '02',
      title: 'Create or verify ID packages.',
      body: 'Verify an existing ID or issue a purpose-bound identity package.',
      checks: ['ID lookup', 'PIN-protected identity package', 'Shareable verification URL']
    },
    sign: {
      label: 'Sign',
      number: '03',
      title: 'Start a signing request.',
      body: 'Hash a document locally, add one signer and create a trackable signing session.',
      checks: ['Local document hash', 'Creator and signer emails', 'Status link and audit trail']
    },
    signin: {
      label: 'Auth',
      number: '04',
      title: 'Start hosted Auth.',
      body: 'Create a challenge-bound hosted login URL for ID-based partner Auth.',
      checks: ['Short-lived challenge', 'Callback state preserved', 'Visible OTRUST hosted flow']
    }
  };

  function workspaceContextMarkup(key) {
    const config = workspaceContext[key];
    if (!config) return '';
    const figure = key === 'proof' || key === 'sign' || key === 'signin' ? key : 'timestamp';
    return `
      <aside class="function-context-card">
        <div class="workspace-orbit dashboard-orbit" data-otrust-figure="${figure}" aria-hidden="true"></div>
        <span>${config.number} / ${config.label}</span>
        <h3>${config.title}</h3>
        <p>${config.body}</p>
        <ul>
          ${config.checks.map((item) => `<li>${item}</li>`).join('')}
        </ul>
      </aside>
    `;
  }

  function timestampWorkspaceMarkup() {
    return `
      <article class="function-tool-card">
        <div class="workspace-topline"><span>01</span><strong>TIMESTAMP</strong></div>
        <h2>Timestamp a file</h2>
        <label class="dashboard-drop workspace-drop" for="workspace-timestamp-file" data-workspace-drop="timestamp">
          <input id="workspace-timestamp-file" type="file">
          <span class="dashboard-drop-mark" aria-hidden="true"></span>
          <p><strong>Drop file here</strong><br><span id="workspace-timestamp-file-label">Hash locally, then anchor.</span></p>
        </label>
        <div class="workspace-actions">
          <button type="button" id="workspace-timestamp-submit" disabled>Timestamp now</button>
          <button type="button" class="secondary" id="workspace-timestamp-clear">Clear</button>
        </div>
        <p class="workspace-action-status" id="workspace-timestamp-status" aria-live="polite">No file selected.</p>
      </article>
    `;
  }

  function proofWorkspaceMarkup() {
    return `
      <article class="function-tool-card function-tool-card-proof">
        <div class="workspace-topline"><span>02</span><strong>ID</strong></div>
        <h2>Verify or create ID</h2>
        <div class="workspace-two-column">
          <div class="workspace-mini-panel">
            <h3>Verify ID</h3>
            <label><span>ID or URL</span><input id="workspace-proof-id" type="text" placeholder="id_... or /proof/id_..."></label>
            <button type="button" id="workspace-proof-verify">Verify ID</button>
            <p class="workspace-action-status" id="workspace-proof-status" aria-live="polite">Ready for ID lookup.</p>
          </div>
          <div class="workspace-mini-panel">
            <h3>Create ID</h3>
            <label><span>Personnummer</span><input id="workspace-proof-personnummer" type="text" inputmode="numeric" placeholder="YYYYMMDDXXXX"></label>
            <div class="workspace-inline-fields">
              <label><span>Birth date</span><input id="workspace-proof-birthdate" type="date"></label>
              <label><span>PIN</span><input id="workspace-proof-pin" type="password" inputmode="numeric" maxlength="6" placeholder="000000"></label>
            </div>
            <button type="button" id="workspace-proof-create">Create ID</button>
            <p class="workspace-action-status" id="workspace-proof-create-status" aria-live="polite">Sensitive data is used only to create the ID package.</p>
          </div>
        </div>
      </article>
    `;
  }

  function signWorkspaceMarkup() {
    return `
      <article class="function-tool-card">
        <div class="workspace-topline"><span>03</span><strong>SIGN</strong></div>
        <h2>Create signing request</h2>
        <label class="dashboard-drop workspace-drop compact" for="workspace-sign-file" data-workspace-drop="sign">
          <input id="workspace-sign-file" type="file">
          <span class="dashboard-drop-mark" aria-hidden="true"></span>
          <p><strong>Select document</strong><br><span id="workspace-sign-file-label">Local hash, no upload.</span></p>
        </label>
        <div class="workspace-form-grid">
          <label><span>Title</span><input id="workspace-sign-title" type="text" placeholder="Agreement title"></label>
          <label><span>Your email</span><input id="workspace-sign-creator" type="email" placeholder="you@example.com"></label>
          <label><span>Signer</span><input id="workspace-sign-party" type="email" placeholder="signer@example.com"></label>
        </div>
        <div class="workspace-actions">
          <button type="button" id="workspace-sign-submit" disabled>Create request</button>
          <button type="button" class="secondary" id="workspace-sign-clear">Clear</button>
        </div>
        <p class="workspace-action-status" id="workspace-sign-status" aria-live="polite">Choose a file and add one signer.</p>
      </article>
    `;
  }

  function signInWorkspaceMarkup() {
    return `
      <article class="function-tool-card">
        <div class="workspace-topline"><span>04</span><strong>AUTH</strong></div>
        <h2>Create Auth</h2>
        <div class="workspace-form-grid">
          <label><span>Client ID</span><input id="workspace-auth-client-id" type="text" value="otrust_dashboard"></label>
          <label><span>Redirect URI</span><input id="workspace-auth-redirect-uri" type="url"></label>
          <label><span>ID optional</span><input id="workspace-auth-proof-id" type="text" placeholder="id_..."></label>
        </div>
        <div class="workspace-actions">
          <button type="button" id="workspace-auth-submit">Start Auth</button>
        </div>
        <p class="workspace-action-status" id="workspace-auth-status" aria-live="polite">Creates a short-lived hosted login challenge.</p>
      </article>
    `;
  }

  function workspaceToolMarkup(key) {
    if (key === 'timestamp') return timestampWorkspaceMarkup();
    if (key === 'proof') return proofWorkspaceMarkup();
    if (key === 'sign') return signWorkspaceMarkup();
    if (key === 'signin') return signInWorkspaceMarkup();
    return '';
  }

  function insertFunctionWorkspace() {
    const key = currentBriefingKey();
    if (!['timestamp', 'proof', 'sign', 'signin'].includes(key) || document.querySelector('.function-workspace')) return;

    const main = document.getElementById('main-content');
    if (!main) return;

    const section = document.createElement('section');
    section.className = `function-workspace function-workspace-${key}`;
    section.dataset.workspace = key;
    section.innerHTML = `
      <div class="function-workspace-shell">
        ${workspaceToolMarkup(key)}
        ${workspaceContextMarkup(key)}
      </div>
    `;

    section.querySelectorAll('.workspace-orbit').forEach((placeholder) => {
      const variant = placeholder.dataset.otrustFigure || key || subpageFigureKey();
      placeholder.appendChild(createOrbitGraphicVariant(variant));
    });

    const briefing = main.querySelector('.subpage-briefing');
    if (briefing) {
      briefing.insertAdjacentElement('afterend', section);
    } else {
      main.prepend(section);
    }

    const redirectInput = section.querySelector('#workspace-auth-redirect-uri');
    if (redirectInput) {
      const redirectUri = new URL('/sign-in', window.location.origin);
      redirectUri.searchParams.set('workspace_callback', '1');
      redirectInput.value = redirectUri.toString();
    }
  }

  let dashboardCryptoPromise;

  function hexFromBuffer(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  function shortHex(value) {
    if (!value || value.length <= 22) return value || '';
    return `${value.slice(0, 12)}...${value.slice(-8)}`;
  }

  async function hashFileSha256(file) {
    if (!window.crypto?.subtle) {
      throw new Error('This browser does not support local SHA-256 hashing.');
    }
    return hexFromBuffer(await window.crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
  }

  async function parseJsonResponse(response) {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }

  function setDashboardStatus(target, content, type = '') {
    if (!target) return;
    target.classList.remove('success', 'error', 'pending');
    if (type) target.classList.add(type);
    target.textContent = '';
    if (content instanceof Node) {
      target.appendChild(content);
    } else {
      target.textContent = content;
    }
  }

  function statusWithLink(text, href, label = 'Open') {
    const wrap = document.createElement('span');
    wrap.append(document.createTextNode(`${text} `));
    const link = document.createElement('a');
    link.href = href;
    link.textContent = label;
    wrap.appendChild(link);
    return wrap;
  }

  function setDashboardBusy(button, isBusy, busyLabel) {
    if (!button) return;
    if (isBusy) {
      if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
      button.disabled = true;
      button.textContent = busyLabel || 'Working...';
      return;
    }
    button.textContent = button.dataset.originalText || button.textContent;
    delete button.dataset.originalText;
  }

  function parseProofId(value) {
    const raw = (value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw, window.location.origin);
      const proofMatch = url.pathname.match(/\/proof\/([^/?#]+)/);
      if (proofMatch) return proofMatch[1];
      const idParam = url.searchParams.get('proof_id') || url.searchParams.get('id');
      if (idParam) return idParam;
    } catch {
      // Fall back to token parsing below.
    }
    const match = raw.match(/(?:^|\/)(ot_[A-Za-z0-9_-]+|proof_[A-Za-z0-9_-]+|id_[A-Za-z0-9_-]+)(?:$|[?#\s])/);
    return match ? match[1] : raw.replace(/^\/+/, '').split(/[?#\s]/)[0];
  }

  function isLikelyEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value || '').trim());
  }

  function setupDashboardDrop(drop, input, onFile) {
    if (!drop || !input || typeof onFile !== 'function') return;

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) onFile(file);
    });

    ['dragenter', 'dragover'].forEach((eventName) => {
      drop.addEventListener(eventName, (event) => {
        event.preventDefault();
        drop.classList.add('dragging');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      drop.addEventListener(eventName, (event) => {
        event.preventDefault();
        drop.classList.remove('dragging');
      });
    });

    drop.addEventListener('drop', (event) => {
      const file = event.dataTransfer?.files?.[0];
      if (file) onFile(file);
    });
  }

  async function loadDashboardCrypto() {
    if (!dashboardCryptoPromise) {
      dashboardCryptoPromise = Promise.all([
        import('https://esm.sh/@noble/hashes@1.3.3/sha256'),
        import('https://esm.sh/@noble/hashes@1.3.3/utils'),
        import('https://esm.sh/@noble/ed25519@2.1.0')
      ]).then(([shaModule, utilsModule, edModule]) => ({
        sha256: shaModule.sha256,
        bytesToHex: utilsModule.bytesToHex,
        hexToBytes: utilsModule.hexToBytes,
        ed: edModule
      }));
    }
    return dashboardCryptoPromise;
  }

  async function loadDashboardKeys(cryptoTools) {
    const { ed, bytesToHex, hexToBytes } = cryptoTools;
    const stored = localStorage.getItem('otrust_keys');
    if (stored) {
      try {
        const keys = JSON.parse(stored);
        if (/^[a-f0-9]{64}$/i.test(keys.privateKey) && /^[a-f0-9]{64}$/i.test(keys.publicKey)) {
          return keys;
        }
      } catch {
        // Invalid local key cache is replaced below.
      }
    }

    const privateKey = ed.utils.randomPrivateKey();
    const publicKey = await ed.getPublicKeyAsync(privateKey);
    const keys = {
      privateKey: bytesToHex(privateKey),
      publicKey: bytesToHex(publicKey)
    };
    localStorage.setItem('otrust_keys', JSON.stringify(keys));

    try {
      // Validate the generated private key shape before returning it.
      hexToBytes(keys.privateKey);
    } catch {
      throw new Error('Could not prepare local signing key.');
    }
    return keys;
  }

  async function solveDashboardPow(challenge, difficulty, sha256) {
    const encoder = new TextEncoder();
    let nonce = 0;
    while (true) {
      const nonceHex = nonce.toString(16).padStart(16, '0');
      const hash = sha256(encoder.encode(challenge + nonceHex));

      let zeroBits = 0;
      for (const byte of hash) {
        if (byte === 0) {
          zeroBits += 8;
        } else {
          zeroBits += Math.clz32(byte) - 24;
          break;
        }
        if (zeroBits >= difficulty) break;
      }

      if (zeroBits >= difficulty) return nonceHex;
      nonce += 1;
      if (nonce % 10000 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  function initDashboardTimestamp() {
    const input = document.getElementById('dashboard-timestamp-file');
    const drop = document.querySelector('[data-dashboard-drop="timestamp"]');
    const label = document.getElementById('dashboard-timestamp-file-label');
    const button = document.getElementById('dashboard-timestamp-submit');
    const status = document.getElementById('dashboard-timestamp-status');
    if (!input || !button || !status) return;

    const state = { file: null, hash: '' };
    setupDashboardDrop(drop, input, async (file) => {
      state.file = file;
      button.disabled = true;
      setDashboardStatus(status, 'Hashing locally...', 'pending');
      try {
        state.hash = await hashFileSha256(file);
        if (label) label.textContent = `${file.name} - ${shortHex(state.hash)}`;
        button.disabled = false;
        setDashboardStatus(status, 'Ready to sign and timestamp this hash.', 'success');
      } catch (error) {
        state.hash = '';
        setDashboardStatus(status, error.message || 'Could not hash the file.', 'error');
      }
    });

    button.addEventListener('click', async () => {
      if (!state.hash || !state.file) return;
      setDashboardBusy(button, true, 'Timestamping...');
      setDashboardStatus(status, 'Preparing local signature...', 'pending');
      try {
        const cryptoTools = await loadDashboardCrypto();
        const { ed, bytesToHex, hexToBytes, sha256 } = cryptoTools;
        const keys = await loadDashboardKeys(cryptoTools);

        setDashboardStatus(status, 'Solving proof-of-work challenge...', 'pending');
        const challengeResponse = await fetch('/challenge', { headers: { Accept: 'application/json' } });
        const challengeData = await parseJsonResponse(challengeResponse);
        if (!challengeResponse.ok || !challengeData.challenge) {
          throw new Error(challengeData.message || challengeData.error || 'Could not create timestamp challenge.');
        }

        const nonce = await solveDashboardPow(challengeData.challenge, challengeData.difficulty || 0, sha256);
        const signature = await ed.signAsync(hexToBytes(state.hash), hexToBytes(keys.privateKey));

        setDashboardStatus(status, 'Submitting signed claim...', 'pending');
        const claimResponse = await fetch('/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hash: state.hash,
            signature: bytesToHex(signature),
            pubkey: keys.publicKey,
            filename: state.file.name,
            pow: { challenge: challengeData.challenge, nonce }
          })
        });
        const claimData = await parseJsonResponse(claimResponse);
        if (!claimResponse.ok) {
          throw new Error(claimData.message || claimData.error || 'Timestamp failed.');
        }

        const receiptId = claimData.receipt_id;
        if (receiptId) {
          const copy = claimData.status === 'already_registered'
            ? 'Already timestamped.'
            : 'Timestamp created.';
          setDashboardStatus(status, statusWithLink(copy, `/proof/${encodeURIComponent(receiptId)}`, 'View record'), 'success');
        } else {
          setDashboardStatus(status, 'Timestamp accepted.', 'success');
        }
      } catch (error) {
        setDashboardStatus(status, error.message || 'Timestamp failed.', 'error');
      } finally {
        setDashboardBusy(button, false);
        button.disabled = !state.hash;
      }
    });
  }

  function initDashboardProof() {
    const input = document.getElementById('dashboard-proof-id');
    const button = document.getElementById('dashboard-proof-verify');
    const status = document.getElementById('dashboard-proof-status');
    if (!input || !button || !status) return;

    button.addEventListener('click', async () => {
      const proofId = parseProofId(input.value);
      if (!proofId) {
        setDashboardStatus(status, 'Enter an ID or verification URL first.', 'error');
        return;
      }

      setDashboardBusy(button, true, 'Checking...');
      setDashboardStatus(status, 'Looking up ID metadata...', 'pending');
      try {
        const response = await fetch(`/api/proof/${encodeURIComponent(proofId)}`, { headers: { Accept: 'application/json' } });
        const data = await parseJsonResponse(response);
        if (!response.ok) {
          throw new Error(data.message || data.error || 'ID was not found.');
        }

        const proofStatus = data.status || data.proof?.status || data.verification_status || 'available';
        setDashboardStatus(status, statusWithLink(`ID ${proofStatus}.`, `/proof/${encodeURIComponent(proofId)}`, 'Open ID'), 'success');
      } catch (error) {
        setDashboardStatus(status, error.message || 'Could not verify this ID.', 'error');
      } finally {
        setDashboardBusy(button, false);
        button.disabled = false;
      }
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') button.click();
    });
  }

  function initDashboardSign() {
    const input = document.getElementById('dashboard-sign-file');
    const drop = document.querySelector('[data-dashboard-drop="sign"]');
    const label = document.getElementById('dashboard-sign-file-label');
    const creator = document.getElementById('dashboard-sign-creator');
    const signer = document.getElementById('dashboard-sign-party');
    const button = document.getElementById('dashboard-sign-submit');
    const status = document.getElementById('dashboard-sign-status');
    if (!input || !creator || !signer || !button || !status) return;

    const state = { file: null, hash: '' };
    const updateButton = () => {
      button.disabled = !state.hash || !isLikelyEmail(creator.value) || !isLikelyEmail(signer.value);
    };

    setupDashboardDrop(drop, input, async (file) => {
      state.file = file;
      button.disabled = true;
      setDashboardStatus(status, 'Hashing document locally...', 'pending');
      try {
        state.hash = await hashFileSha256(file);
        if (label) label.textContent = `${file.name} - ${shortHex(state.hash)}`;
        setDashboardStatus(status, 'Hash ready. Add both email addresses.', 'success');
      } catch (error) {
        state.hash = '';
        setDashboardStatus(status, error.message || 'Could not hash this document.', 'error');
      }
      updateButton();
    });

    [creator, signer].forEach((field) => {
      field.addEventListener('input', updateButton);
      field.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !button.disabled) button.click();
      });
    });

    button.addEventListener('click', async () => {
      if (!state.hash || !state.file) return;
      const creatorEmail = creator.value.trim();
      const signerEmail = signer.value.trim();
      if (!isLikelyEmail(creatorEmail) || !isLikelyEmail(signerEmail)) {
        setDashboardStatus(status, 'Add a valid creator email and signer email.', 'error');
        updateButton();
        return;
      }

      setDashboardBusy(button, true, 'Creating...');
      setDashboardStatus(status, 'Creating signing request...', 'pending');
      try {
        const csrfResponse = await fetch('/csrf-token', { headers: { Accept: 'application/json' } });
        const csrfData = await parseJsonResponse(csrfResponse);
        const title = state.file.name.replace(/\.[^/.]+$/, '') || 'Dashboard signing request';
        const response = await fetch('/sign/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfData.token || ''
          },
          body: JSON.stringify({
            document_hash: state.hash,
            title,
            filename: state.file.name,
            document_url: null,
            parties: [{ email: signerEmail, role: 'signer', requireOtrustProof: false }],
            signing_order: 'parallel',
            deadline: null,
            creator_email: creatorEmail,
            message: 'Created from the OTRUST dashboard quick action.'
          })
        });
        const data = await parseJsonResponse(response);
        if (!response.ok) {
          throw new Error(data.message || data.error || 'Could not create signing request.');
        }

        if (data.cancel_token && data.sign_id) {
          localStorage.setItem(`cancel_token_${data.sign_id}`, data.cancel_token);
        }
        const signId = data.sign_id || data.id;
        const href = signId
          ? `/sign/view?id=${encodeURIComponent(signId)}${data.view_token ? `&view_token=${encodeURIComponent(data.view_token)}` : ''}`
          : '/sign';
        setDashboardStatus(status, statusWithLink('Signing request created.', href, 'Open status'), 'success');
      } catch (error) {
        setDashboardStatus(status, error.message || 'Could not create signing request.', 'error');
      } finally {
        setDashboardBusy(button, false);
        updateButton();
      }
    });
  }

  function initDashboardSignIn() {
    const proofInput = document.getElementById('dashboard-auth-proof-id');
    const button = document.getElementById('dashboard-auth-submit');
    const status = document.getElementById('dashboard-auth-status');
    if (!button || !status) return;

    button.addEventListener('click', async () => {
      setDashboardBusy(button, true, 'Starting...');
      setDashboardStatus(status, 'Creating hosted Auth challenge...', 'pending');
      try {
        const redirectUri = new URL('/sign-in', window.location.origin);
        redirectUri.searchParams.set('dashboard_callback', '1');

        const response = await fetch('/api/v1/auth/challenge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: 'otrust_dashboard',
            redirectUri: redirectUri.toString(),
            scope: ['identity'],
            state: `dashboard_${Date.now()}`
          })
        });
        const data = await parseJsonResponse(response);
        if (!response.ok || !data.loginUrl) {
          throw new Error(data.message || data.error || 'Could not create hosted Auth challenge.');
        }

        const loginUrl = new URL(data.loginUrl, window.location.origin);
        const proofId = parseProofId(proofInput?.value || '');
        if (proofId) loginUrl.searchParams.set('proof_id', proofId);
        setDashboardStatus(status, statusWithLink('Challenge ready. Redirecting now.', loginUrl.toString(), 'Open login'), 'success');
        window.location.assign(loginUrl.toString());
      } catch (error) {
        setDashboardStatus(status, error.message || 'Could not start hosted Auth.', 'error');
        setDashboardBusy(button, false);
        button.disabled = false;
      }
    });

    proofInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') button.click();
    });
  }

  function initWorkspaceTimestamp() {
    const input = document.getElementById('workspace-timestamp-file');
    const drop = document.querySelector('[data-workspace-drop="timestamp"]');
    const label = document.getElementById('workspace-timestamp-file-label');
    const button = document.getElementById('workspace-timestamp-submit');
    const clearButton = document.getElementById('workspace-timestamp-clear');
    const status = document.getElementById('workspace-timestamp-status');
    if (!input || !button || !status) return;

    const state = { file: null, hash: '' };
    const reset = () => {
      state.file = null;
      state.hash = '';
      input.value = '';
      if (label) label.textContent = 'Hash locally, then anchor.';
      button.disabled = true;
      setDashboardStatus(status, 'No file selected.');
    };

    setupDashboardDrop(drop, input, async (file) => {
      state.file = file;
      button.disabled = true;
      setDashboardStatus(status, 'Hashing locally...', 'pending');
      try {
        state.hash = await hashFileSha256(file);
        if (label) label.textContent = `${file.name} - ${shortHex(state.hash)}`;
        button.disabled = false;
        setDashboardStatus(status, 'Hash ready. Submit to create a receipt.', 'success');
      } catch (error) {
        state.hash = '';
        setDashboardStatus(status, error.message || 'Could not hash the file.', 'error');
      }
    });

    button.addEventListener('click', async () => {
      if (!state.hash || !state.file) return;
      setDashboardBusy(button, true, 'Timestamping...');
      setDashboardStatus(status, 'Preparing local signature...', 'pending');
      try {
        const cryptoTools = await loadDashboardCrypto();
        const { ed, bytesToHex, hexToBytes, sha256 } = cryptoTools;
        const keys = await loadDashboardKeys(cryptoTools);
        const challengeResponse = await fetch('/challenge', { headers: { Accept: 'application/json' } });
        const challengeData = await parseJsonResponse(challengeResponse);
        if (!challengeResponse.ok || !challengeData.challenge) {
          throw new Error(challengeData.message || challengeData.error || 'Could not create timestamp challenge.');
        }
        setDashboardStatus(status, 'Solving proof-of-work challenge...', 'pending');
        const nonce = await solveDashboardPow(challengeData.challenge, challengeData.difficulty || 0, sha256);
        const signature = await ed.signAsync(hexToBytes(state.hash), hexToBytes(keys.privateKey));
        const claimResponse = await fetch('/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hash: state.hash,
            signature: bytesToHex(signature),
            pubkey: keys.publicKey,
            filename: state.file.name,
            pow: { challenge: challengeData.challenge, nonce }
          })
        });
        const claimData = await parseJsonResponse(claimResponse);
        if (!claimResponse.ok) throw new Error(claimData.message || claimData.error || 'Timestamp failed.');
        const receiptId = claimData.receipt_id;
        setDashboardStatus(
          status,
          receiptId
              ? statusWithLink(claimData.status === 'already_registered' ? 'Already timestamped.' : 'Timestamp created.', `/proof/${encodeURIComponent(receiptId)}`, 'View record')
            : 'Timestamp accepted.',
          'success'
        );
      } catch (error) {
        setDashboardStatus(status, error.message || 'Timestamp failed.', 'error');
      } finally {
        setDashboardBusy(button, false);
        button.disabled = !state.hash;
      }
    });

    clearButton?.addEventListener('click', reset);
  }

  function initWorkspaceProof() {
    const verifyInput = document.getElementById('workspace-proof-id');
    const verifyButton = document.getElementById('workspace-proof-verify');
    const verifyStatus = document.getElementById('workspace-proof-status');
    const pnrInput = document.getElementById('workspace-proof-personnummer');
    const birthInput = document.getElementById('workspace-proof-birthdate');
    const pinInput = document.getElementById('workspace-proof-pin');
    const createButton = document.getElementById('workspace-proof-create');
    const createStatus = document.getElementById('workspace-proof-create-status');

    if (verifyInput && verifyButton && verifyStatus) {
      verifyButton.addEventListener('click', async () => {
        const proofId = parseProofId(verifyInput.value);
        if (!proofId) {
          setDashboardStatus(verifyStatus, 'Enter an ID or URL first.', 'error');
          return;
        }
        setDashboardBusy(verifyButton, true, 'Checking...');
        setDashboardStatus(verifyStatus, 'Looking up ID...', 'pending');
        try {
          const response = await fetch(`/api/proof/${encodeURIComponent(proofId)}`, { headers: { Accept: 'application/json' } });
          const data = await parseJsonResponse(response);
          if (!response.ok) throw new Error(data.message || data.error || 'ID was not found.');
          const proofStatus = data.status || data.proof?.status || 'available';
          setDashboardStatus(verifyStatus, statusWithLink(`ID ${proofStatus}.`, `/proof/${encodeURIComponent(proofId)}`, 'Open ID'), 'success');
        } catch (error) {
          setDashboardStatus(verifyStatus, error.message || 'Could not verify this ID.', 'error');
        } finally {
          setDashboardBusy(verifyButton, false);
          verifyButton.disabled = false;
        }
      });
      verifyInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') verifyButton.click();
      });
    }

    if (pnrInput && birthInput && pinInput && createButton && createStatus) {
      pinInput.addEventListener('input', () => {
        pinInput.value = pinInput.value.replace(/\D/g, '').slice(0, 6);
      });

      createButton.addEventListener('click', async () => {
        const personnummer = pnrInput.value.trim();
        const birthDate = birthInput.value;
        const pin = pinInput.value.trim();
        if (!personnummer || !birthDate || !/^\d{6}$/.test(pin)) {
          setDashboardStatus(createStatus, 'Add personnummer, birth date and a 6 digit PIN.', 'error');
          return;
        }

        setDashboardBusy(createButton, true, 'Creating...');
        setDashboardStatus(createStatus, 'Creating ID package...', 'pending');
        try {
          const response = await fetch('/api/proof/identity', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              personnummer,
              birthDate,
              pin,
              faceMatch: false,
              livenessVerified: false
            })
          });
          const data = await parseJsonResponse(response);
          if (!response.ok || !data.success) {
            if (data.existingProofId) {
              setDashboardStatus(createStatus, statusWithLink('ID already exists.', `/proof/${encodeURIComponent(data.existingProofId)}`, 'Open ID'), 'success');
              return;
            }
            throw new Error(data.message || data.error || 'Could not create ID.');
          }
          setDashboardStatus(createStatus, statusWithLink('ID created.', `/proof/${encodeURIComponent(data.proofId)}`, 'Open ID'), 'success');
        } catch (error) {
          setDashboardStatus(createStatus, error.message || 'Could not create ID.', 'error');
        } finally {
          setDashboardBusy(createButton, false);
          createButton.disabled = false;
        }
      });
    }
  }

  function initWorkspaceSign() {
    const input = document.getElementById('workspace-sign-file');
    const drop = document.querySelector('[data-workspace-drop="sign"]');
    const label = document.getElementById('workspace-sign-file-label');
    const title = document.getElementById('workspace-sign-title');
    const creator = document.getElementById('workspace-sign-creator');
    const signer = document.getElementById('workspace-sign-party');
    const button = document.getElementById('workspace-sign-submit');
    const clearButton = document.getElementById('workspace-sign-clear');
    const status = document.getElementById('workspace-sign-status');
    if (!input || !title || !creator || !signer || !button || !status) return;

    const state = { file: null, hash: '' };
    const updateButton = () => {
      button.disabled = !state.hash || !isLikelyEmail(creator.value) || !isLikelyEmail(signer.value);
    };
    const reset = () => {
      state.file = null;
      state.hash = '';
      input.value = '';
      title.value = '';
      if (label) label.textContent = 'Local hash, no upload.';
      setDashboardStatus(status, 'Choose a file and add one signer.');
      updateButton();
    };

    setupDashboardDrop(drop, input, async (file) => {
      state.file = file;
      button.disabled = true;
      if (!title.value.trim()) title.value = file.name.replace(/\.[^/.]+$/, '');
      setDashboardStatus(status, 'Hashing document locally...', 'pending');
      try {
        state.hash = await hashFileSha256(file);
        if (label) label.textContent = `${file.name} - ${shortHex(state.hash)}`;
        setDashboardStatus(status, 'Hash ready. Add signer details.', 'success');
      } catch (error) {
        state.hash = '';
        setDashboardStatus(status, error.message || 'Could not hash this document.', 'error');
      }
      updateButton();
    });

    [title, creator, signer].forEach((field) => {
      field.addEventListener('input', updateButton);
      field.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !button.disabled) button.click();
      });
    });

    button.addEventListener('click', async () => {
      if (!state.hash || !state.file) return;
      const creatorEmail = creator.value.trim();
      const signerEmail = signer.value.trim();
      if (!isLikelyEmail(creatorEmail) || !isLikelyEmail(signerEmail)) {
        setDashboardStatus(status, 'Add a valid creator email and signer email.', 'error');
        updateButton();
        return;
      }

      setDashboardBusy(button, true, 'Creating...');
      setDashboardStatus(status, 'Creating signing request...', 'pending');
      try {
        const csrfResponse = await fetch('/csrf-token', { headers: { Accept: 'application/json' } });
        const csrfData = await parseJsonResponse(csrfResponse);
        const response = await fetch('/sign/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfData.token || ''
          },
          body: JSON.stringify({
            document_hash: state.hash,
            title: title.value.trim() || state.file.name.replace(/\.[^/.]+$/, '') || 'Signing request',
            filename: state.file.name,
            document_url: null,
            parties: [{ email: signerEmail, role: 'signer', requireOtrustProof: false }],
            signing_order: 'parallel',
            deadline: null,
            creator_email: creatorEmail,
            message: 'Created from the OTRUST workspace.'
          })
        });
        const data = await parseJsonResponse(response);
        if (!response.ok) throw new Error(data.message || data.error || 'Could not create signing request.');
        if (data.cancel_token && data.sign_id) localStorage.setItem(`cancel_token_${data.sign_id}`, data.cancel_token);
        const signId = data.sign_id || data.id;
        const href = signId
          ? `/sign/view?id=${encodeURIComponent(signId)}${data.view_token ? `&view_token=${encodeURIComponent(data.view_token)}` : ''}`
          : '/sign';
        setDashboardStatus(status, statusWithLink('Signing request created.', href, 'Open status'), 'success');
      } catch (error) {
        setDashboardStatus(status, error.message || 'Could not create signing request.', 'error');
      } finally {
        setDashboardBusy(button, false);
        updateButton();
      }
    });

    clearButton?.addEventListener('click', reset);
  }

  function initWorkspaceSignIn() {
    const clientInput = document.getElementById('workspace-auth-client-id');
    const redirectInput = document.getElementById('workspace-auth-redirect-uri');
    const proofInput = document.getElementById('workspace-auth-proof-id');
    const button = document.getElementById('workspace-auth-submit');
    const demoButton = document.getElementById('workspace-auth-demo');
    const status = document.getElementById('workspace-auth-status');
    if (!clientInput || !redirectInput || !button || !status) return;

    const fillDemoValues = () => {
      clientInput.value = 'otrust_dashboard';
      const redirectUri = new URL('/sign-in', window.location.origin);
      redirectUri.searchParams.set('workspace_callback', '1');
      redirectInput.value = redirectUri.toString();
      if (proofInput) proofInput.value = '';
    };

    if (!redirectInput.value) fillDemoValues();

    demoButton?.addEventListener('click', () => {
      fillDemoValues();
      setDashboardStatus(status, 'Demo values loaded. Starting hosted Auth...', 'pending');
      button.click();
    });

    button.addEventListener('click', async () => {
      const clientId = clientInput.value.trim();
      const redirectValue = redirectInput.value.trim();
      if (!clientId || !redirectValue) {
        setDashboardStatus(status, 'Client ID and redirect URI are required.', 'error');
        return;
      }

      let redirectUri;
      try {
        const parsedRedirect = new URL(redirectValue);
        if (!['https:', 'http:'].includes(parsedRedirect.protocol)) {
          throw new Error('protocol');
        }
        redirectUri = parsedRedirect.toString();
      } catch {
        setDashboardStatus(status, 'Redirect URI must be a valid http(s) URL.', 'error');
        redirectInput.focus();
        return;
      }

      setDashboardBusy(button, true, 'Starting...');
      setDashboardStatus(status, 'Creating hosted Auth challenge...', 'pending');
      try {
        const response = await fetch('/api/v1/auth/challenge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId,
            redirectUri,
            scope: ['identity'],
            state: `workspace_${Date.now()}`
          })
        });
        const data = await parseJsonResponse(response);
        if (!response.ok || !data.loginUrl) throw new Error(data.message || data.error || 'Could not create hosted Auth challenge.');
        const loginUrl = new URL(data.loginUrl, window.location.origin);
        const proofId = parseProofId(proofInput?.value || '');
        if (proofId) loginUrl.searchParams.set('proof_id', proofId);
        setDashboardStatus(status, statusWithLink('Challenge ready. Redirecting now.', loginUrl.toString(), 'Open login'), 'success');
        window.location.assign(loginUrl.toString());
      } catch (error) {
        setDashboardStatus(status, error.message || 'Could not start hosted Auth.', 'error');
        setDashboardBusy(button, false);
        button.disabled = false;
      }
    });
  }

  function initFunctionWorkspaceActions() {
    const key = document.querySelector('.function-workspace')?.dataset.workspace;
    if (key === 'timestamp') initWorkspaceTimestamp();
    if (key === 'proof') initWorkspaceProof();
    if (key === 'sign') initWorkspaceSign();
    if (key === 'signin') initWorkspaceSignIn();
    if (!key && root.dataset.otrustPage === 'signin') initWorkspaceSignIn();
  }

  function closeDashboardMenu(header) {
    const panel = header.querySelector('.dashboard-mobile-panel');
    const button = header.querySelector('.dashboard-menu');
    if (!panel || !button) return;
    panel.hidden = true;
    panel.classList.remove('open');
    header.classList.remove('menu-open');
    button.classList.remove('open');
    button.setAttribute('aria-expanded', 'false');
  }

  function initDashboardMenu() {
    document.querySelectorAll('.dashboard-site-nav').forEach((header) => {
      const links = header.querySelector('.dashboard-links');
      const button = header.querySelector('.dashboard-menu');
      if (!links || !button || header.dataset.dashboardMenuReady === 'true') return;

      let panel = header.querySelector('.dashboard-mobile-panel');
      const panelId = header.classList.contains('dashboard-site-nav-unified')
        ? 'dashboard-mobile-panel-unified'
        : header.classList.contains('dashboard-site-nav-global')
          ? 'dashboard-mobile-panel-global'
          : `dashboard-mobile-panel-${root.dataset.otrustPage || 'page'}`;

      if (!panel) {
        panel = document.createElement('div');
        panel.className = 'dashboard-mobile-panel';
        panel.id = panelId;
        panel.hidden = true;
        panel.setAttribute('aria-label', 'Mobile navigation');
        header.appendChild(panel);
      } else if (!panel.id) {
        panel.id = panelId;
      }

      panel.innerHTML = '';
      links.querySelectorAll('a').forEach((anchor) => {
        const item = anchor.cloneNode(true);
        item.addEventListener('click', () => {
          closeDashboardMenu(header);
        });
        panel.appendChild(item);
      });

      button.setAttribute('aria-controls', panel.id);
      button.setAttribute('aria-expanded', 'false');
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        document.querySelectorAll('.dashboard-site-nav.menu-open').forEach((node) => {
          if (node !== header) closeDashboardMenu(node);
        });
        const isOpen = panel.hidden;
        panel.hidden = !isOpen;
        panel.classList.toggle('open', isOpen);
        header.classList.toggle('menu-open', isOpen);
        button.classList.toggle('open', isOpen);
        button.setAttribute('aria-expanded', String(isOpen));
      });

      header.dataset.dashboardMenuReady = 'true';
      button.dataset.dashboardMenuReady = 'true';
    });

    if (root.dataset.dashboardMenuOutsideReady === 'true') return;
    document.addEventListener('click', (event) => {
      document.querySelectorAll('.dashboard-site-nav.menu-open').forEach((header) => {
        if (!header.contains(event.target)) closeDashboardMenu(header);
      });
    });
    root.dataset.dashboardMenuOutsideReady = 'true';
  }

  function initDashboardQuickActions() {
    // dashboard menu (hamburger) removed per user request
    if (root.dataset.otrustPage !== 'home' || !document.querySelector('.dashboard-home')) return;
    initDashboardTimestamp();
    initDashboardProof();
    initDashboardSign();
    initDashboardSignIn();
  }

  function applyDashboardShellClass() {
    if (document.querySelector('.dashboard-home')) {
      document.documentElement.classList.add('otrust-dashboard-shell');
    }
  }

  function initFounderEasterEgg() {
    const target = '/krisledel';
    const path = window.location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    if (path === '/krisledel') return;

    function goFounder() {
      window.location.assign(target);
    }

    const konami = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
    let konamiStep = 0;

    document.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      if (event.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;

      if (event.code === konami[konamiStep]) {
        konamiStep += 1;
        if (konamiStep === konami.length) goFounder();
        return;
      }

      konamiStep = event.code === konami[0] ? 1 : 0;
    });

    if (path !== '/about') return;

    const founder = Array.from(document.querySelectorAll('.content-card strong, article strong'))
      .find((node) => node.textContent.trim() === 'Kris Ledel');
    if (!founder) return;

    let founderClicks = 0;
    let founderTimer = null;

    founder.addEventListener('click', () => {
      founderClicks += 1;
      clearTimeout(founderTimer);
      if (founderClicks >= 3) {
        goFounder();
        return;
      }
      founderTimer = setTimeout(() => {
        founderClicks = 0;
      }, 2000);
    });
  }

  function normalizeFooter() {
    // Deluxe: ensure pages without a rich footer get a consistent simple one
    if (document.querySelector('.footer-wrapper') || document.querySelector('.dashboard-home') || document.querySelector('.changelog-page')) return;

    const main = document.querySelector('main');
    if (!main) return;

    // Broad for most content pages (legal, docs, simple, etc.)
    const page = document.body.dataset.otrustPage || document.documentElement.className || '';
    const path = window.location.pathname;
    if (path.match(/\/(proof|sign|timestamp|auth|quickstart|playground)/)) return; // keep tool pages as-is

    const wrapper = document.createElement('div');
    wrapper.className = 'footer-wrapper';
    wrapper.innerHTML = `
      <footer role="contentinfo">
        <div class="footer-links">
          <a href="/timestamp">Timestamp</a>
          <a href="/sign">Sign</a>
          <a href="/sign-in">Auth</a>
          <a href="/docs">Docs</a>
          <a href="/api-docs">Developers</a>
          <a href="/transparency">Trust Log</a>
          <a href="/privacy-policy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="https://github.com/otrust-eu/opensource" rel="noopener noreferrer">GitHub</a>
          <a href="/about">About</a>
        </div>
        <div class="footer-copy">OTRUST — MIT License</div>
      </footer>
    `;
    document.body.appendChild(wrapper);
  }

  function initEnhancements() {
    classifyPage();
    assembleDashboardShell();
    applyDashboardShellClass();
    applySubpageTemplateLayout();
    insertPageBriefing();
    syncDashboardNavigation();
    initOrbitGraphic();
    initFunctionWorkspaceActions();
    initDashboardQuickActions();
    initStatsWidgets();
    initCodeCopyButtons();
    initScrollReveal();
    initFounderEasterEgg();
    normalizeFooter();
  }

  initTheme();

  if (!hydrateNav() && !document.querySelector('.dashboard-home')) {
    const observer = new MutationObserver(() => {
      if (document.querySelector('.dashboard-home') || hydrateNav()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  initEnhancements();

  if (root.dataset.dashboardHashSyncReady !== 'true') {
    window.addEventListener('hashchange', () => syncDashboardNavigation());
    root.dataset.dashboardHashSyncReady = 'true';
  }
})();
