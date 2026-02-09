// Test the production PETL endpoint to see what it returns
const API_BASE = 'https://nexus-api-979156454944.us-central1.run.app';
const projectId = 'cmjwjdojx000b01s68ew1wjjw';

async function testPetlEndpoint() {
  console.log('=== Testing Production PETL Endpoint ===\n');
  console.log(`API: ${API_BASE}`);
  console.log(`Project: ${projectId}\n`);
  
  // You'll need to get a valid access token from your browser
  const token = process.env.ACCESS_TOKEN;
  
  if (!token) {
    console.error('ERROR: ACCESS_TOKEN environment variable not set');
    console.log('\nTo get your token:');
    console.log('1. Open https://ncc-nexus-contractor-connect.com in your browser');
    console.log('2. Open DevTools (F12) → Application → Local Storage');
    console.log('3. Copy the value of "accessToken"');
    console.log('4. Run: ACCESS_TOKEN="your-token-here" npx ts-node src/test-prod-petl.ts');
    process.exit(1);
  }
  
  try {
    console.log('Fetching PETL data...\n');
    
    const url = `${API_BASE}/projects/${projectId}/petl`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2)}\n`);
    
    if (!response.ok) {
      const text = await response.text();
      console.error('ERROR Response:');
      console.error(text);
      
      // Try to parse as JSON
      try {
        const json = JSON.parse(text);
        console.error('\nParsed Error:');
        console.error(JSON.stringify(json, null, 2));
      } catch {
        // Not JSON, already printed above
      }
      
      process.exit(1);
    }
    
    const data = await response.json();
    
    console.log('SUCCESS! Response:');
    console.log(`  Project ID: ${data.projectId}`);
    console.log(`  Estimate Version ID: ${data.estimateVersionId}`);
    console.log(`  Items Count: ${Array.isArray(data.items) ? data.items.length : 'N/A'}`);
    console.log(`  Reconciliation Entries: ${Array.isArray(data.reconciliationEntries) ? data.reconciliationEntries.length : 'N/A'}`);
    
    if (Array.isArray(data.items)) {
      if (data.items.length === 0) {
        console.log('\n⚠️  WARNING: Items array is EMPTY!');
      } else {
        console.log(`\n✓ Items array has ${data.items.length} items`);
        console.log('\nFirst item sample:');
        console.log(JSON.stringify(data.items[0], null, 2).substring(0, 500));
      }
    }
    
  } catch (error: any) {
    console.error('FETCH ERROR:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testPetlEndpoint();
