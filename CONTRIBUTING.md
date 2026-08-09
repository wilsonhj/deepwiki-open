# Contributing

Contributions are welcome, and they do not have to be code.

## The easiest useful thing: add words

The word banks are the game. A category/letter pair with fewer than three words
never appears in a round, so a handful of words can unlock cards nobody has
ever seen.

```bash
npm install
npm run bank:check
```

The report lists every pair that is one or two words short, per language. Pick
one, add words to `packages/core/src/banks/<lang>.ts`, run `npm test`, open a
pull request. Full guidance in [`docs/WORD_BANKS.md`](docs/WORD_BANKS.md).

You do not need to write any TypeScript to do this — the banks are lists of
strings.

## Add a language

One config entry and one word bank.
[`docs/LANGUAGES.md`](docs/LANGUAGES.md#adding-a-language) walks through it,
including what to think about if the script is neither Latin nor kana.

Please open an issue first for a non-Latin script — the interesting question
(*can you determine a word's initial from what the player typed, without a
dictionary?*) is worth discussing before anyone writes code.

## Translate the interface

`packages/client/src/i18n.ts` holds every interface string in five languages.
Corrections from native speakers are especially welcome — the existing
translations were written carefully, but carefully is not the same as natively.

## Set up

```bash
git clone https://github.com/wilsonhj/lexo.git
cd lexo
npm install
npm run dev      # client on :5173, server on :8080
```

Open two browser windows to play against yourself.

```bash
npm test         # unit + integration
npm run smoke    # boots the server, plays a real game over WebSocket
npm run typecheck
```

## House style

- **TypeScript, strict, ESM.** Relative imports carry the `.js` extension —
  that is what `NodeNext` resolution wants, and it is what lets the same source
  run in Node and in Vite.
- **The core stays pure.** `packages/core` has no dependencies and no I/O. It
  runs in a browser and in Node, unchanged. Keep it that way; it is what lets
  the client predict validation without being able to fake it.
- **The server decides everything that affects a score.** If a change lets the
  client determine an outcome, it is the wrong change.
- **Comments explain why.** The code says what it does. Comment the decision,
  the constraint or the trap — not the syntax.
- **No colour-only information.** Every colour in the UI is paired with a
  shape. This is a game about reading a colour match at speed, which makes it
  exactly the kind of game that excludes people if you get it wrong.

## Tests

Anything that changes validation, deck building or the round loop needs a test.
The suite is fast (under a second) and there is no excuse not to run it.

Two suites are worth understanding before you touch the banks:

- `banks.test.ts` asserts that every word in every bank round-trips: it must
  compile to a valid initial *and* be accepted back by the validator. This is
  what catches a mistyped Japanese reading.
- `deck.test.ts` asserts that no card is ever dealt that the bank cannot
  answer.

Both iterate over `LANGUAGE_IDS`, so a new language is covered the moment you
register it.

## Pull requests

- One topic per pull request. A word-bank addition and a protocol change do not
  belong together.
- Run `npm test` and `npm run typecheck` first; CI runs both, plus the smoke
  test, on Node 20 and 22.
- Describe what a player would notice. "Adds 40 Portuguese plants, unlocking
  Plant/Q and Plant/Z" is a better description than "update pt.ts".

## Scope

Things that fit: languages, words, accessibility, bug fixes, modes that are a
bundle of existing settings, self-hosting improvements.

Things to discuss first: accounts, persistence, matchmaking with strangers,
anything that needs a database. Lexo is a game you play with people you know,
in a room whose code you sent them. That constraint is why there is no login
and nothing stored, and it is worth defending.

## Conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
