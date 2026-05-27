(function () {
  const root = document.documentElement;
  const themeKey = 'theme';
  const docsPaths = ['/docs', '/docs.html', '/api-docs', '/api-docs.html', '/playground', '/playground/'];

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

    const hrefUrl = new URL(anchor.href, window.location.origin);
    const hrefPath = hrefUrl.pathname;
    const current = window.location.pathname;
    const normalizedHref = hrefPath.replace(/\.html$/, '').replace(/\/$/, '') || '/';
    const normalizedCurrent = current.replace(/\.html$/, '').replace(/\/$/, '') || '/';

    if ((current === '/' || current === '/index.html') && hrefPath === '/') return true;
    if (['/sign-in', '/signin', '/login'].includes(normalizedCurrent) && normalizedHref === '/sign-in') return true;
    if ((normalizedCurrent === '/sign' || normalizedCurrent.startsWith('/sign/')) && normalizedHref === '/sign') return true;
    if ((normalizedCurrent === '/proof' || normalizedCurrent.startsWith('/proof/')) && normalizedHref === '/proof') return true;
    if ((current === '/docs' || current === '/docs.html') && (hrefPath === '/docs' || hrefPath === '/docs.html')) return true;
    if ((current === '/api-docs' || current === '/api-docs.html') && (hrefPath === '/api-docs' || hrefPath === '/api-docs.html')) return true;
    if (current.startsWith('/playground') && hrefPath.startsWith('/playground')) return true;
    if ((current === '/about' || current === '/about.html') && (hrefPath === '/about' || hrefPath === '/about.html')) return true;
    if (normalizedHref === normalizedCurrent) return true;

    return false;
  }

  function syncActiveLinks(nav) {
    nav.querySelectorAll('.nav-links a, .docs-submenu-bar a').forEach((anchor) => {
      anchor.classList.toggle('active', isCurrentLink(anchor));
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
    const savedTheme = localStorage.getItem(themeKey);
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(savedTheme || (prefersDark ? 'dark' : 'light'));
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
    const menuButton = navLinks.querySelector('.mobile-menu-btn');
    const navSecondary = navLinks.querySelector('.nav-secondary');
    const mobilePanel = navLinks.closest('nav')?.querySelector('.mobile-nav-panel');

    navLinks.classList.remove('nav-open');
    navSecondary?.classList.remove('open');
    mobilePanel?.classList.remove('open');
    if (mobilePanel) mobilePanel.hidden = true;
    menuButton?.classList.remove('open');
    menuButton?.setAttribute('aria-expanded', 'false');
  }

  function hydrateNav() {
    const nav = document.querySelector('nav[role="navigation"], nav.main-nav, nav');
    if (!nav || nav.dataset.otrustHydrated === 'true') return false;

    const navLinks = nav.querySelector('.nav-links');
    if (!navLinks) return false;

    const navSecondary = navLinks.querySelector('.nav-secondary');
    if (navSecondary && !navSecondary.id) navSecondary.id = 'nav-secondary';

    const themeButton = ensureButton(navLinks, 'theme-toggle', 'theme-toggle', 'Toggle color theme');
    const menuButton = ensureButton(navLinks, 'mobile-menu-btn', 'mobile-menu-btn', 'Menu');
    const mobilePanel = buildMobileNavPanel(nav, navLinks);
    const docsBar = document.getElementById('docs-submenu-bar') || document.querySelector('.docs-submenu-bar');
    const docsTrigger = navLinks.querySelector('.docs-trigger');

    menuButton.setAttribute('aria-controls', mobilePanel.id);
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const isOpen = !mobilePanel.classList.contains('open');
      navLinks.classList.toggle('nav-open', isOpen);
      if (navSecondary) navSecondary.classList.toggle('open', isOpen);
      mobilePanel.classList.toggle('open', isOpen);
      mobilePanel.hidden = !isOpen;
      menuButton.classList.toggle('open', isOpen);
      menuButton.setAttribute('aria-expanded', String(isOpen));
    }, true);

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
    applyTheme(root.hasAttribute('data-theme') ? 'dark' : 'light');
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
    const targets = document.querySelectorAll('.feature-card, .endpoint, .function-card, .content-card, .proof-type');
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

  function initEnhancements() {
    initStatsWidgets();
    initCodeCopyButtons();
    initScrollReveal();
  }

  initTheme();

  if (!hydrateNav()) {
    const observer = new MutationObserver(() => {
      if (hydrateNav()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  initEnhancements();

  window.addEventListener('hashchange', () => syncActiveLinks(document));
})();
