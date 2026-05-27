// OTRUST Proof - Membership Proof Circuit
// Proves: "I am a member of this group" without revealing which member
//
// Use case: Prove you're an employee without revealing your identity

pragma circom 2.1.0;

include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/poseidon.circom";

// Merkle tree inclusion proof
template MerkleProof(levels) {
    signal input leaf;
    signal input root;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    signal output valid;

    component hashers[levels];
    signal hashes[levels + 1];

    // Intermediate signals for quadratic constraint compliance
    signal leftPart1[levels];
    signal leftPart2[levels];
    signal rightPart1[levels];
    signal rightPart2[levels];
    signal left[levels];
    signal right[levels];

    hashes[0] <== leaf;

    for (var i = 0; i < levels; i++) {
        hashers[i] = Poseidon(2);

        // Split into quadratic-friendly constraints
        // left = (1 - pathIndices[i]) * hashes[i] + pathIndices[i] * pathElements[i]
        leftPart1[i] <== (1 - pathIndices[i]) * hashes[i];
        leftPart2[i] <== pathIndices[i] * pathElements[i];
        left[i] <== leftPart1[i] + leftPart2[i];

        // right = pathIndices[i] * hashes[i] + (1 - pathIndices[i]) * pathElements[i]
        rightPart1[i] <== pathIndices[i] * hashes[i];
        rightPart2[i] <== (1 - pathIndices[i]) * pathElements[i];
        right[i] <== rightPart1[i] + rightPart2[i];

        hashers[i].inputs[0] <== left[i];
        hashers[i].inputs[1] <== right[i];
        hashes[i + 1] <== hashers[i].out;
    }

    // Check computed root matches expected root
    component rootCheck = IsEqual();
    rootCheck.in[0] <== hashes[levels];
    rootCheck.in[1] <== root;

    valid <== rootCheck.out;
}

template MembershipProof(levels) {
    // Private inputs
    signal input secret;             // User's secret (identity)
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // Public inputs
    signal input merkleRoot;         // Root of membership tree
    signal input nullifierHash;      // Prevents double-use
    signal input externalNullifier;  // Context (e.g., "vote-2026")

    // Output
    signal output valid;

    // Compute leaf (commitment) from secret
    component leafHasher = Poseidon(1);
    leafHasher.inputs[0] <== secret;
    signal leaf;
    leaf <== leafHasher.out;

    // Verify Merkle proof
    component merkleProof = MerkleProof(levels);
    merkleProof.leaf <== leaf;
    merkleProof.root <== merkleRoot;
    for (var i = 0; i < levels; i++) {
        merkleProof.pathElements[i] <== pathElements[i];
        merkleProof.pathIndices[i] <== pathIndices[i];
    }

    // Compute nullifier (prevents using same proof twice)
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== secret;
    nullifierHasher.inputs[1] <== externalNullifier;

    // Verify nullifier matches
    component nullifierCheck = IsEqual();
    nullifierCheck.in[0] <== nullifierHasher.out;
    nullifierCheck.in[1] <== nullifierHash;

    // Valid if merkle proof AND nullifier both pass
    valid <== merkleProof.valid * nullifierCheck.out;
    valid === 1;
}

component main {public [merkleRoot, nullifierHash, externalNullifier]} = MembershipProof(20);
