/**
 * Reserve (deck) generation.
 *
 * A card is only ever built from a category/initial pair the word bank
 * can actually answer. That is the whole reason `MIN_WORDS_PER_PAIR`
 * exists: "a country starting with O" is a dead round in Spanish, and a
 * dead round is worse than a missing letter.
 */

import type { Card, CategoryId, ColorId, LanguageId } from './types.js';
import { COLOR_IDS } from './types.js';
import { getLanguage } from './languages.js';
import type { CompiledBank } from './bank.js';
import { coverage } from './bank.js';
import { createRng, type Rng, shuffle } from './rng.js';

/** Below this, a category/initial pair is left out of the reserve. */
export const MIN_WORDS_PER_PAIR = 3;

export const DEFAULT_DECK_SIZE = 30;
export const MIN_DECK_SIZE = 5;
export const MAX_DECK_SIZE = 120;

export interface PlayablePair {
  category: CategoryId;
  initialId: string;
  count: number;
}

/** Every category/initial pair the bank can support, richest first. */
export function playablePairs(
  bank: CompiledBank,
  languageId: LanguageId,
  categories: readonly CategoryId[],
  minWords = MIN_WORDS_PER_PAIR,
): PlayablePair[] {
  const language = getLanguage(languageId);
  const pairs: PlayablePair[] = [];
  for (const category of categories) {
    for (const initial of language.initials) {
      const count = coverage(bank, category, initial.id);
      if (count >= minWords) pairs.push({ category, initialId: initial.id, count });
    }
  }
  return pairs.sort((a, b) => b.count - a.count);
}

export interface DeckOptions {
  bank: CompiledBank;
  languageId: LanguageId;
  categories: readonly CategoryId[];
  size: number;
  seed: number;
  minWords?: number;
}

export class EmptyDeckError extends Error {
  constructor(languageId: LanguageId, categories: readonly CategoryId[]) {
    super(
      `No playable category/initial pairs for ${languageId} with categories ` +
        `[${categories.join(', ')}]. Add words to the bank or pick more categories.`,
    );
    this.name = 'EmptyDeckError';
  }
}

/**
 * Build the reserve.
 *
 * Pairs are drawn without replacement so a short game never repeats
 * itself; once the pool is exhausted it is reshuffled, which only
 * happens for decks larger than the bank's coverage.
 */
export function buildDeck(options: DeckOptions): Card[] {
  const { bank, languageId, categories, size, seed } = options;
  const language = getLanguage(languageId);
  const pool = playablePairs(bank, languageId, categories, options.minWords);
  if (pool.length === 0) throw new EmptyDeckError(languageId, categories);

  const rng = createRng(seed);
  const cards: Card[] = [];
  let bag: PlayablePair[] = [];

  for (let index = 0; index < size; index++) {
    if (bag.length === 0) bag = shuffle(rng, pool);
    const pair = bag.pop()!;
    cards.push(buildCard(rng, language.initials, pair, index));
  }
  return cards;
}

function buildCard(
  rng: Rng,
  initials: ReturnType<typeof getLanguage>['initials'],
  pair: PlayablePair,
  index: number,
): Card {
  const answer = initials.find((initial) => initial.id === pair.initialId)!;
  const decoys = shuffle(
    rng,
    initials.filter((initial) => initial.id !== pair.initialId),
  ).slice(0, 2);

  // One colour is drawn for the category; the answer letter wears it and
  // the decoys take the other two.
  const [categoryColor, ...otherColors] = shuffle(rng, COLOR_IDS) as ColorId[];
  const letters = shuffle(rng, [
    { initial: answer, color: categoryColor },
    { initial: decoys[0], color: otherColors[0] },
    { initial: decoys[1], color: otherColors[1] },
  ]);

  return {
    id: `${pair.category}-${pair.initialId}-${index}`,
    category: pair.category,
    categoryColor,
    letters,
    answerInitialId: pair.initialId,
  };
}

/**
 * The card as sent to players.
 *
 * `answerInitialId` is dropped, but be clear about what that buys: the
 * answer is *derivable* from the card (it is the letter wearing the
 * category's colour) and it has to be, or there would be nothing to
 * read. Dropping the field only stops the client from taking a shortcut
 * around the colour rule it is supposed to render. Speed, not secrecy,
 * is what the round is testing.
 */
export function publicCard(card: Card): Omit<Card, 'answerInitialId'> {
  const { answerInitialId: _ignored, ...rest } = card;
  return rest;
}
