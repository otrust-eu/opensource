/**
 * Email service for OTRUST
 * Supports Resend HTTP API or SMTP fallback
 * Now with attachment support for OTRUST Sign
 */

import nodemailer from 'nodemailer';

let sendEmail = null;
let sendEmailWithAttachment = null;

if (process.env.RESEND_API_KEY) {
  // Use Resend HTTP API (works on all platforms, no port restrictions)
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const RESEND_FROM = process.env.RESEND_FROM || 'OTRUST <noreply@otrust.eu>';
  
  sendEmail = async (to, subject, html, text = null) => {
    const payload = { from: RESEND_FROM, to, subject, html };
    if (text) payload.text = text;
    
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Resend API error: ${error}`);
    }
    
    return response.json();
  };
  
  // Send email with attachment (for OTRUST Sign)
  // attachment: { filename: string, content: Buffer | string (base64) }
  sendEmailWithAttachment = async (to, subject, html, text, attachment, fromOverride = null) => {
    const payload = { 
      from: fromOverride || RESEND_FROM, 
      to, 
      subject, 
      html 
    };
    if (text) payload.text = text;
    
    // Add attachment if provided
    if (attachment) {
      payload.attachments = [{
        filename: attachment.filename,
        content: Buffer.isBuffer(attachment.content) 
          ? attachment.content.toString('base64') 
          : attachment.content // Already base64
      }];
    }
    
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Resend API error: ${error}`);
    }
    
    return response.json();
  };
  
  console.log('[Email] Resend API configured');
} else if (process.env.SMTP_HOST) {
  // Fallback to SMTP
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  
  sendEmail = async (to, subject, html, text = null) => {
    const mailOptions = {
      from: process.env.SMTP_FROM || '"OTRUST" <noreply@otrust.eu>',
      to,
      subject,
      html
    };
    if (text) mailOptions.text = text;
    return transporter.sendMail(mailOptions);
  };
  
  // SMTP with attachment
  sendEmailWithAttachment = async (to, subject, html, text, attachment, fromOverride = null) => {
    const mailOptions = {
      from: fromOverride || process.env.SMTP_FROM || '"OTRUST" <noreply@otrust.eu>',
      to,
      subject,
      html
    };
    if (text) mailOptions.text = text;
    
    if (attachment) {
      mailOptions.attachments = [{
        filename: attachment.filename,
        content: Buffer.isBuffer(attachment.content) 
          ? attachment.content 
          : Buffer.from(attachment.content, 'base64')
      }];
    }
    
    return transporter.sendMail(mailOptions);
  };
  
  console.log('[Email] SMTP configured:', process.env.SMTP_HOST);
} else {
  // No email configured - log warning
  sendEmail = async (to, subject, html, text = null) => {
    console.warn('[Email] No email provider configured. Would send:', { to, subject });
    return { id: 'mock-' + Date.now() };
  };
  
  sendEmailWithAttachment = async (to, subject, html, text, attachment) => {
    console.warn('[Email] No email provider configured. Would send with attachment:', { to, subject, filename: attachment?.filename });
    return { id: 'mock-' + Date.now() };
  };
  
  console.log('[Email] No email provider configured (mock mode)');
}

export { sendEmail, sendEmailWithAttachment };
