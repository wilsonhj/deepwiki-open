/**
 * Word-bank integrity.
 *
 * These run in CI on every pull request, so a contributor who adds a
 * word with a bad reading or an unusable initial finds out immediately
 * instead of at somebody's game night.
 */

import { describe, expect, it } from 'vitest';
import {
  bankSize,
  CATEGORY_IDS,
  getBank,
  getLanguage,
  LANGUAGE_IDS,
  validateAnswer,
  type LanguageId,
} from '@lexo/core';

describe.each(LANGUAGE_IDS)('bank: %s', (languageId: LanguageId) => {
  const bank = getBank(languageId);
  const language = getLanguage(languageId);

  it('compiles every entry', () => {
    expect(bank.rejected, JSON.stringify(bank.rejected, null, 2)).toHaveLength(0);
  });

  it('fills every category', () => {
    for (const category of CATEGORY_IDS) {
      expect(bank.byCategory.get(category)?.length ?? 0, `${languageId}/${category}`).toBeGreaterThan(
        20,
      );
    }
  });

  it('files every entry under an initial the language actually offers', () => {
    const known = new Set(language.initials.map((initial) => initial.id));
    for (const [category, entries] of bank.byCategory) {
      for (const entry of entries) {
        expect(known.has(entry.initialId), `${category}: ${entry.surface}`).toBe(true);
      }
    }
  });

  it('accepts each of its own words back', () => {
    for (const [category, entries] of bank.byCategory) {
      for (const entry of entries) {
        const result = validateAnswer(
          {
            language,
            bank,
            category,
            expectedInitialId: entry.initialId,
            usedKeys: new Set(),
            allowRepeats: false,
            allowChallenges: false,
          },
          entry.surface,
        );
        expect(result.status, `${languageId}/${category}: ${entry.surface}`).toBe('accepted');
      }
    }
  });

  it('holds a usable number of words', () => {
    expect(bankSize(bank)).toBeGreaterThan(300);
  });
});
