#!/bin/bash

# Script to deploy GitHub API proxy to Vercel
# This script helps deploy the proxy function to Vercel

echo "🚀 Deploying GitHub API proxy to Vercel..."

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI is not installed. Please install it first:"
    echo "   npm i -g vercel"
    exit 1
fi

# Check if user is logged in
if ! vercel whoami &> /dev/null; then
    echo "❌ You are not logged in to Vercel. Please login first:"
    echo "   vercel login"
    exit 1
fi

# Deploy to Vercel
echo "📦 Deploying to Vercel..."
vercel --prod

# Get the deployment URL
DEPLOYMENT_URL=$(vercel ls | grep -o 'https://[a-zA-Z0-9-]*\.vercel\.app' | head -1)

if [ -z "$DEPLOYMENT_URL" ]; then
    echo "❌ Failed to get deployment URL"
    exit 1
fi

echo "✅ Deployment successful!"
echo "📍 Deployment URL: $DEPLOYMENT_URL"
echo ""
echo "🔧 Next steps:"
echo "1. Go to your Vercel dashboard"
echo "2. Navigate to your project > Settings > Environment Variables"
echo "3. Add the following environment variables:"
echo "   - GITHUB_TOKEN=your_github_token_here"
echo "   - GITHUB_REPO_OWNER=timotheegrollier"
echo "   - GITHUB_REPO_NAME=socket-chat"
echo "   - GITHUB_BRANCH=main"
echo "   - GITHUB_IMAGES_PATH=images"
echo ""
echo "4. Update the client configuration with:"
echo "   {"
echo "     \"github_proxy_url\": \"$DEPLOYMENT_URL/github-proxy\""
echo "   }"
echo ""
echo "5. Commit and push the client configuration changes"