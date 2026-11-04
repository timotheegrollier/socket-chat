# Socket Chat — Client

React 17 single-page application (Create React App) for
[Socket Chat](https://github.com/timotheegrollier/socket-chat).

## Pages

| Route | Page | Purpose |
| --- | --- | --- |
| `/` | `Home` | Login gate + chat shell (presence sidebar, timeline, search, composer, toasts) |
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

SCSS sources live in `src/styles/` (`_theme.scss`, `_general.scss`, `_tchat.scss`,
`_about.scss`, `_signup.scss`, `_loading_dots.scss`). Dart Sass is used through
the `sass` package. `_theme.scss` is the single source of truth for the design
tokens (colors, radii, typography); Bootstrap 5 is imported before the custom
styles so the project theme always wins.

## Notes

- The socket connects as soon as a valid JWT is found in `localStorage`, sends
  `join` with the pseudo once ready, and listens for `presence` to render the
  online sidebar.
- Message sending is a REST `POST /api/messages/new` followed by a socket
  `newMsg` broadcast, so every client refetches the conversation.
- Own messages can be removed with `DELETE /api/messages/:id`; the client then
  re-broadcasts `newMsg` so other clients refresh.
- See the root README for the full architecture, API and CI/CD documentation.
