const https = require('https');
const http = require('http');

const PROD_URL = 'https://netbanx-dashboard.vercel.app';
const LOCAL_URL = 'http://localhost:3000';

// Test configuration
const tests = [
  {
    name: 'Test Account Status Webhook GET',
    method: 'GET',
    path: '/api/webhooks/account-status',
    expectedStatus: 200,
    expectedContent: ['status', 'endpoint', 'supportedEventTypes']
  },
  {
    name: 'Test Account Status Webhook POST',
    method: 'POST',
    path: '/api/webhooks/account-status',
    headers: {
      'Content-Type': 'application/json',
      'x-test-webhook': 'true'
    },
    body: JSON.stringify({
      id: 'test-' + Date.now(),
      resourceId: 'ACC-TEST-123',
      mode: 'test',
      eventType: 'ACCT_APPROVED',
      payload: {
        acctStatus: 'Approved',
        accountNumber: 'ACC-TEST-123',
        creditCardId: 'CC-123',
        directDebitId: 'DD-456'
      }
    }),
    expectedStatus: 200,
    expectedContent: ['success', 'webhookId']
  },
  {
    name: 'Test Webhook Secrets GET',
    method: 'GET',
    path: '/api/webhook-secrets',
    expectedStatus: 200,
    expectedContent: ['success', 'secrets']
  },
  {
    name: 'Test Webhook Secrets POST',
    method: 'POST',
    path: '/api/webhook-secrets',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      endpoint: 'account-status',
      name: 'Account Status Test Secret',
      description: 'Test HMAC secret for account status webhook',
      secretKey: 'test-secret-key-' + Date.now() + '-abcdefghijklmnopqrstuvwxyz0123456789',
      algorithm: 'sha256'
    }),
    expectedStatus: 200,
    expectedContent: ['success', 'message']
  }
];

// Helper function to make HTTP/HTTPS requests
function makeRequest(baseUrl, test) {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl + test.path);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: test.method,
      headers: test.headers || {}
    };
    
    if (test.body) {
      options.headers['Content-Length'] = Buffer.byteLength(test.body);
    }
    
    const req = client.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    
    req.on('error', reject);
    
    if (test.body) {
      req.write(test.body);
    }
    
    req.end();
  });
}

// Run tests
async function runTests(baseUrl, environment) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing ${environment} environment: ${baseUrl}`);
  console.log('='.repeat(60));
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      console.log(`\n▶ ${test.name}`);
      console.log(`  ${test.method} ${test.path}`);
      
      const response = await makeRequest(baseUrl, test);
      
      // Check status code
      if (response.status !== test.expectedStatus) {
        console.log(`  ❌ Expected status ${test.expectedStatus}, got ${response.status}`);
        console.log(`     Response: ${response.body}`);
        failed++;
        continue;
      }
      
      // Try to parse JSON response
      let jsonBody;
      try {
        jsonBody = JSON.parse(response.body);
      } catch (e) {
        console.log(`  ❌ Failed to parse JSON response`);
        console.log(`     Response: ${response.body}`);
        failed++;
        continue;
      }
      
      // Check expected content
      const missingFields = test.expectedContent.filter(field => !jsonBody.hasOwnProperty(field));
      if (missingFields.length > 0) {
        console.log(`  ❌ Missing expected fields: ${missingFields.join(', ')}`);
        console.log(`     Response:`, JSON.stringify(jsonBody, null, 2));
        failed++;
        continue;
      }
      
      console.log(`  ✅ Test passed (status: ${response.status})`);
      if (jsonBody.success !== undefined) {
        console.log(`     Success: ${jsonBody.success}`);
      }
      if (jsonBody.message) {
        console.log(`     Message: ${jsonBody.message}`);
      }
      passed++;
      
    } catch (error) {
      console.log(`  ❌ Test failed with error: ${error.message}`);
      failed++;
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${environment} Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));
  
  return { passed, failed };
}

// Main execution
async function main() {
  console.log('🔍 Testing Webhook Endpoints and Database Operations');
  console.log(''.repeat(60));
  
  // Test local environment first
  try {
    const localResults = await runTests(LOCAL_URL, 'LOCAL');
  } catch (error) {
    console.log('\n⚠️  Could not test local environment:', error.message);
    console.log('Make sure the development server is running: npm run dev');
  }
  
  // Test production environment
  try {
    const prodResults = await runTests(PROD_URL, 'PRODUCTION');
  } catch (error) {
    console.log('\n❌ Could not test production environment:', error.message);
  }
  
  console.log('\n✨ Testing complete!');
}

// Run the tests
main().catch(console.error);