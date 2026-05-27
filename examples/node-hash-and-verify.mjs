import { hash } from '../src/crypto.js';

const input = process.argv.slice(2).join(' ') || 'hello from OTRUST';
const digest = hash(input);

console.log(`Input: ${input}`);
console.log(`SHA-256: ${digest}`);

const apiBase = process.env.OTRUST_API || 'https://otrust.eu';
const response = await fetch(`${apiBase}/verify`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ hash: digest }),
});

console.log(`Verification status: ${response.status}`);
console.log(await response.text());
