/**
 * OTRUST Common JavaScript
 * 
 * Shared functionality for all pages.
 * Import this file in every HTML page.
 */

// ========================================
// Theme Toggle (Dark Mode)
// ========================================

function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = savedTheme || (prefersDark ? 'dark' : 'light');
  
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    updateThemeIcon('dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
    updateThemeIcon('light');
  }
}

function updateThemeIcon(theme) {
  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.textContent = theme === 'dark' ? '' : '';
    toggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }
}

function toggleTheme() {
  const isDark = document.documentElement.hasAttribute('data-theme');
  
  if (isDark) {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('theme', 'light');
    updateThemeIcon('light');
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('theme', 'dark');
    updateThemeIcon('dark');
  }
}

// Initialize theme immediately (before DOM ready to prevent flash)
initTheme();

// ========================================
// Mobile Menu Toggle
// ========================================

function initMobileMenu() {
  const menuBtn = document.getElementById('mobile-menu-btn');
  const navSecondary = document.getElementById('nav-secondary');
  
  if (menuBtn && navSecondary) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navSecondary.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', navSecondary.classList.contains('open'));
    });
    
    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!navSecondary.contains(e.target) && !menuBtn.contains(e.target)) {
        navSecondary.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
      }
    });
    
    // Close menu on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && navSecondary.classList.contains('open')) {
        navSecondary.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
        menuBtn.focus();
      }
    });
  }
}

// ========================================
// Countdown Timer
// ========================================

/**
 * Initialize a countdown timer
 * @param {string} elementId - ID of the element to show countdown
 * @param {Date|string} targetTime - Target time to count down to
 * @param {object} options - Configuration options
 */
function initCountdown(elementId, targetTime, options = {}) {
  const element = document.getElementById(elementId);
  if (!element) return null;
  
  const target = new Date(targetTime).getTime();
  const {
    onExpire = () => {},
    urgentThreshold = 5 * 60 * 1000, // 5 minutes
    showSeconds = true,
    prefix = '',
    expiredText = 'Expired'
  } = options;
  
  function update() {
    const now = Date.now();
    const diff = target - now;
    
    if (diff <= 0) {
      element.classList.add('expired');
      element.classList.remove('urgent');
      element.querySelector('.countdown-time').textContent = expiredText;
      onExpire();
      return false;
    }
    
    // Calculate time parts
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    // Format time string
    let timeStr = '';
    if (hours > 0) {
      timeStr = `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      timeStr = showSeconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
    } else {
      timeStr = `${seconds}s`;
    }
    
    element.querySelector('.countdown-time').textContent = prefix + timeStr;
    
    // Add urgent class if under threshold
    if (diff <= urgentThreshold) {
      element.classList.add('urgent');
    } else {
      element.classList.remove('urgent');
    }
    
    return true;
  }
  
  // Initial update
  if (update()) {
    // Continue updating
    const interval = setInterval(() => {
      if (!update()) {
        clearInterval(interval);
      }
    }, 1000);
    
    return interval;
  }
  
  return null;
}

/**
 * Create countdown HTML element
 * @param {string} id - Element ID
 * @param {string} label - Label text
 * @returns {string} HTML string
 */
function createCountdownHTML(id, label = 'Time remaining') {
  return `
    <div id="${id}" class="countdown">
      <span class="countdown-icon"></span>
      <span class="countdown-label">${label}:</span>
      <span class="countdown-time">--:--</span>
    </div>
  `;
}

// ========================================
// Utility Functions
// ========================================

/**
 * Format a date for display
 * @param {Date|string} date - Date to format
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string
 */
function formatDate(date, options = {}) {
  const d = new Date(date);
  const defaults = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  return d.toLocaleDateString('en-US', { ...defaults, ...options });
}

/**
 * Format a relative time (e.g., "2 hours ago")
 * @param {Date|string} date - Date to format
 * @returns {string} Relative time string
 */
function formatRelativeTime(date) {
  const d = new Date(date);
  const now = new Date();
  const diff = now - d;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'Just now';
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} Success status
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch (e) {
      document.body.removeChild(textarea);
      return false;
    }
  }
}

/**
 * Show a toast notification
 * @param {string} message - Message to show
 * @param {string} type - Type: 'success', 'error', 'warning', 'info'
 * @param {number} duration - Duration in ms (default 3000)
 */
function showToast(message, type = 'info', duration = 3000) {
  // Remove existing toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 0.85rem;
    font-weight: 500;
    z-index: 9999;
    animation: slideIn 0.3s ease;
    background: var(--${type === 'success' ? 'success' : type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'text'});
    color: white;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  `;
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ========================================
// DOM Ready Handler
// ========================================

document.addEventListener('DOMContentLoaded', () => {
  // Initialize theme toggle
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }
  
  // Initialize mobile menu
  initMobileMenu();
});

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initTheme,
    toggleTheme,
    initCountdown,
    createCountdownHTML,
    formatDate,
    formatRelativeTime,
    copyToClipboard,
    showToast
  };
}
