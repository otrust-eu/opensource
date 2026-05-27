# OTRUST Circuits

Experimental Circom circuits for privacy-preserving attribute proofs.

Included circuits:

- `ageProof.circom`
- `incomeProof.circom`
- `membershipProof.circom`

Generated `.wasm`, `.zkey`, `.r1cs`, and `.sym` files are intentionally excluded from this repository.

## Requirements

- Node.js 18+
- Circom installed locally
- `snarkjs`

## Usage

```bash
npm install
npm run compile:all
```

Trusted setup scripts are included for local development and experimentation. Do not reuse local development proving keys for production systems.
