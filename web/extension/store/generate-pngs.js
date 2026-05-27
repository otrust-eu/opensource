import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to draw rounded rect
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Icon 128x128
function createIcon128() {
  const canvas = createCanvas(128, 128);
  const ctx = canvas.getContext('2d');
  
  // Background gradient (simulate with solid color)
  const grad = ctx.createLinearGradient(0, 0, 128, 128);
  grad.addColorStop(0, '#2d5a3d');
  grad.addColorStop(1, '#1e4029');
  ctx.fillStyle = grad;
  roundRect(ctx, 0, 0, 128, 128, 24);
  ctx.fill();
  
  // Clock circle
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(64, 64, 32, 0, Math.PI * 2);
  ctx.stroke();
  
  // Clock hands
  ctx.beginPath();
  ctx.moveTo(64, 44);
  ctx.lineTo(64, 64);
  ctx.lineTo(78, 71);
  ctx.stroke();
  
  return canvas.toBuffer('image/png');
}

// Promo 440x280
function createPromo440() {
  const canvas = createCanvas(440, 280);
  const ctx = canvas.getContext('2d');
  
  // Background
  const gradBg = ctx.createLinearGradient(0, 0, 440, 280);
  gradBg.addColorStop(0, '#fafaf9');
  gradBg.addColorStop(1, '#f5f5f4');
  ctx.fillStyle = gradBg;
  ctx.fillRect(0, 0, 440, 280);
  
  // Icon box
  const gradIcon = ctx.createLinearGradient(170, 50, 270, 150);
  gradIcon.addColorStop(0, '#2d5a3d');
  gradIcon.addColorStop(1, '#1e4029');
  ctx.fillStyle = gradIcon;
  roundRect(ctx, 170, 50, 100, 100, 20);
  ctx.fill();
  
  // Clock
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(220, 100, 28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(220, 84);
  ctx.lineTo(220, 100);
  ctx.lineTo(232, 106);
  ctx.stroke();
  
  // Text
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 28px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('OTRUST', 220, 190);
  
  ctx.fillStyle = '#737373';
  ctx.font = '14px Arial';
  ctx.fillText('Blockchain Timestamp Service', 220, 218);
  
  ctx.fillStyle = '#2d5a3d';
  ctx.font = '12px Arial';
  ctx.fillText('Timestamp any webpage with one click', 220, 250);
  
  return canvas.toBuffer('image/png');
}

// Marquee 1400x560
function createMarquee() {
  const canvas = createCanvas(1400, 560);
  const ctx = canvas.getContext('2d');
  
  // Background
  const gradBg = ctx.createLinearGradient(0, 0, 1400, 560);
  gradBg.addColorStop(0, '#fafaf9');
  gradBg.addColorStop(1, '#f0f0ef');
  ctx.fillStyle = gradBg;
  ctx.fillRect(0, 0, 1400, 560);
  
  // Large icon
  const gradIcon = ctx.createLinearGradient(600, 120, 800, 320);
  gradIcon.addColorStop(0, '#2d5a3d');
  gradIcon.addColorStop(1, '#1e4029');
  ctx.fillStyle = gradIcon;
  roundRect(ctx, 600, 120, 200, 200, 40);
  ctx.fill();
  
  // Clock
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(700, 220, 60, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(700, 180);
  ctx.lineTo(700, 220);
  ctx.lineTo(728, 234);
  ctx.stroke();
  
  // Text
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 56px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('OTRUST', 700, 390);
  
  ctx.fillStyle = '#737373';
  ctx.font = '24px Arial';
  ctx.fillText('Blockchain Timestamp Service', 700, 430);
  
  ctx.fillStyle = '#2d5a3d';
  ctx.font = '20px Arial';
  ctx.fillText('Timestamp any webpage with one click', 700, 480);
  
  return canvas.toBuffer('image/png');
}

// Screenshot 1280x800
function createScreenshot() {
  const canvas = createCanvas(1280, 800);
  const ctx = canvas.getContext('2d');
  
  // Browser chrome background
  ctx.fillStyle = '#f5f5f4';
  ctx.fillRect(0, 0, 1280, 800);
  
  // Browser toolbar
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 1280, 80);
  ctx.fillStyle = '#e5e5e5';
  ctx.fillRect(0, 79, 1280, 1);
  
  // URL bar
  ctx.fillStyle = '#f5f5f4';
  roundRect(ctx, 200, 25, 700, 30, 6);
  ctx.fill();
  ctx.fillStyle = '#737373';
  ctx.font = '13px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('example.com/my-document', 215, 45);
  
  // Extension popup (simulated)
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.15)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 4;
  roundRect(ctx, 800, 90, 340, 320, 12);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  
  // Popup header
  const gradHeader = ctx.createLinearGradient(800, 90, 1140, 140);
  gradHeader.addColorStop(0, '#2d5a3d');
  gradHeader.addColorStop(1, '#1e4029');
  ctx.fillStyle = gradHeader;
  roundRect(ctx, 800, 90, 340, 50, 12);
  ctx.fill();
  ctx.fillStyle = '#2d5a3d';
  ctx.fillRect(800, 120, 340, 20);
  
  ctx.fillStyle = 'white';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('OTRUST', 970, 122);
  
  // Popup content
  ctx.fillStyle = '#fafaf9';
  ctx.fillRect(815, 155, 310, 45);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = '11px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('TIMESTAMP CURRENT PAGE', 825, 175);
  
  // Primary button
  const gradBtn = ctx.createLinearGradient(815, 210, 1125, 250);
  gradBtn.addColorStop(0, '#2d5a3d');
  gradBtn.addColorStop(1, '#1e4029');
  ctx.fillStyle = gradBtn;
  roundRect(ctx, 815, 210, 310, 45, 10);
  ctx.fill();
  ctx.fillStyle = 'white';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Timestamp This Page', 970, 238);
  
  // Secondary buttons
  ctx.fillStyle = '#fafaf9';
  ctx.strokeStyle = '#e5e5e5';
  ctx.lineWidth = 1;
  roundRect(ctx, 815, 265, 150, 35, 8);
  ctx.fill();
  ctx.stroke();
  roundRect(ctx, 975, 265, 150, 35, 8);
  ctx.fill();
  ctx.stroke();
  
  ctx.fillStyle = '#1a1a1a';
  ctx.font = '12px Arial';
  ctx.fillText('Verify', 890, 288);
  ctx.fillText('History', 1050, 288);
  
  // Success result
  ctx.fillStyle = '#e8f0eb';
  ctx.strokeStyle = '#a7d4b8';
  ctx.lineWidth = 1;
  roundRect(ctx, 815, 315, 310, 80, 8);
  ctx.fill();
  ctx.stroke();
  
  ctx.fillStyle = '#2d5a3d';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('✓ Timestamped!', 830, 340);
  
  ctx.fillStyle = '#737373';
  ctx.font = '11px Arial';
  ctx.fillText('Receipt', 830, 360);
  ctx.fillText('Hash', 830, 380);
  
  ctx.fillStyle = '#1a1a1a';
  ctx.font = '11px Arial';
  ctx.textAlign = 'right';
  ctx.fillText('ot_abc123xyz', 1110, 360);
  ctx.fillText('7f83b165...', 1110, 380);
  
  // Page content area
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(50, 120, 700, 600);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 32px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('My Important Document', 80, 180);
  
  ctx.fillStyle = '#737373';
  ctx.font = '16px Arial';
  const lines = [
    'This document was created on December 25, 2025.',
    'The content has been timestamped using OTRUST,',
    'providing cryptographic proof of existence.',
    '',
    'Lorem ipsum dolor sit amet, consectetur',
    'adipiscing elit. Sed do eiusmod tempor.'
  ];
  lines.forEach((line, i) => {
    ctx.fillText(line, 80, 220 + i * 28);
  });
  
  return canvas.toBuffer('image/png');
}

// Generate all files
const storeDir = __dirname;

fs.writeFileSync(path.join(storeDir, 'icon-128.png'), createIcon128());
console.log('✓ Created icon-128.png');

fs.writeFileSync(path.join(storeDir, 'promo-440x280.png'), createPromo440());
console.log('✓ Created promo-440x280.png');

fs.writeFileSync(path.join(storeDir, 'marquee-1400x560.png'), createMarquee());
console.log('✓ Created marquee-1400x560.png');

fs.writeFileSync(path.join(storeDir, 'screenshot-1280x800.png'), createScreenshot());
console.log('✓ Created screenshot-1280x800.png');

console.log('\nAll assets created in:', storeDir);
