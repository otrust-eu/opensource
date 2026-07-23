# OTRUST Circuits

These Circom 2 circuits implement zero-knowledge proofs for age, income range,
and Merkle-tree membership.

## Prerequisites

- Node.js 20 or later
- Circom 2.1 or later on `PATH`
- `curl`

Install Circom from the official instructions:
https://docs.circom.io/getting-started/installation/

## Build and test

```bash
npm ci
npm run build
npm test
```

The build downloads the prepared Powers of Tau transcript published by snarkjs,
verifies its BLAKE2b-512 checksum, and creates local Groth16 proving keys for all
three circuits. Generated files are written to `build/` and are not committed.

The generated keys use a single local contribution and are intended for
development and evaluation. Run a documented multi-party ceremony before using
Groth16 proving keys in production.

## Published browser artifacts

The browser artifacts in `../web/circuits/` are tracked by
`../web/circuits/manifest.json`. Verify their checksums, proving and verification
key pairing, and end-to-end proof generation with:

```bash
npm run verify:published
```

The current artifacts are explicitly classified as legacy development
artifacts. `npm run verify:production` fails until a completed ceremony,
independent contributions, a public beacon, compiler provenance, and R1CS hashes
are recorded in the manifest.

See [CEREMONY.md](CEREMONY.md) for the production ceremony and release process.
