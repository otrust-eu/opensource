/**
 * OTRUST Email Template
 * 
 * Consistent branding across all emails
 * Colors match the web design system
 */

const BRAND = {
  name: 'OTRUST',
  colors: {
    // Light theme
    accent: '#2d5a3d',
    accentHover: '#1e4029',
    accentLight: '#e8f0eb',
    success: '#22c55e',
    successLight: '#f0fdf4',
    successBorder: '#bbf7d0',
    warning: '#f59e0b',
    warningLight: '#fef3c7',
    warningBorder: '#fcd34d',
    text: '#1a1a1a',
    textDim: '#737373',
    textMuted: '#999999',
    bg: '#fafaf9',
    bgCard: '#ffffff',
    bgMuted: '#f5f5f4',
    border: '#e5e5e5'
  },
  baseUrl: process.env.BASE_URL || 'https://www.otrust.eu'
};

/**
 * Wrap content in standard email template
 */
export function emailTemplate({ title, preheader, content, footer, product = 'Timestamp' }) {
  const productBadge = product === 'Signed' 
    ? `<span style="font-family: 'Georgia', serif; font-style: italic; font-size: 20px; color: ${BRAND.colors.accent}; margin-left: 4px;">Signed</span>`
    : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>${title}</title>
  ${preheader ? `<!--[if !mso]><!--><span style="display:none;font-size:0;color:#fafaf9;line-height:0;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</span><!--<![endif]-->` : ''}
</head>
<body style="margin:0;padding:0;background-color:${BRAND.colors.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:${BRAND.colors.bg};">
    <tr>
      <td style="padding:20px 0;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin:0 auto;max-width:600px;background-color:${BRAND.colors.bgCard};border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
          
          <!-- Header -->
          <tr>
            <td style="padding:24px 32px;border-bottom:1px solid ${BRAND.colors.border};">
              <span style="font-weight:600;font-size:18px;color:${BRAND.colors.text};">OTRUST</span>
              ${productBadge}
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;background-color:${BRAND.colors.bgMuted};border-top:1px solid ${BRAND.colors.border};">
              <p style="margin:0;font-size:12px;color:${BRAND.colors.textMuted};">
                ${footer || `OTRUST${product === 'Signed' ? ' Signed' : ''} · <a href="${BRAND.baseUrl}" style="color:${BRAND.colors.textMuted};">${BRAND.baseUrl}</a>`}
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Primary action button
 */
export function emailButton(text, href, style = 'primary') {
  const bg = style === 'primary' ? BRAND.colors.accent : BRAND.colors.bgMuted;
  const color = style === 'primary' ? '#ffffff' : BRAND.colors.text;
  const border = style === 'primary' ? BRAND.colors.accent : BRAND.colors.border;
  
  return `
    <a href="${href}" style="display:inline-block;background-color:${bg};color:${color};padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;border:1px solid ${border};">
      ${text}
    </a>`;
}

/**
 * Secondary button (for multiple actions)
 */
export function emailButtonSecondary(text, href) {
  return emailButton(text, href, 'secondary');
}

/**
 * Info box (neutral)
 */
export function emailInfoBox(content, icon = 'ℹ️') {
  return `
    <div style="background-color:${BRAND.colors.bgMuted};padding:16px;border-radius:8px;margin:16px 0;border:1px solid ${BRAND.colors.border};">
      ${icon ? `<span style="margin-right:8px;">${icon}</span>` : ''}${content}
    </div>`;
}

/**
 * Success box (green)
 */
export function emailSuccessBox(content, icon = '') {
  return `
    <div style="background-color:${BRAND.colors.successLight};padding:16px;border-radius:8px;margin:16px 0;border:1px solid ${BRAND.colors.successBorder};">
      ${icon ? `<span style="margin-right:8px;">${icon}</span>` : ''}${content}
    </div>`;
}

/**
 * Warning box (yellow)
 */
export function emailWarningBox(content, icon = '') {
  return `
    <div style="background-color:${BRAND.colors.warningLight};padding:16px;border-radius:8px;margin:16px 0;border:1px solid ${BRAND.colors.warningBorder};">
      ${icon ? `<span style="margin-right:8px;">${icon}</span>` : ''}${content}
    </div>`;
}

/**
 * Hash display box (for document fingerprints)
 */
export function emailHashBox(hash, label = 'Document Fingerprint (SHA-256)') {
  return `
    <div style="background-color:${BRAND.colors.successLight};padding:16px;border-radius:8px;margin:16px 0;border:2px solid ${BRAND.colors.success};">
      <strong style="color:#166534;">${label}</strong>
      <div style="font-family:'Courier New',Courier,monospace;font-size:11px;word-break:break-all;background-color:white;padding:12px;border-radius:4px;margin-top:8px;border:1px solid ${BRAND.colors.successBorder};">
        ${hash}
      </div>
    </div>`;
}

/**
 * Key-value details box
 */
export function emailDetailsBox(items) {
  const rows = items.map(([label, value]) => 
    `<p style="margin:0 0 8px 0;"><strong>${label}:</strong> ${value}</p>`
  ).join('');
  
  return `
    <div style="background-color:${BRAND.colors.bgMuted};padding:16px;border-radius:8px;margin:16px 0;">
      ${rows}
    </div>`;
}

/**
 * Title/heading
 */
export function emailHeading(text, level = 2) {
  const sizes = { 1: '24px', 2: '20px', 3: '16px' };
  return `<h${level} style="color:${BRAND.colors.text};font-size:${sizes[level]};margin:0 0 16px 0;font-weight:600;">${text}</h${level}>`;
}

/**
 * Paragraph
 */
export function emailParagraph(text) {
  return `<p style="color:${BRAND.colors.text};font-size:14px;line-height:1.6;margin:0 0 16px 0;">${text}</p>`;
}

/**
 * Muted text
 */
export function emailMuted(text) {
  return `<p style="color:${BRAND.colors.textDim};font-size:13px;line-height:1.5;margin:0 0 12px 0;">${text}</p>`;
}

/**
 * Centered action area
 */
export function emailActionArea(content) {
  return `
    <div style="text-align:center;margin:24px 0;">
      ${content}
    </div>`;
}

/**
 * Horizontal rule
 */
export function emailDivider() {
  return `<hr style="border:none;border-top:1px solid ${BRAND.colors.border};margin:24px 0;">`;
}

export default {
  emailTemplate,
  emailButton,
  emailButtonSecondary,
  emailInfoBox,
  emailSuccessBox,
  emailWarningBox,
  emailHashBox,
  emailDetailsBox,
  emailHeading,
  emailParagraph,
  emailMuted,
  emailActionArea,
  emailDivider,
  BRAND
};
