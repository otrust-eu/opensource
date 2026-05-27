// OTRUST Proof - Age Verification Circuit
// Proves: "I am at least `minAge` years old" without revealing actual age
//
// Zero-Knowledge: Verifier learns NOTHING except that the statement is true

pragma circom 2.1.0;

include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/poseidon.circom";

// Main circuit: Prove age >= minAge without revealing age
template AgeProof() {
    // Private inputs (only prover knows)
    signal input birthYear;      // Actual birth year (e.g., 1990)
    signal input birthMonth;     // 1-12
    signal input birthDay;       // 1-31
    signal input secret;         // Random secret to prevent brute-force

    // Public inputs (verifier sees these)
    signal input currentYear;    // e.g., 2026
    signal input currentMonth;   // 1-12
    signal input currentDay;     // 1-31
    signal input minAge;         // Required minimum age (e.g., 18)
    signal input identityCommitment; // Hash of identity (public)

    // Output
    signal output valid;         // 1 if proof is valid, 0 otherwise

    // Step 1: Calculate age in years (simplified)
    signal ageYears;
    ageYears <== currentYear - birthYear;

    // Step 2: Adjust for month/day (has birthday passed this year?)
    // If current month > birth month, or same month but current day >= birth day
    component monthCheck = GreaterThan(8);
    monthCheck.in[0] <== currentMonth;
    monthCheck.in[1] <== birthMonth;

    component sameMonth = IsEqual();
    sameMonth.in[0] <== currentMonth;
    sameMonth.in[1] <== birthMonth;

    component dayCheck = GreaterEqThan(8);
    dayCheck.in[0] <== currentDay;
    dayCheck.in[1] <== birthDay;

    // Birthday has passed if: month > birthMonth OR (month == birthMonth AND day >= birthDay)
    signal birthdayPassed;
    birthdayPassed <== monthCheck.out + sameMonth.out * dayCheck.out;

    // Step 3: Actual age (subtract 1 if birthday hasn't passed)
    signal actualAge;
    signal adjustment;
    component notPassed = IsZero();
    notPassed.in <== birthdayPassed;
    adjustment <== notPassed.out; // 1 if birthday not passed, 0 otherwise
    actualAge <== ageYears - adjustment;

    // Step 4: Check age >= minAge
    component ageCheck = GreaterEqThan(8);
    ageCheck.in[0] <== actualAge;
    ageCheck.in[1] <== minAge;

    // Step 5: Verify identity commitment matches
    // commitment = Poseidon(birthYear, birthMonth, birthDay, secret)
    component hasher = Poseidon(4);
    hasher.inputs[0] <== birthYear;
    hasher.inputs[1] <== birthMonth;
    hasher.inputs[2] <== birthDay;
    hasher.inputs[3] <== secret;

    component commitmentCheck = IsEqual();
    commitmentCheck.in[0] <== hasher.out;
    commitmentCheck.in[1] <== identityCommitment;

    // Final validity: age check AND commitment matches
    valid <== ageCheck.out * commitmentCheck.out;

    // Constrain valid to be 1 (proof fails if not valid)
    valid === 1;
}

component main {public [currentYear, currentMonth, currentDay, minAge, identityCommitment]} = AgeProof();
