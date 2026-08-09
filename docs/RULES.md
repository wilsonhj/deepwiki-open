# Rules

## A round

1. A card is turned over. It shows a **category** in one of three colours, and
   **three letters**, each in one of the same three colours.
2. Exactly one letter shares the category's colour. **That is the letter that
   counts.** The other two are there to be misread.
3. Everyone plays at once. There are no turns.
4. The first player to submit a word that is in the category and starts with
   the right letter wins the card.
5. After a short pause showing the winning word, the next card is dealt.

Colour is never the only cue: each colour is paired with a shape (● circle,
▲ triangle, ■ square), so the match is readable without colour perception.

## A game

- The reserve holds between 5 and 120 cards; 30 by default.
- The game ends when **one card is left**. That last card is never played —
  inherited from the tabletop games this shape comes from, where the final card
  has no next card to match against.
- So a 30-card reserve is 29 rounds.
- Most cards wins. Ties break on average answer time.

## What counts as a valid answer

Checked in this order, which is the order a person at a table would object:

| Check | Rule |
|---|---|
| **Not empty** | Whitespace alone is ignored, and does not spend a team's answer. |
| **Right initial** | After articles and accents are stripped. See below. |
| **In the category** | Found in the word bank, or accepted by a vote. |
| **Not already played** | Each word wins at most once per game, unless repeats are allowed. |

### Articles and accents

Leading articles are removed before the initial is read:

- Spanish — `el`, `la`, `los`, `las`, `un`, `una`, `unos`, `unas`
- French — `l'`, `le`, `la`, `les`, `un`, `une`, `des`, `du`
- Portuguese — `o`, `a`, `os`, `as`, `um`, `uma`, `uns`, `umas`

An article only counts as one when followed by a space or an apostrophe, so
`lavanda` and `Lille` still start with L. `L'ours` is filed under O.

Accents, cedillas, tildes and ligatures are folded away: `águila` = `aguila`,
`açúcar` = `acucar`, `œuf` = `oeuf`. Spaces and hyphens are ignored entirely,
so `grão-de-bico` and `grao de bico` are the same answer.

### Typos

Small misspellings in long words are forgiven — one edit from five characters,
two from nine. Short words get no slack, because `oso` and `osa` are different
animals. A typo may never change the first character; that would make the
whole colour rule negotiable.

### Words the game does not know

The word bank is a starting point, not a dictionary. When a word has the right
initial but is not in the bank:

- **With other players present** — a **5-second vote** opens. A majority of
  votes cast accepts it. **A tie rejects**, so the burden is on the word to
  convince the table. The round clock is paused while voting, so arguing does
  not cost the other players their time.
- **In solo practice** — there is nobody to ask, so the answer is simply
  rejected.

Words accepted by vote are listed at the end of the game so they can be
[added to the bank](WORD_BANKS.md).

## Fair play

- **The server decides.** An answer is timestamped when the server receives it,
  never from anything the client sends.
- **One answer at a time.** A player must wait 600 ms between answers, and gets
  at most 6 attempts per round. Guessing the whole alphabet is not a strategy.
- **In team mode, a team gets one answer per round** — right or wrong. Buzzing
  in is a decision.

## Modes

| Mode | Players | Clock | Repeats | Notes |
|---|---|---|---|---|
| Classic | 2–6 | none | no | The default. |
| Chrono | 2–6 | 20 s | no | Unanswered cards are discarded and play moves on. |
| Kids | 2–6 | none | **yes** | Simple categories only: animal, country, food, object, first name. |
| Teams | 4–6 | 20 s | no | Two teams; one answer per team per round. |
| Solo | 1 | 15 s | no | No voting — the bank is the referee. |

The host can override any of these settings; the mode is only a starting point.

## Disconnections

A player who drops keeps their seat and score for two minutes and can rejoin
straight into the live round. If the host drops, the host role moves to the
first still-connected player, so nobody is stranded in a lobby.
