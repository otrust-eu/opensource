import fs from 'fs';

const args = process.argv.slice(2);

if (args.includes('-a') || args.includes('--algorithm') || args.includes('--digest')) {
  process.stderr.write('unsupported digest arguments');
  process.exit(2);
}

if (args[0] === '--version') {
  process.stdout.write('v0.7.2');
} else if (args[0] === 'info') {
  process.stdout.write(`File sha256 hash: ${'a'.repeat(64)}\nPendingAttestation('https://example.test')\n`);
} else if (args[0] === 'verify') {
  if (!fs.existsSync(args[1]) || args[2] !== '-d' || !/^[a-f0-9]{64}$/i.test(args[3])) {
    process.exit(2);
  }
  process.stdout.write('Success! Bitcoin block 900000 attests existence as of 2026-01-01 UTC');
} else if (args[0] === 'upgrade') {
  if (!fs.existsSync(args[1])) process.exit(2);
  process.stdout.write('Success! Timestamp is complete');
} else {
  process.exit(2);
}
