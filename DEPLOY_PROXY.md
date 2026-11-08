# Deployment Guide for GitHub API Proxy

This guide explains how to deploy the GitHub API proxy to Vercel or Netlify for secure image uploads.

## Prerequisites

1. A GitHub Personal Access Token with repo scope
2. An account on Vercel or Netlify

## Deployment to Vercel

### Option 1: Using the deployment script (recommended)
```bash
./deploy-to-vercel.sh
```

This script will guide you through the deployment process and provide the next steps.

### Option 2: Manual deployment
#### 1. Install Vercel CLI
```bash
npm i -g vercel
```

#### 2. Login to Vercel
```bash
vercel login
```

#### 3. Deploy the Proxy
```bash
vercel --prod
```

#### 4. Set Environment Variables
In the Vercel dashboard:
1. Go to your project
2. Go to Settings > Environment Variables
3. Add the following variables:
   - `GITHUB_TOKEN`: Your GitHub personal access token
   - `GITHUB_REPO_OWNER`: timotheegrollier
   - `GITHUB_REPO_NAME`: socket-chat
   - `GITHUB_BRANCH`: main
   - `GITHUB_IMAGES_PATH`: images

## Deployment to Netlify

### Option 1: Using the deployment script (recommended)
```bash
./deploy-to-netlify.sh
```

This script will guide you through the deployment process and provide the next steps.

### Option 2: Manual deployment
#### 1. Install Netlify CLI
```bash
npm i -g netlify-cli
```

#### 2. Login to Netlify
```bash
netlify login
```

#### 3. Deploy the Proxy
```bash
netlify deploy --prod
```

#### 4. Set Environment Variables
In the Netlify dashboard:
1. Go to your site
2. Go to Site settings > Build & deploy > Environment
3. Add the following variables:
   - `GITHUB_TOKEN`: Your GitHub personal access token
   - `GITHUB_REPO_OWNER`: timotheegrollier
   - `GITHUB_REPO_NAME`: socket-chat
   - `GITHUB_BRANCH`: main
   - `GITHUB_IMAGES_PATH`: images

## Update Client Configuration

Once the proxy is deployed, update the client configuration:

```json
{
  "github_proxy_url": "https://your-proxy-domain.com/github-proxy"
}
```

## Testing

After deployment, test the proxy by:
1. Uploading an image through the chat interface
2. Check that the image appears in the GitHub repository
3. Verify the image URL returned by the proxy

## Security Notes

- The GitHub token is stored securely as an environment variable
- No sensitive information is exposed to the client
- All GitHub API requests are proxied through the serverless function
- The token is never exposed in client code or browser console