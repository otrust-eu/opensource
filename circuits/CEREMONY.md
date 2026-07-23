# OTRUST Groth16 production ceremony

This runbook covers the circuit-specific phase 2 ceremony for the browser
proving keys. It does not turn the local `npm run build` output into production
keys. The committed browser artifacts remain development-only until every
production gate below passes.

## Roles and records

- Assign one coordinator who never contributes entropy.
- Use at least two independent contributors on separate machines.
- Publish contributor identifiers, input and output SHA-256 checksums, UTC
  timestamps, and signed attestations.
- Choose a public beacon value from an unpredictable event announced before
  contributions close and observed only after they close.
- Keep the complete transcript and attestations in a durable public release.

No contributor should reveal or retain their entropy. One honest contributor is
enough to protect the setup, but OTRUST policy requires at least two documented
independent contributions.

## 1. Freeze the build

1. Create a ceremony branch from a reviewed commit.
2. Pin Node.js, Circom, `snarkjs`, `circomlib`, and `circomlibjs` to exact
   versions. Do not use version ranges.
3. Build in a clean environment with Circom 2.2.3.
4. Record SHA-256 checksums for every `.circom`, `.r1cs`, and `.wasm` file.
5. Verify the Powers of Tau BLAKE2b-512 checksum already pinned in
   `scripts/trusted-setup.js`.
6. Have a second operator reproduce the R1CS and WASM checksums.

Any source, dependency, or compiler change invalidates the ceremony and starts a
new one.

## 2. Create initial keys

For each circuit, the coordinator creates an initial key:

```bash
npx snarkjs groth16 setup build/ageProof.r1cs build/pot14_final.ptau ceremony/ageProof_0000.zkey
npx snarkjs groth16 setup build/incomeProof.r1cs build/pot14_final.ptau ceremony/incomeProof_0000.zkey
```

Publish the initial checksums before accepting contributions.

## 3. Collect contributions

Each contributor verifies the received checksum, works on an offline machine,
and runs the following command for every circuit:

```bash
npx snarkjs zkey contribute ceremony/ageProof_0000.zkey ceremony/ageProof_0001.zkey --name="participant-id" -v
```

Use the previous participant's output as the next participant's input. Let
`snarkjs` prompt for entropy; do not put entropy in shell history. After each
handoff, the coordinator runs:

```bash
npx snarkjs zkey verify build/ageProof.r1cs build/pot14_final.ptau ceremony/ageProof_0001.zkey
```

Repeat for every circuit and contributor. Reject a contribution if its input
checksum is not the last published output checksum.

## 4. Apply the public beacon

After contributions close, record the beacon source and value. Apply the same
publicly verifiable process to each circuit:

```bash
npx snarkjs zkey beacon ceremony/ageProof_last.zkey ceremony/ageProof_final.zkey BEACON_HEX 10 --name="OTRUST final beacon"
npx snarkjs zkey verify build/ageProof.r1cs build/pot14_final.ptau ceremony/ageProof_final.zkey
npx snarkjs zkey export verificationkey ceremony/ageProof_final.zkey ceremony/ageProof_vkey.json
```

The beacon must not be selected by the coordinator or known before the
contribution window closes.

## 5. Publish atomically

1. Copy the reviewed WASM, final proving keys, and exported verification keys to
   `web/circuits/`.
2. Update `web/circuits/manifest.json` with exact compiler provenance, source and
   R1CS checksums, contributor attestations, beacon source/value, coordinator,
   and finalization time.
3. Set `ceremony.status` to `complete` and `ceremony.productionReady` to `true`
   only after the public transcript is available.
4. Run:

```bash
npm run verify:production
```

5. Have a second operator run the same command from a clean clone.
6. Publish all browser artifacts in one versioned release. Avoid mixed caches of
   old WASM and new keys.

Never overwrite a production ceremony in place. A circuit or toolchain change
requires a new version and a new ceremony.
