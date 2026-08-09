/**
 * Answer validation.
 *
 * The server is the authority — it runs this and its verdict is final —
 * but the client runs the exact same function to grey out obviously
 * wrong answers before they cost a round trip. Keeping it pure and
 * shared is what makes those two agree.
 *
 * Order matters. An answer is checked for shape, then initial, then
 * membership, then uniqueness, because that is the order in which a
 * human at a table would object to it.
 */

import type { BankEntry, CategoryId, ValidationOutcome } from './types.js';
import type { LanguageConfig } from './languages.js';
import { analyse } from './languages.js';
import type { CompiledBank } from './bank.js';
import { findBySurface } from './bank.js';
import { allowedTypos, editDistance, isAllKana, tidy } from './normalize.js';

export interface ValidationContext {
  language: LanguageConfig;
  bank: CompiledBank;
  category: CategoryId;
  /** The initial the colour match demands this round. */
  expectedInitialId: string;
  /** Canonical keys already won this game. */
  usedKeys: ReadonlySet<string>;
  /** Kids/easy mode: a word may be played again. */
  allowRepeats: boolean;
  /** When false an unknown word is simply rejected (solo play). */
  allowChallenges: boolean;
}

/**
 * Pull a kana reading out of a Japanese submission.
 *
 * Players may answer `いぬ`, `犬` (if the bank knows it), or
 * `犬 いぬ` / `犬（いぬ）` / `犬|いぬ` to teach the game a word it does
 * not have yet.
 */
const JA_WITH_READING = /^(.+?)[\s|｜(（]+([ぁ-ゖァ-ヺー]+)[)）]?$/;

export function splitJapaneseInput(raw: string): { surface: string; reading: string | null } {
  const trimmed = tidy(raw);
  const match = JA_WITH_READING.exec(trimmed);
  if (match) return { surface: tidy(match[1]), reading: match[2] };
  if (isAllKana(trimmed)) return { surface: trimmed, reading: trimmed };
  return { surface: trimmed, reading: null };
}

/** Closest bank entry within the round's bucket, if it is close enough. */
function nearestEntry(
  context: ValidationContext,
  key: string,
): BankEntry | undefined {
  const budget = allowedTypos(key);
  if (budget === 0) return undefined;

  const bucket = context.bank.byInitial.get(context.category)?.get(context.expectedInitialId);
  if (!bucket) return undefined;

  let best: BankEntry | undefined;
  let bestDistance = budget + 1;
  for (const entry of bucket) {
    // A typo may not change the first character, or the whole
    // colour-matching rule becomes negotiable.
    if (entry.key.charAt(0) !== key.charAt(0)) continue;
    const distance = editDistance(entry.key, key, budget);
    if (distance < bestDistance) {
      best = entry;
      bestDistance = distance;
      if (distance === 1) break;
    }
  }
  return bestDistance <= budget ? best : undefined;
}

export function validateAnswer(context: ValidationContext, raw: string): ValidationOutcome {
  const { language, bank, category } = context;
  const trimmed = tidy(raw ?? '');
  if (!trimmed) return { status: 'rejected', reason: 'empty', key: '' };

  // ---- Japanese takes a different route to a reading -------------------
  let probe = trimmed;
  if (language.script === 'kana') {
    const { surface, reading } = splitJapaneseInput(trimmed);

    const known = findBySurface(bank, category, surface);
    if (known) {
      return finish(context, known.key, known, false);
    }
    if (!reading) {
      // Kanji we have never seen. We cannot know how it is read, and
      // guessing would let any word satisfy any initial.
      return { status: 'rejected', reason: 'needs-reading', key: '' };
    }
    probe = reading;
  }

  const { key, initialId } = analyse(language, probe);
  if (!key) return { status: 'rejected', reason: 'empty', key: '' };

  if (initialId !== context.expectedInitialId) {
    return { status: 'rejected', reason: 'wrong-initial', key };
  }

  const exact = bank.byKey.get(category)?.get(key);
  if (exact) return finish(context, exact.key, exact, false);

  const near = nearestEntry(context, key);
  if (near) return finish(context, near.key, near, true);

  if (!context.allowRepeats && context.usedKeys.has(key)) {
    return { status: 'rejected', reason: 'already-used', key };
  }
  if (!context.allowChallenges) {
    return { status: 'rejected', reason: 'unknown-word', key };
  }
  return { status: 'challenge', key, reading: probe };
}

/** Shared tail: uniqueness is the last gate before an answer stands. */
function finish(
  context: ValidationContext,
  key: string,
  entry: BankEntry,
  corrected: boolean,
): ValidationOutcome {
  if (entry.initialId !== context.expectedInitialId) {
    return { status: 'rejected', reason: 'wrong-initial', key };
  }
  if (!context.allowRepeats && context.usedKeys.has(key)) {
    return { status: 'rejected', reason: 'already-used', key };
  }
  return { status: 'accepted', entry, key, corrected };
}
