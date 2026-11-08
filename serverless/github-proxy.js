const https = require('https');

// GitHub configuration - these should be environment variables in production
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER || 'timotheegrollier';
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME || 'socket-chat';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const GITHUB_IMAGES_PATH = process.env.GITHUB_IMAGES_PATH || 'images';

// Validate required environment variables
if (!GITHUB_TOKEN) {
  throw new Error('GITHUB_TOKEN environment variable is required');
}

// Helper function to make HTTPS requests
function makeRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error(`GitHub API request failed with status ${res.statusCode}: ${body}`));
        }
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    if (data) {
      req.write(data);
    }
    
    req.end();
  });
}

// Get image URL from GitHub
function getImageUrl(imageName) {
  return `https://raw.githubusercontent.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/${GITHUB_BRANCH}/${GITHUB_IMAGES_PATH}/${encodeURIComponent(imageName)}`;
}

// Main handler for serverless function
module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  try {
    if (req.method === 'POST') {
      // Handle image upload
      const { image, imageName } = req.body;
      
      if (!image || !imageName) {
        return res.status(400).json({ error: 'Image and image name are required' });
      }
      
      // Prepare GitHub API request
      const options = {
        hostname: 'api.github.com',
        path: `/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${GITHUB_IMAGES_PATH}/${encodeURIComponent(imageName)}`,
        method: 'POST',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json'
        }
      };
      
      const data = JSON.stringify({
        message: `Upload ${imageName}`,
        content: image,
        branch: GITHUB_BRANCH
      });
      
      // Upload to GitHub
      const result = await makeRequest(options, data);
      
      // Get the public URL
      const imageUrl = getImageUrl(imageName);
      
      // Return the image URL
      return res.status(200).json({ 
        success: true, 
        imageUrl: imageUrl,
        sha: result.sha 
      });
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('GitHub proxy error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
};