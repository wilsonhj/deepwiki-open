import { describe, expect, it } from 'vitest';
import {
  getBank,
  getLanguage,
  validateAnswer,
  type CategoryId,
  type LanguageId,
  type ValidationContext,
} from '@lexo/core';

function context(
  languageId: LanguageId,
  category: CategoryId,
  expectedInitialId: string,
  overrides: Partial<ValidationContext> = {},
): ValidationContext {
  return {
    language: getLanguage(languageId),
    bank: getBank(languageId),
    category,
    expectedInitialId,
    usedKeys: new Set(),
    allowRepeats: false,
    allowChallenges: true,
    ...overrides,
  };
}

describe('validateAnswer — Spanish', () => {
  it('accepts a bank word with the right initial', () => {
    const result = validateAnswer(context('es', 'animal', 'e'), 'elefante');
    expect(result.status).toBe('accepted');
  });

  it('accepts it without accents', () => {
    expect(validateAnswer(context('es', 'animal', 'l'), 'leon').status).toBe('accepted');
    expect(validateAnswer(context('es', 'animal', 'b'), 'BUHO').status).toBe('accepted');
  });

  it('rejects the right word under the wrong letter', () => {
    const result = validateAnswer(context('es', 'animal', 'g'), 'elefante');
    expect(result).toMatchObject({ status: 'rejected', reason: 'wrong-initial' });
  });

  it('forgives a typo in a long word', () => {
    const result = validateAnswer(context('es', 'animal', 'e'), 'elefnte');
    expect(result).toMatchObject({ status: 'accepted', corrected: true });
    if (result.status === 'accepted') expect(result.entry.surface).toBe('elefante');
  });

  it('does not forgive a typo that changes the initial', () => {
    const result = validateAnswer(context('es', 'animal', 'e'), 'lefante');
    expect(result.status).not.toBe('accepted');
  });

  it('blocks a word already won this game', () => {
    const used = new Set(['elefante']);
    const result = validateAnswer(context('es', 'animal', 'e', { usedKeys: used }), 'elefante');
    expect(result).toMatchObject({ status: 'rejected', reason: 'already-used' });
  });

  it('allows the repeat in easy mode', () => {
    const used = new Set(['elefante']);
    const result = validateAnswer(
      context('es', 'animal', 'e', { usedKeys: used, allowRepeats: true }),
      'elefante',
    );
    expect(result.status).toBe('accepted');
  });

  it('sends an unknown word to a vote', () => {
    const result = validateAnswer(context('es', 'animal', 'e'), 'equidna');
    expect(result.status).toBe('challenge');
  });

  it('rejects the unknown word outright when nobody can vote', () => {
    const result = validateAnswer(
      context('es', 'animal', 'e', { allowChallenges: false }),
      'equidna',
    );
    expect(result).toMatchObject({ status: 'rejected', reason: 'unknown-word' });
  });

  it('rejects an empty answer', () => {
    expect(validateAnswer(context('es', 'animal', 'e'), '   ')).toMatchObject({
      status: 'rejected',
      reason: 'empty',
    });
  });

  it('ignores a leading article', () => {
    expect(validateAnswer(context('es', 'animal', 'v'), 'la vaca').status).toBe('accepted');
  });
});

describe('validateAnswer — French', () => {
  it('accepts an elided article', () => {
    expect(validateAnswer(context('fr', 'animal', 'o'), "l'ours").status).toBe('accepted');
  });

  it('accepts œuf under O', () => {
    expect(validateAnswer(context('fr', 'food', 'o'), 'oeuf').status).toBe('accepted');
    expect(validateAnswer(context('fr', 'food', 'o'), 'œuf').status).toBe('accepted');
  });
});

describe('validateAnswer — Portuguese', () => {
  it('accepts a multi-word entry however it is spaced', () => {
    expect(validateAnswer(context('pt', 'food', 'g'), 'grão-de-bico').status).toBe('accepted');
    expect(validateAnswer(context('pt', 'food', 'g'), 'grao de bico').status).toBe('accepted');
  });
});

describe('validateAnswer — Japanese', () => {
  it('accepts a kana answer in the right row', () => {
    expect(validateAnswer(context('ja', 'animal', 'a'), 'いぬ').status).toBe('accepted');
    expect(validateAnswer(context('ja', 'animal', 'a'), 'イヌ').status).toBe('accepted');
  });

  it('treats voiced kana as their unvoiced row', () => {
    expect(validateAnswer(context('ja', 'animal', 'ka'), 'ゴリラ').status).toBe('accepted');
    expect(validateAnswer(context('ja', 'animal', 'ha'), 'パンダ').status).toBe('accepted');
  });

  it('rejects a word from the wrong row', () => {
    expect(validateAnswer(context('ja', 'animal', 'ka'), 'いぬ')).toMatchObject({
      status: 'rejected',
      reason: 'wrong-initial',
    });
  });

  it('accepts kanji the bank already knows', () => {
    expect(validateAnswer(context('ja', 'city', 'ta'), '東京').status).toBe('accepted');
  });

  it('asks for a reading when it cannot read the kanji', () => {
    expect(validateAnswer(context('ja', 'animal', 'a'), '猫')).toMatchObject({
      status: 'rejected',
      reason: 'needs-reading',
    });
  });

  it('accepts kanji when the player supplies the reading', () => {
    expect(validateAnswer(context('ja', 'animal', 'na'), '猫 ねこ').status).toBe('accepted');
    expect(validateAnswer(context('ja', 'animal', 'na'), '猫（ねこ）').status).toBe('accepted');
  });
});
