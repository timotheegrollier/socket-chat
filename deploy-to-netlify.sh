#!/bin/bash

# Script to deploy GitHub API proxy to Netlify
# This script helps deploy the proxy function to Netlify

echo "🚀 Deploying GitHub API proxy to Netlify..."

# Check if Netlify CLI is installed
if ! command -v netlify &> /dev/null; then
    echo "❌ Netlify CLI is not installed. Please install it first:"
    echo "   npm i -g netlify-cli"
    exit 1
fi

# Check if user is logged in
if ! netlify sites:list &> /dev/null; then
    echo "❌ You are not logged in to Netlify. Please login first:"
    echo "   netlify login"
    exit 1
fi

# Deploy to Netlify
echo "📦 Deploying to Netlify..."
netlify deploy --prod

# Get the deployment URL
DEPLOYMENT_URL=$(netlify sites:list | grep -o 'https://[a-zA-Z0-9-]*\.netlify\.app' | head -1)

if [ -z "$DEPLOYMENT_URL" ]; then
    echo "❌ Failed to get deployment URL"
    exit 1
fi

echo "✅ Deployment successful!"
echo "📍 Deployment URL: $DEPLOYMENT_URL"
echo ""
echo "🔧 Next steps:"
echo "1. Go to your Netlify dashboard"
echo "2. Navigate to your site > Site settings > Build & deploy > Environment"
echo "3. Add the following environment variables:"
echo "   - GITHUB_TOKEN=your_github_token_here"
echo "   - GITHUB_REPO_OWNER=timotheegrollier"
echo "   - GITHUB_REPO_NAME=socket-chat"
echo "   - GITHUB_BRANCH=main"
echo "   - GITHUB_IMAGES_PATH=images"
echo ""
echo "4. Update the client configuration with:"
echo "   {"
echo "     \"github_proxy_url\": \"$DEPLOYMENT_URL/.netlify/functions/github-proxy\""
echo "   }"
echo ""
echo "5. Commit and push the client configuration changes"