/**
 * OTRUST Browser-side ZK-SNARK Proof Generation
 * 
 * This module generates zero-knowledge proofs entirely in the browser.
 * The user's private data NEVER leaves their device.
 * 
 * Uses:
 * - snarkjs for Groth16 proof generation
 * - Poseidon hash for commitments
 * - WASM circuits compiled from Circom
 */

const SNARKJS_PATH = '/js/snarkjs.min.js';

// Circuit paths (relative to web root)
const CIRCUITS = {
  age: {
    wasm: '/circuits/ageProof.wasm',
    zkey: '/circuits/ageProof_final.zkey',
    vkey: '/circuits/ageProof_vkey.json'
  },
  income: {
    wasm: '/circuits/incomeProof.wasm',
    zkey: '/circuits/incomeProof_final.zkey',
    vkey: '/circuits/incomeProof_vkey.json'
  }
};

// Global state
let snarkjsLoaded = false;
let poseidonLoaded = false;
let poseidonFunctions = null;
let circuitsLoaded = {
  age: { vkey: null },
  income: { vkey: null }
};

/**
 * Load snarkjs library dynamically
 */
async function loadSnarkJS() {
  if (snarkjsLoaded && window.snarkjs) return window.snarkjs;
  
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (window.snarkjs) {
      snarkjsLoaded = true;
      resolve(window.snarkjs);
      return;
    }
    
    const script = document.createElement('script');
    script.src = SNARKJS_PATH;
    script.onload = () => {
      snarkjsLoaded = true;
      console.log('✅ snarkjs loaded');
      resolve(window.snarkjs);
    };
    script.onerror = () => reject(new Error('Failed to load snarkjs'));
    document.head.appendChild(script);
  });
}

/**
 * Load Poseidon hash function
 */
async function loadPoseidon() {
  if (poseidonLoaded && poseidonFunctions) return poseidonFunctions;
  if (!window.PoseidonLite?.poseidon2 || !window.PoseidonLite?.poseidon4) {
    throw new Error('Failed to load the local Poseidon implementation');
  }
  poseidonFunctions = window.PoseidonLite;
  poseidonLoaded = true;
  return poseidonFunctions;
}

/**
 * Calculate Poseidon hash (matches Circom's Poseidon exactly)
 */
async function poseidonHash(...inputs) {
  const poseidon = await loadPoseidon();
  const values = inputs.map(x => BigInt(x));
  if (values.length === 2) return poseidon.poseidon2(values).toString();
  if (values.length === 4) return poseidon.poseidon4(values).toString();
  throw new Error(`Unsupported Poseidon input count: ${values.length}`);
}

/**
 * Load verification key for a circuit type
 */
async function loadVKey(circuitType) {
  if (circuitsLoaded[circuitType]?.vkey) {
    return circuitsLoaded[circuitType].vkey;
  }
  
  const circuit = CIRCUITS[circuitType];
  if (!circuit) throw new Error(`Unknown circuit type: ${circuitType}`);
  
  const response = await fetch(circuit.vkey);
  if (!response.ok) throw new Error(`Failed to load verification key for ${circuitType}`);
  
  const vkey = await response.json();
  circuitsLoaded[circuitType].vkey = vkey;
  return vkey;
}

/**
 * Simple Poseidon-like hash for browser (simplified version)
 * In production, you'd use a proper Poseidon implementation
 */
function browserHash(...inputs) {
  // Convert all inputs to a string and hash
  const str = inputs.map(x => x.toString()).join('|');
  
  // Simple hash using crypto.subtle
  let hash = 0n;
  for (let i = 0; i < str.length; i++) {
    const char = BigInt(str.charCodeAt(i));
    hash = ((hash << 5n) - hash + char) & ((1n << 253n) - 1n);
  }
  return hash;
}

/**
 * Generate a cryptographic random number
 */
function generateSecret() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  let result = 0n;
  for (let i = 0; i < 32; i++) {
    result = (result << 8n) | BigInt(array[i]);
  }
  // Keep within field (BN128 scalar field)
  return result % 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
}

/**
 * Generate Age Proof in browser
 * 
 * @param {string} birthDate - ISO date string (YYYY-MM-DD)
 * @param {number} minAge - Minimum age to prove
 * @returns {Object} - Proof data including commitment and proof
 */
async function generateAgeProofBrowser(birthDate, minAge) {
  const snarkjs = await loadSnarkJS();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(birthDate))) {
    throw new Error('Birth date must use YYYY-MM-DD');
  }
  if (!Number.isInteger(minAge) || minAge < 0 || minAge > 150) {
    throw new Error('Minimum age must be an integer between 0 and 150');
  }

  const birth = new Date(`${birthDate}T00:00:00Z`);
  const birthYear = birth.getUTCFullYear();
  const birthMonth = birth.getUTCMonth() + 1;
  const birthDay = birth.getUTCDate();
  if (
    Number.isNaN(birth.getTime()) ||
    birthYear !== Number(birthDate.slice(0, 4)) ||
    birthMonth !== Number(birthDate.slice(5, 7)) ||
    birthDay !== Number(birthDate.slice(8, 10))
  ) {
    throw new Error('Birth date is invalid');
  }
  
  // Calculate current age
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  const currentDay = now.getUTCDate();
  
  let currentAge = currentYear - birthYear;
  if (currentMonth < birthMonth || (currentMonth === birthMonth && currentDay < birthDay)) {
    currentAge--;
  }
  
  // Validate
  if (currentAge < minAge) {
    throw new Error(`Age ${currentAge} is less than required ${minAge}`);
  }
  
  // Generate cryptographic secret
  const secret = generateSecret();
  
  // Generate identity commitment using Poseidon hash (matches circuit)
  // commitment = Poseidon(birthYear, birthMonth, birthDay, secret)
  const identityCommitment = await poseidonHash(birthYear, birthMonth, birthDay, secret);
  console.log(' Identity commitment:', identityCommitment);
  
  // Create input for circuit
  const input = {
    birthYear: birthYear,
    birthMonth: birthMonth,
    birthDay: birthDay,
    currentYear: currentYear,
    currentMonth: currentMonth,
    currentDay: currentDay,
    minAge: minAge,
    secret: secret.toString(),
    identityCommitment: identityCommitment.toString()
  };
  
  console.log(' Generating ZK-SNARK proof in browser...');
  console.log('📊 Circuit inputs prepared (birth data stays local)');
  
  try {
    // Generate proof using WASM and zkey
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      CIRCUITS.age.wasm,
      CIRCUITS.age.zkey
    );
    
    console.log('✅ Proof generated!');
    
    // Load verification key and verify locally
    const vkey = await loadVKey('age');
    const isValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
    
    if (!isValid) {
      throw new Error('Local verification failed - proof is invalid');
    }
    
    console.log('✅ Local verification passed');
    
    // Public signals: [valid, currentYear, currentMonth, currentDay, minAge, commitment]
    const commitment = publicSignals[5];
    
    return {
      success: true,
      proofType: 'age',
      version: 'groth16-v3',
      proof: proof,
      publicSignals: publicSignals,
      commitment: commitment,
      statement: `Self-attested age ≥ ${minAge}`,
      selfAttested: true,
      minAge: minAge,
      generatedAt: new Date().toISOString(),
      generatedLocally: true
    };
  } catch (err) {
    console.error('Proof generation error:', err);
    
    if (err.message.includes('fetch') || err.message.includes('Failed') || err.message.includes('404')) {
      console.log('⚠️ Local proof generation is unavailable');
      return null;
    }
    
    throw err;
  }
}

/**
 * Generate Income Proof in browser
 * 
 * @param {number} income - Actual income
 * @param {number} minIncome - Minimum income to prove
 * @param {number} maxIncome - Maximum income in range (default 10M)
 * @returns {Object} - Proof data
 */
async function generateIncomeProofBrowser(income, minIncome, maxIncome = 10000000) {
  const snarkjs = await loadSnarkJS();

  if (
    !Number.isSafeInteger(income) ||
    !Number.isSafeInteger(minIncome) ||
    !Number.isSafeInteger(maxIncome) ||
    income < 0 ||
    minIncome < 0 ||
    maxIncome < minIncome ||
    maxIncome > 4294967295
  ) {
    throw new Error('Income values must be whole numbers in a valid 32-bit range');
  }

  if (income < minIncome) {
    throw new Error(`Income ${income} is less than required ${minIncome}`);
  }
  
  if (income > maxIncome) {
    throw new Error(`Income ${income} exceeds maximum ${maxIncome}`);
  }
  
  // Generate cryptographic secret
  const secret = generateSecret();
  const commitment = await poseidonHash(income, secret);
  
  // Create input for circuit
  const input = {
    income: income,
    minIncome: minIncome,
    maxIncome: maxIncome,
    secret: secret.toString(),
    commitment: commitment
  };
  
  console.log(' Generating income proof in browser...');
  
  try {
    // Generate proof
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      CIRCUITS.income.wasm,
      CIRCUITS.income.zkey
    );
    
    console.log('✅ Income proof generated!');
    
    // Verify locally
    const vkey = await loadVKey('income');
    const isValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
    
    if (!isValid) {
      throw new Error('Local verification failed');
    }
    
    // Public signals: [valid, minIncome, maxIncome, commitment]
    const publicCommitment = publicSignals[3];
    
    return {
      success: true,
      proofType: 'income',
      version: 'groth16-v3',
      proof: proof,
      publicSignals: publicSignals,
      commitment: publicCommitment,
      statement: `Self-attested committed value between $${minIncome.toLocaleString()} and $${maxIncome.toLocaleString()}`,
      selfAttested: true,
      minIncome: minIncome,
      maxIncome: maxIncome,
      generatedAt: new Date().toISOString(),
      generatedLocally: true
    };
  } catch (err) {
    console.error('Income proof error:', err);
    
    if (err.message.includes('fetch') || err.message.includes('Failed')) {
      console.log('⚠️ Local proof generation is unavailable');
      return null;
    }
    
    throw err;
  }
}

/**
 * Verify a proof locally in browser
 * 
 * @param {string} proofType - 'age' or 'income'
 * @param {Object} proof - The Groth16 proof
 * @param {Array} publicSignals - Public signals from proof
 * @returns {boolean} - Whether proof is valid
 */
async function verifyProofBrowser(proofType, proof, publicSignals) {
  const snarkjs = await loadSnarkJS();
  const vkey = await loadVKey(proofType);
  
  return await snarkjs.groth16.verify(vkey, publicSignals, proof);
}

/**
 * Submit a locally-generated proof to server for storage
 * 
 * @param {Object} proofData - Generated proof data
 * @returns {Object} - Server response with proof ID and share URL
 */
async function submitProofToServer(proofData) {
  if (!proofData || typeof proofData !== 'object') {
    throw new Error('Proof data is required');
  }

  const publicProof = {
    proofType: proofData.proofType,
    version: proofData.version,
    proof: proofData.proof,
    publicSignals: proofData.publicSignals,
    commitment: proofData.commitment
  };

  const response = await fetch('/api/proof/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(publicProof)
  });
  
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error || 'Failed to submit proof');
  }
  
  return data;
}

/**
 * Export proof for offline verification
 * Creates a standalone JSON file that can be verified anywhere
 */
function exportProofForVerification(proofData) {
  const exportData = {
    otrust: {
      version: '1.0',
      type: 'zk-proof',
      generated: proofData.generatedAt
    },
    proofType: proofData.proofType,
    statement: proofData.statement,
    proof: proofData.proof,
    publicSignals: proofData.publicSignals,
    verificationKey: CIRCUITS[proofData.proofType].vkey,
    instructions: {
      verify: 'Use snarkjs.groth16.verify(verificationKey, publicSignals, proof)',
      website: 'https://www.otrust.eu/proof'
    }
  };
  
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `otrust-proof-${proofData.proofType}-${Date.now()}.json`;
  a.click();
  
  URL.revokeObjectURL(url);
  
  return exportData;
}

/**
 * Initialize ZK proof system
 * Pre-loads snarkjs for faster first proof
 */
async function initZKProofSystem() {
  try {
    await loadSnarkJS();
    console.log(' ZK-SNARK system initialized');
    
    // Pre-load verification keys
    await Promise.all([
      loadVKey('age').catch(() => {}),
      loadVKey('income').catch(() => {})
    ]);
    
    console.log('✅ Verification keys pre-loaded');
    return true;
  } catch (err) {
    console.warn('ZK system init warning:', err.message);
    return false;
  }
}

// Export for global use
window.ZKProof = {
  init: initZKProofSystem,
  generateAgeProof: generateAgeProofBrowser,
  generateIncomeProof: generateIncomeProofBrowser,
  verifyProof: verifyProofBrowser,
  submitToServer: submitProofToServer,
  exportProof: exportProofForVerification,
  isLoaded: () => snarkjsLoaded
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initZKProofSystem();
  });
} else {
  initZKProofSystem();
}
