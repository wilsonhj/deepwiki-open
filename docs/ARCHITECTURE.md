# Architecture

## Shape

```
packages/core      Pure rules. No dependencies, no I/O, runs in both runtimes.
      │
      ├──────────────┐
      ▼              ▼
packages/server   packages/client
Node + ws         React + Vite
Authority         Mirror
```

`@lexo/core` holds the word banks, the normalisation rules, deck generation and
`validateAnswer`. It is imported by both sides.

**The server runs it to decide. The client runs it to predict.** That is the
whole reason it is a separate package: an out-of-date client can render a stale
UI, but it can never disagree with a score, because the score was computed by
the server using the same function.

## Server authority

Everything that affects the outcome lives in `Room` (`packages/server/src/room.ts`):
the reserve, the round clock, the used-word set, the scores. The socket layer
parses, rate-limits and routes; it decides nothing.

**Answers are stamped on arrival.** The server records `Date.now()` at the
moment it reads the message, and never trusts a timestamp from a client. A
client that claims it answered 40 ms ago is ignored, because it never gets to
claim anything.

### What that does and does not guarantee

It guarantees nobody can cheat by lying about time.

It does **not** equalise network latency. Two players who think identically at
the same instant are ranked by when their packets arrive, so a player on a
slow connection is genuinely disadvantaged — by their round-trip time, usually
tens of milliseconds.

The alternative is to have clients timestamp locally and have the server
reconcile, which equalises latency and hands every player a trivial way to
cheat. For a party game played by people who know each other, the honest
ordering is the better trade. It is worth being explicit about rather than
implying a fairness the system does not deliver.

## Message strategy

Two kinds of traffic, handled differently on purpose:

- **Room state** — players, settings, phase — is sent as a **full snapshot** on
  every change. It is about a kilobyte and changes a handful of times a game.
- **The round loop** — deal, reject, challenge, result — is sent as **discrete
  events**, because that is the latency-sensitive path and because events carry
  information a snapshot diff would lose (*who* won, *how fast*).

A delta protocol for room state was considered and rejected: it would trade a
kilobyte for a class of desync bugs, at a scale where the kilobyte does not
matter. If rooms ever grow past a handful of players, revisit it.

## The round loop

```
                  ┌──────────────────────────────┐
                  ▼                              │
lobby ──start──> round ──valid answer──> intermission ──> next card
                  │  ▲                           │
        unknown   │  │ vote rejected             │ reserve down to 1 card
         word     ▼  │                           ▼
              challenge                       finished
```

- A card is dealt; the clock starts if the mode has one.
- An unknown word with the right initial opens a **challenge**, which *pauses
  the round clock*. Arguing about a word should not cost the other players
  their time. If the vote fails, the round resumes with the clock exactly where
  it stopped.
- The game ends when one card remains in the reserve. That last card is never
  played, matching the tabletop rule.

## State that survives a disconnect

Each player gets an opaque token on join. The client stores it and replays it
in the `hello` of any reconnect, which returns them to the same seat, score and
live round. Seats are held for two minutes; the host role migrates to the first
still-connected player if the host drops.

Reconnection is handled entirely in `Connection` (`packages/client/src/net.ts`)
with exponential backoff, and it re-sends the queued messages that piled up
while the socket was down.

## Clock skew

Round deadlines are sent as absolute server times. A device whose clock is
minutes off would draw a nonsense countdown, so the client measures skew from
`serverNow` in the `welcome` message and corrects every deadline through
`connection.now()`. Skew is measured once per connection, which is plenty for a
countdown rendered at 10 fps.

## Anti-abuse

| Vector | Mitigation |
|---|---|
| Answer spam / alphabet brute force | 600 ms cooldown per player, 6 attempts per round |
| Oversized payloads | 4 KiB `maxPayload` on the socket |
| Room exhaustion | Cap on concurrent rooms; empty rooms collected after 5 minutes |
| Zombie connections | 30-second ping/pong, dead sockets terminated |
| Path traversal in the static server | Paths resolved, then checked to still be inside the client bundle |

None of this makes Lexo safe to expose as a public service to hostile users
without a reverse proxy in front of it — see
[`SELF_HOSTING.md`](SELF_HOSTING.md).

## Determinism

Deck generation is seeded (mulberry32, `core/src/rng.ts`). A game is
reproducible from its seed, and the deck tests can assert exact equality rather
than statistical properties. Nothing else in the core uses randomness.

## Why no database

There is nothing worth persisting. A game lives for a few minutes, and its
result is interesting to the six people who played it, who are all looking at
it. Rooms are in memory; restarting the server ends the games, which is the
honest behaviour for a party game and saves every user a privacy question.

The one exception is the optional suggestions log, which is append-only JSONL
and exists to feed word-bank pull requests.
