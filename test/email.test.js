/**
 * Email functionality tests
 * Tests email transporter setup and notification sending
 */

import nodemailer from 'nodemailer';
import {
  emailTemplate,
  emailHeading,
  emailParagraph,
  emailDetailsBox,
  emailButton,
  emailButtonSecondary,
  emailMuted,
  emailActionArea,
  emailSuccessBox,
  BRAND
} from '../src/emailTemplate.js';

describe('Email Module', () => {
  
  describe('Email Validation', () => {
    const isValidEmail = (email) => {
      if (typeof email !== 'string') return false;
      if (email.length > 254) return false;
      return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(email);
    };

    test('validates common email formats', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
      expect(isValidEmail('user.name@example.com')).toBe(true);
      expect(isValidEmail('user+tag@example.com')).toBe(true);
      expect(isValidEmail('user@sub.example.com')).toBe(true);
    });

    test('rejects invalid emails', () => {
      expect(isValidEmail('invalid')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail(null)).toBe(false);
    });
  });

  describe('Email Transporter Creation', () => {
    test('creates SMTP transporter with correct config', () => {
      const config = {
        host: 'smtp.example.com',
        port: 465,
        secure: true,
        auth: {
          user: 'testuser',
          pass: 'testpass'
        }
      };
      
      const transporter = nodemailer.createTransport(config);
      
      expect(transporter).toBeDefined();
      expect(transporter.options.host).toBe('smtp.example.com');
      expect(transporter.options.port).toBe(465);
      expect(transporter.options.secure).toBe(true);
    });

    test('creates Resend-compatible transporter', () => {
      const config = {
        host: 'smtp.resend.com',
        port: 465,
        secure: true,
        auth: {
          user: 'resend',
          pass: 're_test_api_key'
        }
      };
      
      const transporter = nodemailer.createTransport(config);
      
      expect(transporter).toBeDefined();
      expect(transporter.options.host).toBe('smtp.resend.com');
    });
  });

  describe('Email Content Generation', () => {
    test('generates confirmation email HTML', () => {
      const claim = {
        id: 'abc123xyz456',
        hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        created_at: '2026-01-01T12:00:00.000Z'
      };
      const blockHeight = 876543;
      const baseUrl = 'https://otrust.eu';
      
      const html = generateConfirmationEmailHtml(claim, blockHeight, baseUrl);
      
      expect(html).toContain('Bitcoin');
      expect(html).toContain(claim.id);
      expect(html).toContain(blockHeight.toString());
      expect(html).toContain(baseUrl);
      expect(html).toContain(BRAND.colors.ink);
      expect(html).not.toContain('#2d5a3d');
    });

    test('generates test email HTML', () => {
      const html = generateTestEmailHtml();
      
      expect(html).toContain('OTRUST');
      expect(html).toContain('Email test');
      expect(html).toContain(BRAND.colors.ink);
      expect(html).not.toContain('#2d5a3d');
    });
  });
});

function generateConfirmationEmailHtml(claim, blockHeight, baseUrl) {
  const proofUrl = `${baseUrl}/proof/${claim.id}?format=ots`;
  const verifyUrl = `${baseUrl}/proof/${claim.id}`;

  const content = [
    emailHeading('Bitcoin confirmed'),
    emailParagraph('Your timestamp has been confirmed on the Bitcoin blockchain.'),
    emailDetailsBox([
      ['Receipt ID', claim.id],
      ['Hash', `<code style="font-size:12px;">${claim.hash}</code>`],
      ['Bitcoin Block', blockHeight],
      ['Timestamp', claim.created_at]
    ]),
    emailActionArea(`
      ${emailButton('View receipt', verifyUrl)}
      &nbsp;&nbsp;
      ${emailButtonSecondary('Download .ots proof', proofUrl)}
    `),
    emailMuted('Bitcoin confirmation is permanent.')
  ].join('');

  return emailTemplate({
    title: `Bitcoin confirmed — ${claim.id}`,
    preheader: 'Your timestamp has been confirmed on the Bitcoin blockchain',
    content,
    baseUrl,
    product: 'Timestamp'
  });
}

function generateTestEmailHtml() {
  return emailTemplate({
    title: 'OTRUST email test',
    preheader: 'Email notifications are working',
    content: [
      emailHeading('Email test'),
      emailParagraph('If you are reading this, OTRUST email notifications are working.'),
      emailMuted(`Sent at: ${new Date().toISOString()}`)
    ].join(''),
    product: 'Timestamp'
  });
}