#!/usr/bin/env node

/**
 * Test script to verify the Prisma serverless fix
 * This script tests the webhook secrets API endpoints to ensure they work without prepared statement conflicts
 */

const http = require('http');
const crypto = require('crypto');

// Test configuration
const BASE_URL = 'http://localhost:3000';
const TEST_ENDPOINTS = [
  '/api/webhook-secrets',
  '/api/webhook-secrets-direct'
];

// Generate test data
function generateTestSecret() {
  return {
    endpoint: 'netbanx',
    name: 'Test Netbanx Webhook',
    description: 'Test webhook secret for validation',
    secretKey: crypto.randomBytes(32).toString('hex'),
    algorithm: 'sha256'
  };
}

// Helper function to make HTTP requests
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(data)
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            data: data
          });
        }
      });
    });
    
    req.on('error', reject);
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

// Test function
async function testPrismaFix() {
  console.log('🧪 Testing Prisma Serverless Fix');
  console.log('================================\n');

  for (const endpoint of TEST_ENDPOINTS) {
    console.log(`Testing endpoint: ${endpoint}`);
    
    try {
      // Test GET request (should list existing secrets)
      console.log('  📤 Testing GET request...');
      const getResponse = await makeRequest(`${BASE_URL}${endpoint}`);
      
      if (getResponse.status === 200) {
        console.log('  ✅ GET request successful');
        console.log(`  📊 Found ${getResponse.data.count || 0} existing secrets`);
      } else {
        console.log(`  ❌ GET request failed: ${getResponse.status}`);
        console.log(`  📝 Response: ${JSON.stringify(getResponse.data, null, 2)}`);
      }

      // Test POST request (create new secret)
      const testData = generateTestSecret();
      console.log('  📤 Testing POST request...');
      
      const postResponse = await makeRequest(`${BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: testData
      });

      if (postResponse.status === 200) {
        console.log('  ✅ POST request successful');
        console.log(`  📝 Secret created/updated: ${postResponse.data.secret?.endpoint}`);
      } else {
        console.log(`  ❌ POST request failed: ${postResponse.status}`);
        console.log(`  📝 Response: ${JSON.stringify(postResponse.data, null, 2)}`);
      }

      // Test DELETE request (if it's the main endpoint)
      if (endpoint === '/api/webhook-secrets') {
        console.log('  📤 Testing DELETE request...');
        
        const deleteResponse = await makeRequest(`${BASE_URL}${endpoint}?endpoint=netbanx`, {
          method: 'DELETE'
        });

        if (deleteResponse.status === 200) {
          console.log('  ✅ DELETE request successful');
        } else {
          console.log(`  ❌ DELETE request failed: ${deleteResponse.status}`);
          console.log(`  📝 Response: ${JSON.stringify(deleteResponse.data, null, 2)}`);
        }
      }

    } catch (error) {
      console.log(`  💥 Error testing ${endpoint}:`, error.message);
    }
    
    console.log(''); // Add spacing between tests
  }

  console.log('🏁 Test completed!');
  console.log('\n💡 If you see "prepared statement already exists" errors,');
  console.log('   the fix needs further adjustment.');
  console.log('\n💡 If all requests succeed, the serverless fix is working!');
}

// Run the test
if (require.main === module) {
  testPrismaFix().catch(console.error);
}

module.exports = { testPrismaFix };