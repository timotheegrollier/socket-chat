# Socket Chat — Client

React 17 single-page application (Create React App) for
[Socket Chat](https://github.com/timotheegrollier/socket-chat).

## Pages

| Route | Page | Purpose |
| --- | --- | --- |
| `/` | `Home` | Login gate + chat window (messages, typing, online count, emoji picker) |
| `/about` | `About` | Version 2.0 presentation, architecture, roadmap |
| `/register` | `Signup` | Account creation |

## Configuration

`src/config.json` is ignored by git. Create it from the template:

```bash
cp src/config.example.json src/config.json
```

| Key | Description |
| --- | --- |
| `api_url` | Base URL of the Express/MongoDB API |
| `socket_url` | URL of the Cloudflare Worker socket endpoint |

## Scripts

```bash
npm start        # dev server on :3000
npm test         # interactive Jest / Testing Library
CI=true npm test -- --watchAll=false   # one-shot (used by CI)
npm run build    # production build in build/
```

The `build` script injects the package version into `REACT_APP_VERSION`, which
is displayed on the About page and in the chat header. Bump the version in
`package.json` to update both.

## Styling

SCSS sources live in `src/styles/` (`_general.scss`, `_tchat.scss`,
`_about.scss`, `_signup.scss`, `_loading_dots.scss`). Dart Sass is used through
the `sass` package. The app relies on Bootstrap 5 for utility classes and on
custom SCSS for the chat and About layouts.

## Notes

- The socket connects as soon as a valid JWT is found in `localStorage`, and
  sending is blocked behind a loader until the socket is ready.
- Message sending is a REST `POST /api/messages/new` followed by a socket
  `newMsg` broadcast, so every client refetches the conversation.
- See the root README for the full architecture, API and CI/CD documentation.
