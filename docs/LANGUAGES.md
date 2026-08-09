# Languages

How Lexo handles each language, and how to add another.

## The problem

"A word starting with the letter X" is not a portable rule. Ported carelessly
it produces dead rounds in one language and nonsense in another:

- **Q** is fine in Portuguese (`queijo`, `quiabo`, `quintal`) and nearly empty
  in French.
- **O** has one country in Spanish (Omán) and three in French, because French
  spells Uganda `Ouganda`.
- **Japanese has no initial letters at all.** Words are written in kanji whose
  reading is not derivable from the characters, and the alphabet the game would
  need — kana — has 46 base symbols where most languages have 20-odd usable
  ones.

So the alphabet, the folding rules and even the *unit* of an initial are
per-language.

## Shared machinery

Every language answers three questions about a submitted string, in
`packages/core/src/normalize.ts`:

1. **What does it sound like** — the reading.
2. **What is its canonical key** — used for bank lookup and for the
   already-played check.
3. **Which initial does it start with.**

The folding pipeline is: NFD-decompose → strip combining marks → lowercase →
expand ligatures → strip a leading article → drop everything that is not a
letter or kana.

Stripping combining marks is doing double duty. For Latin scripts it turns
`é` into `e` and `ç` into `c`. For kana it turns `が` into `か` and `ぱ` into
`は`, which is exactly the fold Japanese needs.

## Spanish, French, Portuguese

**Initials:** `A B C D E F G H I J L M N O P Q R S T U V Z`. K, W, X and Y are
excluded — words starting with them are almost all loanwords, and a round that
asks for one is a round nobody enjoys.

Not every letter appears in every game. A card is only built from a
category/letter pair the word bank can answer with at least three words, so
thin pairs simply never come up. That is why `npm run bank:check` reports
"almost playable" pairs — they are the ones worth a contribution.

**Articles** are listed in [`RULES.md`](RULES.md#articles-and-accents). They are
matched against the folded string and only count when followed by a space or an
apostrophe.

**Ligatures** that NFD does not decompose are expanded explicitly: `œ`→`oe`,
`æ`→`ae`, `ß`→`ss`, `ø`→`o`. Without this, `œuf` keys to `uf` and gets filed
under U.

## Japanese

**Initials are kana rows (行), not single kana.**

| Row | Kana |
|---|---|
| あ行 | あ い う え お |
| か行 | か き く け こ |
| さ行 | さ し す せ そ |
| た行 | た ち つ て と |
| な行 | な に ぬ ね の |
| は行 | は ひ ふ へ ほ |
| ま行 | ま み む め も |
| や行 | や ゆ よ |
| ら行 | ら り る れ ろ |
| わ行 | わ |

A card asking for `ぬ` would stall the game. A card asking for な行 keeps it
moving.

**Voiced kana fold onto their row.** `ごりら` counts for か行 and `ぱんだ` for
は行 — which is how you would play it out loud, and falls out of the same
NFD-stripping used for Latin accents.

**Katakana, small kana and the long mark are folded too:** `ギョウザ` →
`きようさ`, `ラーメン` → `らめん`. The result is only ever used for matching,
never for display.

### The kanji problem

`犬` is read `いぬ`, and nothing about the character says so. Lexo has no
morphological analyser and deliberately takes no dependency on one, so it
handles kanji in three ways:

1. **The bank knows it.** Every Japanese bank entry carries its reading
   (`犬|いぬ`), so a player typing `犬` resolves through a surface-form index.
2. **The player types kana.** `いぬ` or `イヌ` are read directly. This is the
   normal path — an IME user has the kana in the box before converting.
3. **The player supplies the reading.** For a word the bank does not have,
   `猫 ねこ`, `猫（ねこ）` and `猫|ねこ` are all accepted, and the reading is
   used for the row check.

Anything else — unknown kanji with no reading — is rejected with
`needs-reading` rather than guessed at. Guessing would let any word satisfy any
row, which would quietly destroy the only rule the game has.

There is one more Japanese-specific detail, in the client rather than the core:
the answer box must not submit while an IME is composing. Japanese players
press Enter to *convert* kana to kanji long before they mean to answer, and a
naive form fires on that first Enter every single time. `Board.tsx` guards on
`event.nativeEvent.isComposing`.

## Adding a language

Two files, plus tests that already exist.

**1. Describe it** in `packages/core/src/languages.ts`:

```ts
it: {
  id: 'it',
  nativeName: 'Italiano',
  bcp47: 'it-IT',
  script: 'latin',
  initials: latinInitials('abcdefgilmnoprstuvz'),
  articles: ['il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', "l'"],
  inputHint: 'Scrivi la tua parola…',
},
```

Add `'it'` to `LanguageId` and `LANGUAGE_IDS` in `types.ts`.

**2. Write the bank** at `packages/core/src/banks/it.ts`, following the shape of
an existing one, and register it in `RAW_BANKS` in `bank.ts`. Aim for at least
three words per category per letter you want in play — `npm run bank:check`
will tell you where you are.

**3. Add the category labels** for the new language in `categories.ts`, and the
mode labels in `modes.ts`. TypeScript will list every place that needs one.

**4. Optionally translate the interface** in `packages/client/src/i18n.ts`. The
game language and the interface language are chosen separately, so this is not
required to play — but a game *for* speakers of a language should speak it.

The existing test suite covers new languages automatically:
`banks.test.ts` and `deck.test.ts` iterate over `LANGUAGE_IDS`, so a bad
reading or an unusable initial fails CI without you writing a test.

### If the script is not Latin or kana

You will need a new `script` value and a branch in `analyse()`. The interesting
question is always the same one Japanese poses: **given what the player typed,
can you determine the initial without a dictionary?** If not, the bank has to
carry the reading, as it does for Japanese. Open an issue before starting —
that design is worth talking through.
