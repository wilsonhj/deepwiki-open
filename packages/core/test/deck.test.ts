import { describe, expect, it } from 'vitest';
import {
  buildDeck,
  CATEGORY_IDS,
  coverage,
  EmptyDeckError,
  getBank,
  LANGUAGE_IDS,
  MIN_WORDS_PER_PAIR,
  playablePairs,
  publicCard,
} from '@lexo/core';

const deckFor = (seed: number) =>
  buildDeck({
    bank: getBank('es'),
    languageId: 'es',
    categories: [...CATEGORY_IDS],
    size: 30,
    seed,
  });

describe('buildDeck', () => {
  it('is deterministic for a seed', () => {
    expect(deckFor(1234)).toEqual(deckFor(1234));
  });

  it('produces a different reserve for a different seed', () => {
    expect(deckFor(1)).not.toEqual(deckFor(2));
  });

  it('gives every card three distinct letters and three distinct colours', () => {
    for (const card of deckFor(99)) {
      expect(card.letters).toHaveLength(3);
      expect(new Set(card.letters.map((l) => l.initial.id)).size).toBe(3);
      expect(new Set(card.letters.map((l) => l.color)).size).toBe(3);
    }
  });

  it('puts the category colour on exactly one letter, and that letter is the answer', () => {
    for (const card of deckFor(7)) {
      const matching = card.letters.filter((l) => l.color === card.categoryColor);
      expect(matching).toHaveLength(1);
      expect(matching[0].initial.id).toBe(card.answerInitialId);
    }
  });

  it('never deals a card the word bank cannot answer', () => {
    const bank = getBank('es');
    for (const card of deckFor(31)) {
      expect(coverage(bank, card.category, card.answerInitialId)).toBeGreaterThanOrEqual(
        MIN_WORDS_PER_PAIR,
      );
    }
  });

  it('avoids repeating a pair while unused pairs remain', () => {
    const cards = deckFor(5);
    const seen = new Set(cards.map((c) => `${c.category}:${c.answerInitialId}`));
    expect(seen.size).toBe(cards.length);
  });

  it('refuses to build a reserve it cannot fill', () => {
    expect(() =>
      buildDeck({
        bank: getBank('es'),
        languageId: 'es',
        categories: [],
        size: 10,
        seed: 1,
      }),
    ).toThrow(EmptyDeckError);
  });
});

describe('publicCard', () => {
  it('omits the answer field', () => {
    const card = publicCard(deckFor(3)[0]);
    expect(card).not.toHaveProperty('answerInitialId');
  });
});

describe('playablePairs', () => {
  it('finds usable pairs in every language', () => {
    for (const languageId of LANGUAGE_IDS) {
      const pairs = playablePairs(getBank(languageId), languageId, CATEGORY_IDS);
      expect(pairs.length, `${languageId} has too few playable pairs`).toBeGreaterThan(60);
    }
  });

  it('builds a full reserve in every language', () => {
    for (const languageId of LANGUAGE_IDS) {
      const deck = buildDeck({
        bank: getBank(languageId),
        languageId,
        categories: [...CATEGORY_IDS],
        size: 30,
        seed: 42,
      });
      expect(deck).toHaveLength(30);
    }
  });
});
