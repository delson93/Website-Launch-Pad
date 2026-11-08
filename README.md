# CodeIXE LaunchPad

A no-account website launch ceremony builder. Every publication gets a permanent public /l/:id invitation and a separate private management link. Multiple launches can point at the same destination.

## Run

Use Node.js 24. Run `node server.mjs` and open http://localhost:3000. Run `node --test test.mjs` for integration checks.

For Docker, build with `docker build -t launchpad .` and run:

```sh
docker run -d --name launchpad -p 127.0.0.1:3000:3000 -v launchpad-data:/app/data -e PUBLIC_ORIGIN=https://launch.example.com launchpad
```

Terminate HTTPS at your reverse proxy and forward requests to port 3000. Set PUBLIC_ORIGIN to the external origin before sharing links. PORT defaults to 3000. DATA_DIR defaults to ./data. Use one application instance with a persistent local volume. SQLite initializes its schema at startup. Back up the volume while the service is stopped. Avoid logging private management URLs. Set BLOCKED_HOSTS to a comma-separated list of disallowed destination domains. Set ADMIN_TOKEN to a strong secret to enable moderation at /admin. When proxying, configure rate limiting at the proxy as well. The application groups requests by its direct peer address.

Invitations are unlisted by default. Creators control search indexing separately from launch wall visibility. Launches persist until removed by their owner or an administrator. Management links are bearer credentials and cannot be recovered by email.
