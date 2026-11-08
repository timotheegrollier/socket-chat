#!/bin/bash

# Script to configure GitHub token for image uploads
# This script updates the client configuration with a GitHub token

CONFIG_FILE="client/src/config.json"

if [ -z "$1" ]; then
    echo "Usage: $0 <github-token>"
    echo "Example: $0 ghp_your_token_here"
    exit 1
fi

GITHUB_TOKEN=$1

# Create a temporary JSON file with the updated configuration
cat > /tmp/config.json << EOF
{
    "api_url":"https://socket-tchat.onrender.com",
    "socket_url":"https://socket-chat.sitizstorm.workers.dev",
    "github_token": "$GITHUB_TOKEN",
    "github_repo_owner": "timotheegrollier",
    "github_repo_name": "socket-chat",
    "github_branch": "main",
    "github_images_path": "images"
}
EOF

# Replace the configuration file
mv /tmp/config.json "$CONFIG_FILE"

echo "GitHub token has been updated in $CONFIG_FILE"
echo "Please run 'git add client/src/config.json && git commit -m \"config: update GitHub token for image uploads\"' to commit the change"
echo ""
echo "IMPORTANT: For production, consider using the serverless proxy approach to avoid exposing tokens in client code."