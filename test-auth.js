#!/usr/bin/env node

// Simple test script to verify authentication flow
// Run with: node test-auth.js

const testAuth = async () => {
  const baseUrl = 'http://localhost:3000';
  
  console.log('🔍 Testing Authentication Flow...\n');
  
  // Test credentials - adjust these to match your test user
  const credentials = {
    email: 'test@example.com',
    password: 'TestPassword123'
  };
  
  try {
    // Step 1: Test login
    console.log('1️⃣ Testing login endpoint...');
    const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    });
    
    const loginData = await loginResponse.json();
    
    if (!loginResponse.ok) {
      console.error('❌ Login failed:', loginData.error);
      return;
    }
    
    console.log('✅ Login successful!');
    console.log('   User:', loginData.data.user.email);
    console.log('   Role:', loginData.data.user.role);
    console.log('   Token received:', !!loginData.data.sessionToken);
    
    const sessionToken = loginData.data.sessionToken;
    
    // Wait 2 seconds to simulate the issue
    console.log('\n⏳ Waiting 2 seconds...\n');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 2: Test session verification
    console.log('2️⃣ Testing session verification (/api/auth/me)...');
    const meResponse = await fetch(`${baseUrl}/api/auth/me`, {
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
      },
    });
    
    const meData = await meResponse.json();
    
    if (!meResponse.ok) {
      console.error('❌ Session verification failed:', meData.error);
      console.error('   This indicates the instant logout issue!');
      return;
    }
    
    console.log('✅ Session still valid after 2 seconds!');
    console.log('   User data retrieved successfully');
    
    // Step 3: Test session refresh
    console.log('\n3️⃣ Testing session refresh...');
    const refreshResponse = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
      },
    });
    
    const refreshData = await refreshResponse.json();
    
    if (!refreshResponse.ok) {
      console.error('❌ Session refresh failed:', refreshData.error);
      return;
    }
    
    console.log('✅ Session refresh successful!');
    console.log('   New token received:', !!refreshData.sessionToken);
    
    // Step 4: Verify new session
    const newToken = refreshData.sessionToken;
    console.log('\n4️⃣ Verifying new session token...');
    
    const verifyResponse = await fetch(`${baseUrl}/api/auth/me`, {
      headers: {
        'Authorization': `Bearer ${newToken}`,
      },
    });
    
    const verifyData = await verifyResponse.json();
    
    if (!verifyResponse.ok) {
      console.error('❌ New session verification failed:', verifyData.error);
      return;
    }
    
    console.log('✅ New session token is valid!');
    
    // Step 5: Test logout
    console.log('\n5️⃣ Testing logout...');
    const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${newToken}`,
      },
    });
    
    if (!logoutResponse.ok) {
      console.error('❌ Logout failed');
      return;
    }
    
    console.log('✅ Logout successful!');
    
    // Verify session is invalid after logout
    console.log('\n6️⃣ Verifying session is invalid after logout...');
    const invalidResponse = await fetch(`${baseUrl}/api/auth/me`, {
      headers: {
        'Authorization': `Bearer ${newToken}`,
      },
    });
    
    if (invalidResponse.ok) {
      console.error('❌ Session still valid after logout - this is a security issue!');
      return;
    }
    
    console.log('✅ Session properly invalidated after logout');
    
    console.log('\n🎉 All authentication tests passed successfully!');
    console.log('   The authentication flow is working correctly.');
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    console.error('   Make sure the server is running on http://localhost:3000');
  }
};

// Run the test
testAuth();