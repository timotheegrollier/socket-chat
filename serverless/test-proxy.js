const https = require('https');
const fs = require('fs');
const path = require('path');

// Test image (a simple 1x1 pixel PNG)
const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

// Test function
async function testProxy() {
  console.log('Testing GitHub API proxy...');
  
  // Test data
  const testData = {
    image: testImageBase64,
    imageName: 'test-image.png'
  };
  
  // Options for the test request
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/github-proxy',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(JSON.stringify(testData))
    }
  };
  
  // Make the request
  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => {
      body += chunk;
    });
    res.on('end', () => {
      console.log(`Status: ${res.statusCode}`);
      console.log('Response:', body);
      
      if (res.statusCode === 200) {
        const response = JSON.parse(body);
        if (response.success && response.imageUrl) {
          console.log('✅ Test passed: Image uploaded successfully');
          console.log('Image URL:', response.imageUrl);
        } else {
          console.log('❌ Test failed: Invalid response format');
        }
      } else {
        console.log('❌ Test failed: Request failed');
      }
    });
  });
  
  req.on('error', (err) => {
    console.error('❌ Test failed: Request error:', err.message);
  });
  
  req.write(JSON.stringify(testData));
  req.end();
}

// Run the test
if (require.main === module) {
  testProxy().catch(console.error);
}

module.exports = { testProxy };