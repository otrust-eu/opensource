// OTRUST Proof - Income Range Verification Circuit
// Proves: "My income is between X and Y" without revealing exact amount
//
// Use case: Prove to landlord you earn enough for rent without showing salary

pragma circom 2.1.0;

include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/poseidon.circom";

template IncomeRangeProof() {
    // Private inputs
    signal input income;         // Actual income (e.g., 45000)
    signal input secret;         // Random secret for commitment

    // Public inputs
    signal input minIncome;      // Minimum required (e.g., 30000)
    signal input maxIncome;      // Maximum to prove (e.g., 100000) - optional upper bound
    signal input commitment;     // Poseidon(income, secret)

    // Output
    signal output valid;

    // Check: income >= minIncome
    component minCheck = GreaterEqThan(32);
    minCheck.in[0] <== income;
    minCheck.in[1] <== minIncome;

    // Check: income <= maxIncome
    component maxCheck = LessEqThan(32);
    maxCheck.in[0] <== income;
    maxCheck.in[1] <== maxIncome;

    // Verify commitment
    component hasher = Poseidon(2);
    hasher.inputs[0] <== income;
    hasher.inputs[1] <== secret;

    component commitmentCheck = IsEqual();
    commitmentCheck.in[0] <== hasher.out;
    commitmentCheck.in[1] <== commitment;

    // All conditions must pass (quadratic constraint friendly)
    signal temp;
    temp <== minCheck.out * maxCheck.out;
    valid <== temp * commitmentCheck.out;
    valid === 1;
}

component main {public [minIncome, maxIncome, commitment]} = IncomeRangeProof();
