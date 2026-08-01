import fs from 'fs';

const [, action, output] = process.argv.slice(2);

if (action === '--check') {
  process.stdout.write('opentimestamps-client 0.7.2 digest support ready');
} else if (/^[a-f0-9]{64}$/i.test(action) && output) {
  fs.writeFileSync(output, Buffer.from(`proof:${action}`));
} else {
  process.exit(2);
}
