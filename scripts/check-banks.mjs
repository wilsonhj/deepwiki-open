#!/usr/bin/env node
/**
 * Word-bank report.
 *
 * Run this after adding words. It shows, per language, how many
 * category/initial pairs are playable and which ones are one or two
 * words short — those are the highest-value contributions, because a
 * pair below the threshold never appears in a game at all.
 *
 *   npm run bank:check
 */

import {
  CATEGORIES,
  CATEGORY_IDS,
  LANGUAGES,
  LANGUAGE_IDS,
  MIN_WORDS_PER_PAIR,
  bankSize,
  coverage,
  getBank,
  playablePairs,
} from '../packages/core/dist/index.js';

let exitCode = 0;

for (const languageId of LANGUAGE_IDS) {
  const bank = getBank(languageId);
  const language = LANGUAGES[languageId];
  const pairs = playablePairs(bank, languageId, CATEGORY_IDS);
  const possible = CATEGORY_IDS.length * language.initials.length;

  console.log(`\n${language.nativeName}  (${languageId})`);
  console.log('─'.repeat(52));
  console.log(
    `  ${bankSize(bank)} words · ${pairs.length}/${possible} playable pairs ` +
      `(need ${MIN_WORDS_PER_PAIR}+ words each)`,
  );

  if (bank.rejected.length > 0) {
    exitCode = 1;
    console.log(`\n  ✗ ${bank.rejected.length} entries could not be filed:`);
    for (const bad of bank.rejected) {
      console.log(`      ${bad.category}: "${bad.raw}" — ${bad.reason}`);
    }
  }

  const nearMisses = [];
  for (const category of CATEGORY_IDS) {
    for (const initial of language.initials) {
      const count = coverage(bank, category, initial.id);
      if (count > 0 && count < MIN_WORDS_PER_PAIR) {
        nearMisses.push(`${CATEGORIES[category].label.en}/${initial.display} (${count})`);
      }
    }
  }

  if (nearMisses.length > 0) {
    console.log(`\n  Almost playable — ${MIN_WORDS_PER_PAIR - 1} or fewer words:`);
    for (const miss of nearMisses) console.log(`      · ${miss}`);
  }
}

console.log('');
process.exit(exitCode);
