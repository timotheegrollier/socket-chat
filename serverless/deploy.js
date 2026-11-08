#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Platform-specific deployment configurations
const platforms = {
  vercel: {
    command: 'vercel',
    args: ['--prod'],
    envFile: '.env.vercel',
    buildCommand: 'npm install',
    outputDir: '.',
    description: 'Deploy to Vercel'
  },
  netlify: {
    command: 'netlify',
    args: ['functions:deploy'],
    envFile: '.env.netlify',
    buildCommand: 'npm install',
    outputDir: '.',
    description: 'Deploy to Netlify'
  },
  render: {
    command: 'render',
    args: ['create', 'web'],
    envFile: '.env.render',
    buildCommand: 'npm install',
    outputDir: '.',
    description: 'Deploy to Render'
  }
};

// Create environment file template
function createEnvTemplate(platform) {
  const envTemplate = `# GitHub API Proxy Environment Variables
# Required for ${platforms[platform].description}

# GitHub Personal Access Token with repo scope
GITHUB_TOKEN=your_github_token_here

# Repository configuration
GITHUB_REPO_OWNER=timotheegrollier
GITHUB_REPO_NAME=socket-chat
GITHUB_BRANCH=main
GITHUB_IMAGES_PATH=images
`;

  fs.writeFileSync(path.join(__dirname, `.env.${platform}`), envTemplate);
  console.log(`Created .env.${platform} template. Please update with your credentials.`);
}

// Deploy function
function deploy(platform) {
  const config = platforms[platform];
  
  if (!config) {
    console.error(`Unsupported platform: ${platform}`);
    console.log('Available platforms:', Object.keys(platforms).join(', '));
    return;
  }

  // Check if environment file exists
  const envFile = path.join(__dirname, `.env.${platform}`);
  if (!fs.existsSync(envFile)) {
    console.log(`Environment file not found: ${envFile}`);
    createEnvTemplate(platform);
    return;
  }

  console.log(`Deploying to ${config.description}...`);
  
  // Run build command if specified
  if (config.buildCommand) {
    console.log(`Running build command: ${config.buildCommand}`);
    const { execSync } = require('child_process');
    execSync(config.buildCommand, { cwd: __dirname, stdio: 'inherit' });
  }

  // Deploy command
  console.log(`Running deployment command: ${config.command} ${config.args.join(' ')}`);
  const { execSync } = require('child_process');
  execSync(`${config.command} ${config.args.join(' ')}`, { 
    cwd: __dirname, 
    stdio: 'inherit',
    env: {
      ...process.env,
      // Load environment variables from file
      ...(fs.existsSync(envFile) ? require('dotenv').config({ path: envFile }) : {})
    }
  });
  
  console.log(`Deployment to ${config.description} completed successfully!`);
}

// CLI interface
if (require.main === module) {
  const platform = process.argv[2];
  
  if (!platform) {
    console.log('Usage: node deploy.js <platform>');
    console.log('Available platforms:', Object.keys(platforms).join(', '));
    console.log('Example: node deploy.js vercel');
    process.exit(1);
  }
  
  deploy(platform);
}

module.exports = { deploy, platforms };