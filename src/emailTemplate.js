/**
 * OTRUST Email Template — Bento / Monochrome Edition (2026)
 * Matches otrust-redesign.css: ink-on-paper, hairline borders, status green only for verified states.
 */

export const BRAND = {
  name: 'OTRUST',
  colors: {
    ink: '#16160f',
    inkSoft: '#34342b',
    paper: '#f6f6f2',
    paper2: '#fbfbf8',
    card: '#ffffff',
    line: '#e6e6dd',
    line2: '#d8d8cd',
    dim: '#6c6c61',
    faint: '#9b9b8f',
    status: '#2f8a57',
    statusBg: '#e9f3ec',
    statusBorder: '#c5dcc9',
    danger: '#9a3b2f',
    dangerBg: '#f8ecea',
    dangerBorder: '#e5c4be',
    warn: '#8a6a25',
    warnBg: '#f6f0e4',
    warnBorder: '#e5d9b8'
  },
  radius: '4px',
  baseUrl: process.env.BASE_URL || 'https://www.otrust.eu'
};

function productLabel(product) {
  if (product === 'Signed') return 'SIGN';
  if (product === 'Auth') return 'AUTH';
  if (product === 'ID') return 'ID';
  return 'TIMESTAMP';
}

/**
 * Wrap content in standard email shell
 */
export function emailTemplate({ title, preheader, content, footer, product = 'Timestamp', baseUrl = BRAND.baseUrl }) {
  const label = productLabel(product);
  const c = BRAND.colors;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>${title}</title>
  ${preheader ? `<!--[if !mso]><!--><span style="display:none;font-size:0;color:${c.paper};line-height:0;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</span><!--<![endif]-->` : ''}
</head>
<body style="margin:0;padding:0;background-color:${c.paper};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:${c.paper};">
    <tr>
      <td style="padding:28px 16px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin:0 auto;max-width:600px;background-color:${c.card};border:1px solid ${c.line};border-radius:${BRAND.radius};overflow:hidden;">
          <tr>
            <td style="padding:20px 28px;border-bottom:1px solid ${c.line};">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="font-weight:700;font-size:13px;letter-spacing:0.28em;color:${c.ink};">OTRUST</td>
                  <td align="right" style="font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${c.faint};">${label}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">${content}</td>
          </tr>
          <tr>
            <td style="padding:18px 28px;background-color:${c.paper2};border-top:1px solid ${c.line};">
              <p style="margin:0;font-size:11px;line-height:1.5;color:${c.faint};">
                ${footer || `${BRAND.name} · <a href="${baseUrl}" style="color:${c.dim};text-decoration:none;">${baseUrl.replace(/^https?:\/\//, '')}</a> · Made in Sweden, Europe`}
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

export function emailButton(text, href, style = 'primary') {
  const c = BRAND.colors;
  const styles = {
    primary: `background-color:${c.ink};color:#ffffff;border:1px solid ${c.ink};`,
    secondary: `background-color:${c.card};color:${c.ink};border:1px solid ${c.line2};`,
    danger: `background-color:${c.danger};color:#ffffff;border:1px solid ${c.danger};`
  };
  return `<a href="${href}" style="display:inline-block;${styles[style] || styles.primary}padding:12px 22px;border-radius:${BRAND.radius};text-decoration:none;font-weight:600;font-size:13px;letter-spacing:0.02em;">${text}</a>`;
}

export function emailButtonSecondary(text, href) {
  return emailButton(text, href, 'secondary');
}

export function emailButtonDanger(text, href) {
  return emailButton(text, href, 'danger');
}

export function emailInfoBox(content) {
  const c = BRAND.colors;
  return `<div style="background-color:${c.paper2};padding:14px 16px;border-radius:${BRAND.radius};margin:16px 0;border:1px solid ${c.line};color:${c.inkSoft};font-size:14px;line-height:1.55;">${content}</div>`;
}

export function emailSuccessBox(content) {
  const c = BRAND.colors;
  return `<div style="background-color:${c.statusBg};padding:14px 16px;border-radius:${BRAND.radius};margin:16px 0;border:1px solid ${c.statusBorder};color:${c.ink};font-size:14px;line-height:1.55;">${content}</div>`;
}

export function emailWarningBox(content) {
  const c = BRAND.colors;
  return `<div style="background-color:${c.warnBg};padding:14px 16px;border-radius:${BRAND.radius};margin:16px 0;border:1px solid ${c.warnBorder};color:${c.inkSoft};font-size:14px;line-height:1.55;">${content}</div>`;
}

export function emailErrorBox(content) {
  const c = BRAND.colors;
  return `<div style="background-color:${c.dangerBg};padding:14px 16px;border-radius:${BRAND.radius};margin:16px 0;border:1px solid ${c.dangerBorder};color:${c.danger};font-size:14px;line-height:1.55;">${content}</div>`;
}

export function emailHashBox(hash, label = 'Document fingerprint (SHA-256)') {
  const c = BRAND.colors;
  return `<div style="background-color:${c.paper2};padding:14px 16px;border-radius:${BRAND.radius};margin:16px 0;border:1px solid ${c.line2};">
    <div style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${c.faint};margin-bottom:8px;">${label}</div>
    <div style="font-family:'Courier New',Courier,monospace;font-size:11px;word-break:break-all;color:${c.ink};background:${c.card};padding:10px 12px;border-radius:${BRAND.radius};border:1px solid ${c.line};">${hash}</div>
  </div>`;
}

export function emailDetailsBox(items) {
  const c = BRAND.colors;
  const rows = items.map(([label, value]) =>
    `<tr><td style="padding:6px 0;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${c.faint};vertical-align:top;width:38%;">${label}</td><td style="padding:6px 0;font-size:14px;color:${c.ink};vertical-align:top;">${value}</td></tr>`
  ).join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:16px 0;border:1px solid ${c.line};border-radius:${BRAND.radius};background:${c.paper2};"><tr><td style="padding:14px 16px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${rows}</table></td></tr></table>`;
}

export function emailHeading(text, level = 2) {
  const c = BRAND.colors;
  const sizes = { 1: '22px', 2: '18px', 3: '15px' };
  return `<h${level} style="color:${c.ink};font-size:${sizes[level]};margin:0 0 14px 0;font-weight:600;line-height:1.25;letter-spacing:-0.01em;">${text}</h${level}>`;
}

export function emailParagraph(text) {
  const c = BRAND.colors;
  return `<p style="color:${c.inkSoft};font-size:14px;line-height:1.65;margin:0 0 14px 0;">${text}</p>`;
}

export function emailMuted(text) {
  const c = BRAND.colors;
  return `<p style="color:${c.dim};font-size:12px;line-height:1.55;margin:0 0 12px 0;">${text}</p>`;
}

export function emailActionArea(content) {
  return `<div style="text-align:center;margin:22px 0;">${content}</div>`;
}

export function emailDivider() {
  const c = BRAND.colors;
  return `<hr style="border:none;border-top:1px solid ${c.line};margin:22px 0;">`;
}

export function emailEyebrow(text) {
  const c = BRAND.colors;
  return `<p style="margin:0 0 8px 0;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${c.faint};">${text}</p>`;
}

export default {
  BRAND,
  emailTemplate,
  emailButton,
  emailButtonSecondary,
  emailButtonDanger,
  emailInfoBox,
  emailSuccessBox,
  emailWarningBox,
  emailErrorBox,
  emailHashBox,
  emailDetailsBox,
  emailHeading,
  emailParagraph,
  emailMuted,
  emailActionArea,
  emailDivider,
  emailEyebrow
};