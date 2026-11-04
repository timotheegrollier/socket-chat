# Security policy

Socket Chat is a training project, but reports are welcome.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Instead:

1. Use GitHub Private Vulnerability Reporting on the repository
   (**Security → Report a vulnerability**), or
2. Contact the maintainer directly.

Include a short description, reproduction steps, and the potential impact.
You should receive an answer within a few days.

## Known development placeholders

This repository is a learning project and still contains intentional
shortcuts that must be changed before any real production use:

- `RANDOM_TOKEN_SECRET` is a placeholder JWT signing secret.
- Development TLS certificates are committed at the repository root.
- The REST API accepts the message author from the request body (no
  server-side author resolution yet).

Do not reuse this project as-is for sensitive data.
