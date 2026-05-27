/**
 * Browser ZK Proof Test
 * 
 * Run this in the browser console on /proof to test the ZK system
 */

async function testBrowserZKProof() {
  console.log('=== Testing Browser ZK-SNARK System ===\n');
  
  // Check if ZKProof is loaded
  if (!window.ZKProof) {
    console.error('❌ ZKProof not loaded!');
    return;
  }
  
  console.log('✅ ZKProof library loaded');
  console.log('   - isLoaded:', window.ZKProof.isLoaded());
  
  // Test age proof
  console.log('\n--- Testing Age Proof ---');
  try {
    const birthDate = '1990-06-15';
    const minAge = 18;
    
    console.log(`Input: birthDate=${birthDate}, minAge=${minAge}`);
    console.log('Generating proof...');
    
    const startTime = Date.now();
    const result = await window.ZKProof.generateAgeProof(birthDate, minAge);
    const duration = Date.now() - startTime;
    
    if (result && result.success) {
      console.log(`✅ Age proof generated in ${duration}ms`);
      console.log('   - Commitment:', result.commitment.slice(0, 20) + '...');
      console.log('   - Statement:', result.statement);
      console.log('   - Version:', result.version);
      console.log('   - Generated locally:', result.generatedLocally);
      
      // Verify locally
      if (result.proof && result.publicSignals) {
        console.log('Verifying locally...');
        const valid = await window.ZKProof.verifyProof('age', result.proof, result.publicSignals);
        console.log('   - Local verification:', valid ? '✅ VALID' : '❌ INVALID');
      }
    } else {
      console.log('⚠️ Age proof returned null (circuit files may not be available)');
      console.log('   Server-side fallback should work');
    }
  } catch (err) {
    console.error('❌ Age proof error:', err.message);
  }
  
  // Test income proof
  console.log('\n--- Testing Income Proof ---');
  try {
    const income = 75000;
    const minIncome = 50000;
    
    console.log(`Input: income=${income}, minIncome=${minIncome}`);
    console.log('Generating proof...');
    
    const startTime = Date.now();
    const result = await window.ZKProof.generateIncomeProof(income, minIncome);
    const duration = Date.now() - startTime;
    
    if (result && result.success) {
      console.log(`✅ Income proof generated in ${duration}ms`);
      console.log('   - Commitment:', result.commitment.slice(0, 20) + '...');
      console.log('   - Statement:', result.statement);
    } else {
      console.log('⚠️ Income proof returned null (circuit files may not be available)');
    }
  } catch (err) {
    console.error('❌ Income proof error:', err.message);
  }
  
  console.log('\n=== Test Complete ===');
}

// Run test
testBrowserZKProof();
