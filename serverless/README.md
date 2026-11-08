# GitHub API Proxy

This serverless function acts as a proxy for GitHub API calls, allowing secure image uploads without exposing GitHub tokens in the client.

## Environment Variables Required

- `GITHUB_TOKEN`: GitHub personal access token with repo scope
- `GITHUB_REPO_OWNER`: Repository owner (default: timotheegrollier)
- `GITHUB_REPO_NAME`: Repository name (default: socket-chat)
- `GITHUB_BRANCH`: Branch to store images in (default: main)
- `GITHUB_IMAGES_PATH`: Path within repository to store images (default: images)

## Deployment

### Vercel

1. Create a new project in Vercel
2. Connect your GitHub repository
3. Set the environment variables in the Vercel dashboard
4. Deploy the function

### Netlify

1. Create a new function in Netlify
2. Set the environment variables in the Netlify dashboard
3. Deploy the function

### Render

1. Create a new Web Service in Render
2. Set the environment variables in the Render dashboard
3. Deploy the service

## API

### POST /github-proxy

Upload an image to GitHub.

**Request Body:**
```json
{
  "image": "base64-encoded-image-data",
  "imageName": "filename.jpg"
}
```

**Response:**
```json
{
  "success": true,
  "imageUrl": "https://raw.githubusercontent.com/owner/repo/branch/path/filename.jpg",
  "sha": "git-sha-of-the-file"
}
```

## Security

- The GitHub token is stored securely as an environment variable
- No sensitive information is exposed to the client
- All API requests are proxied through the serverless function