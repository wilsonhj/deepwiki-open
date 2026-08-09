# Protocol

JSON over a single WebSocket at `/ws`. Every message has a `t` field naming its
type. Types are defined in `packages/core/src/protocol.ts` and shared by both
sides, so this document and the code cannot drift apart silently.

**All timestamps are server epoch milliseconds.** The client corrects for its
own clock using `serverNow` from `welcome`. The server never reads a time sent
by a client.

## Handshake

```
client ──▶  { "t": "hello", "name": "Ana" }
server ──▶  { "t": "welcome", "you": { "id": "p_…", "token": "t_…" },
              "room": { "code": "GLLJ", … }, "serverNow": 1786… }
server ──▶  { "t": "room", "room": { … } }        (broadcast to everyone)
```

- `hello` **without** `roomCode` creates a room.
- `hello` **with** `roomCode` joins that room.
- `hello` with `roomCode` **and** `token` rejoins an existing seat, keeping the
  player's score and dropping them straight into the live round.

One `hello` per connection; later ones are ignored. Any other message before
`hello` gets an error.

## Client → server

| Message | Who | Effect |
|---|---|---|
| `{ t: 'hello', name, roomCode?, token? }` | anyone | Create, join or rejoin. |
| `{ t: 'settings', settings }` | host, in lobby | Replace game settings. Server clamps them. |
| `{ t: 'ready', ready }` | anyone | Toggle the ready flag (cosmetic; the host decides when to start). |
| `{ t: 'start' }` | host | Build the reserve and deal the first card. |
| `{ t: 'answer', word }` | anyone, in a round | Submit an answer. |
| `{ t: 'vote', accept }` | anyone but the submitter, during a challenge | Vote on a contested word. |
| `{ t: 'rematch' }` | host, when finished | Return the room to the lobby. |
| `{ t: 'ping', at }` | anyone | Answered with `pong`, echoing `at`. |

## Server → client

### `welcome`
Sent only to the joining connection. Carries the player's id and the token to
save for reconnecting.

### `room`
Full room snapshot, broadcast on every change: players, scores, connection
flags, settings, phase, round counters. Phase is one of `lobby`, `round`,
`challenge`, `intermission`, `finished`, and it is what the client uses to
choose a screen.

### `round`
```json
{
  "t": "round",
  "round": {
    "index": 0, "total": 29,
    "card": {
      "id": "animal-e-0",
      "category": "animal",
      "categoryColor": "magenta",
      "letters": [
        { "initial": { "id": "b", "display": "B" }, "color": "azure" },
        { "initial": { "id": "s", "display": "S" }, "color": "magenta" },
        { "initial": { "id": "j", "display": "J" }, "color": "amber" }
      ]
    },
    "revealDelaysMs": [0, 220, 440],
    "startedAt": 1786…, "deadlineAt": 1786…
  }
}
```

The answer is the letter whose `color` equals `categoryColor` — here, **S**.
The card does not carry an explicit answer field; the client is expected to
render the rule rather than shortcut it. This is not secrecy (the answer is
plainly derivable, and has to be, or there would be nothing to read) — the
round tests speed, not hidden information.

`revealDelaysMs` is cosmetic staggering that mimics a card being turned over.
The round is live from `startedAt`; answers submitted during the animation
count.

`deadlineAt` is `null` in untimed modes.

### `answer:rejected`
```json
{ "t": "answer:rejected", "reason": "wrong-initial", "word": "elefante" }
```

Sent only to the player who answered. Reasons: `empty`, `wrong-initial`,
`already-used`, `unknown-word`, `round-closed`, `needs-reading`.

### `challenge`
Broadcast when an unknown word goes to a vote, and again after each vote so
the tally updates live.

```json
{ "t": "challenge", "challenge": {
    "playerId": "p_…", "playerName": "Bruno", "word": "equidna",
    "deadlineAt": 1786…, "voters": 3, "accepted": 1, "rejected": 0 } }
```

The round clock is paused for the duration. A majority of votes *cast* accepts;
a tie rejects.

### `round:end`
```json
{ "t": "round:end", "result": {
    "reason": "won", "winnerId": "p_…",
    "surface": "elefante", "submitted": "elefnte",
    "category": "animal", "answerInitial": { "id": "e", "display": "E" },
    "elapsedMs": 2140, "byVote": false,
    "scores": [ { "playerId": "p_…", "score": 3 } ],
    "nextRoundInMs": 2500 } }
```

`reason` is `won`, `timeout` or `abandoned`. `surface` is the bank's spelling;
`submitted` is only present when the player typed something different (a typo
that was forgiven, or an accent they skipped).

### `game:end`
Final ranking, every word played, and the words that were accepted by vote —
the last of which the client surfaces as word-bank suggestions.

### `error`
```json
{ "t": "error", "code": "not-host", "message": "Only the host can start." }
```

Codes: `bad-message`, `room-not-found`, `room-full`, `name-taken`, `not-host`,
`already-started`, `not-enough-players`, `too-many-players`, `no-cards`,
`rate-limited`, `internal`.

`message` is English and meant for developers. The client renders its own
localised text from the code and from `answer:rejected` reasons — never the
server's string in the player's face, since the server does not know their
interface language.

## Close codes

| Code | Meaning | Client behaviour |
|---|---|---|
| 1000 | Normal | No reconnect. |
| 4000 | Replaced by a newer connection for the same seat | No reconnect. |
| 4003 | Join refused (room full, already started) | No reconnect. |
| 4004 | No such room | No reconnect. |
| anything else | Network trouble | Reconnect with backoff, replaying `hello` with the saved token. |

## Limits

- 4 KiB per message; larger frames close the socket.
- 600 ms minimum between answers from one player.
- 6 answer attempts per player per round.
- 30-second ping; sockets that miss a pong are terminated.
