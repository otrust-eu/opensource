// Generate PWA icons
import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function generateIcon(size, filename) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  // Background - dark green gradient
  const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
  gradient.addColorStop(0, '#3d7a4d');
  gradient.addColorStop(1, '#2d5a3d');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
  ctx.fill();
  
  // Inner circle
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  ctx.arc(size/2, size/2, size * 0.35, 0, Math.PI * 2);
  ctx.fill();
  
  // Checkmark
  ctx.strokeStyle = 'white';
  ctx.lineWidth = size * 0.08;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(size * 0.28, size * 0.52);
  ctx.lineTo(size * 0.45, size * 0.68);
  ctx.lineTo(size * 0.72, size * 0.35);
  ctx.stroke();
  
  // Save
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(path.join(__dirname, filename), buffer);
  console.log(`Generated ${filename} (${size}x${size})`);
}

// Generate icons
generateIcon(192, 'icon-192.png');
generateIcon(512, 'icon-512.png');

console.log('Icons generated successfully!');
