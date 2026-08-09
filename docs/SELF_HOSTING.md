# Self-hosting

Lexo is one Node process serving a static bundle and a WebSocket. There is no
database, no queue and no external service.

## Run it

```bash
git clone https://github.com/wilsonhj/lexo.git
cd lexo
npm ci
npm run build
npm start
```

That serves everything on `http://0.0.0.0:8080`. Node 20 or newer.

## Configuration

All optional, all environment variables.

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `8080` | Listen port. `LEXO_PORT` also works. |
| `LEXO_HOST` | `0.0.0.0` | Bind address. |
| `LEXO_CLIENT_DIR` | `packages/client/dist` | Where the built client lives. |
| `LEXO_INTERMISSION_MS` | `2500` | Pause between a round ending and the next card. |
| `LEXO_CHALLENGE_MS` | `5000` | How long a contested-word vote stays open. |
| `LEXO_ANSWER_COOLDOWN_MS` | `600` | Minimum gap between one player's answers. |
| `LEXO_MAX_ATTEMPTS` | `6` | Answers a player may burn on a single round. |
| `LEXO_RECONNECT_GRACE_MS` | `120000` | How long a disconnected player keeps their seat. |
| `LEXO_EMPTY_ROOM_TTL_MS` | `300000` | How long an empty room lingers before collection. |
| `LEXO_MAX_ROOMS` | `500` | Cap on concurrent rooms. |
| `LEXO_SUGGESTIONS_FILE` | unset | JSONL file collecting words players voted through. |

## Behind a reverse proxy

The WebSocket lives at `/ws` and needs the upgrade headers forwarded. nginx:

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade    $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host       $host;
    proxy_read_timeout 3600s;   # rounds are short, but lobbies are not
}
```

Caddy needs nothing beyond `reverse_proxy 127.0.0.1:8080`.

**Put TLS in front of it.** The client picks `wss://` automatically when the
page is served over HTTPS.

## Docker

There is no image in the repository, because the Dockerfile would be this and
you may as well see it:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/core/package.json   packages/core/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
EXPOSE 8080
CMD ["node", "packages/server/dist/index.js"]
```

## Health and monitoring

- `GET /healthz` → `ok`. Suitable as a liveness and readiness probe.
- `GET /api/info` → languages, categories, modes, word counts and the current
  room count, as JSON.

There are no metrics endpoints. If you need them, `RoomManager.size` and the
`wss.clients` set are the two numbers worth exporting.

## Scaling

Rooms live in the memory of one process, so **Lexo does not scale horizontally
as written.** Two instances behind a load balancer will happily give two
players the same room code and never introduce them.

If you need more than one process, the options in increasing order of effort
are: sticky sessions keyed on room code at the proxy; a shared room registry
with a router; or moving room state to Redis. For the number of concurrent
games a single Node process handles — thousands of rooms, given each is a few
kilobytes and mostly idle — none of that is likely to be necessary.

## Exposure

The mitigations in [`ARCHITECTURE.md`](ARCHITECTURE.md#anti-abuse) cover
accidental misuse and casual mischief: payload caps, answer cooldowns, room
caps, dead-socket collection. They are **not** a substitute for a proxy with
rate limiting if you are putting this on the open internet under your own name.

There are no accounts and no personal data. Names are whatever players type,
held in memory, and gone when the room is collected.
