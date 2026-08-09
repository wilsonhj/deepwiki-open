# Word banks

Adding words is the most useful thing you can do for this project, and it needs
no JavaScript.

## Where they live

```
packages/core/src/banks/
  es.ts    Español
  fr.ts    Français
  pt.ts    Português
  ja.ts    日本語
```

Each is a plain list per category:

```ts
export const es: RawBank = {
  animal: [
    'abeja', 'águila', 'alce', 'antílope',
    // …
  ],
  country: [ /* … */ ],
};
```

Categories: `animal`, `country`, `city`, `food`, `object`, `profession`,
`plant`, `name`.

## Finding the gaps

```bash
npm run bank:check
```

```
Español  (es)
────────────────────────────────────────────────────
  757 words · 165/176 playable pairs (need 3+ words each)

  Almost playable — 2 or fewer words:
      · Country/D (2)
      · Country/Z (2)
      · Food/U (1)
```

**A category/letter pair with fewer than three words never appears in a game.**
Those "almost playable" lines are therefore the highest-value additions: one
word can unlock a whole card that nobody has ever seen.

## Rules for entries

**Write the word as a player would write it**, accents and all. Accents are
folded away for matching, but the bank spelling is what gets displayed as the
winning word.

**No leading articles.** `La Paz` would be filed under P, which is probably not
what you want. Write `Paz`, or pick a different entry. The exception is a name
where the article is genuinely part of it and the P-filing is correct, like
`Le Havre` under H.

**One word, one entry.** Regional variants get their own line rather than being
merged — `patata` and `papa` are both valid Spanish, and both should win.

**Keep it playable.** A word nobody at a table would think of is not a good
bank entry, even if it is in the dictionary. The bank exists so that ordinary
answers are accepted instantly; the [vote](RULES.md#words-the-game-does-not-know)
handles the exotic ones.

**Alphabetical within a category** is the convention, grouped loosely by
initial. It is not enforced, but it makes gaps visible.

### Japanese

Every entry needs a reading, separated by `|`:

```ts
'犬|いぬ', 'ネコ|ねこ', '東京|とうきょう',
```

The reading must be kana, and it determines the row the word is filed under.
The surface can be kanji, hiragana or katakana — whichever a player is most
likely to type. See [`LANGUAGES.md`](LANGUAGES.md#japanese).

CI rejects a Japanese entry with a missing or non-kana reading, so a mistake
here fails the pull request rather than a game.

The `surface|reading` form works in any language, not just Japanese. It is
occasionally useful elsewhere when the written and spoken forms disagree.

## Checking your work

```bash
npm test
```

The bank tests assert, for every language:

- every entry compiles to a valid initial for that language;
- every entry is **accepted back** by the validator when submitted for its own
  category and initial — a round trip that catches bad readings, stray
  punctuation and words that fold to nothing;
- no category is left under-filled.

If you add a word and the suite passes, the word works.

## Where suggestions come from

When players vote an unknown word through during a game, it is shown on the
final screen and — if the server is run with `LEXO_SUGGESTIONS_FILE` set —
appended to a JSONL file:

```json
{"category":"animal","word":"equidna","language":"es","at":"2026-08-09T19:04:11.000Z"}
```

Those are real players agreeing that a word counts, which is exactly the signal
the bank is missing. Turning a batch of them into a pull request is a very
welcome contribution.

## Licensing

Words are facts, not creative work, and this bank is hand-written. Please do
not paste in a list scraped from a commercial game, a paywalled dictionary or
any source whose terms forbid redistribution. Everything here is MIT licensed
along with the rest of the project.
