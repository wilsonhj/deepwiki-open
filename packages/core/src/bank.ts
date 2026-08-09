/**
 * Compiles contributor-facing word lists into the indexes validation
 * needs.
 *
 * Banks are plain string arrays so that adding a word stays a one-line
 * change. All the derived structure — keys, initials, per-initial
 * buckets — is computed here, once, at module load.
 */

import type { BankEntry, CategoryId, LanguageId, RawBank } from './types.js';
import { CATEGORY_IDS } from './types.js';
import { analyse, getLanguage, type LanguageConfig } from './languages.js';
import { isAllKana, kanaFold, tidy } from './normalize.js';
import { es } from './banks/es.js';
import { fr } from './banks/fr.js';
import { pt } from './banks/pt.js';
import { ja } from './banks/ja.js';

export const RAW_BANKS: Record<LanguageId, RawBank> = { es, fr, pt, ja };

export interface CompiledBank {
  language: LanguageId;
  /** Every entry, grouped by category. */
  byCategory: Map<CategoryId, BankEntry[]>;
  /** `category → initialId → entries`, for deck coverage and fuzzy search. */
  byInitial: Map<CategoryId, Map<string, BankEntry[]>>;
  /** `category → normalised key → entry`, the fast path for lookups. */
  byKey: Map<CategoryId, Map<string, BankEntry>>;
  /**
   * `category → exact surface → entry`. Only meaningful for Japanese,
   * where a player types `犬` and no amount of folding will produce
   * `いぬ` from it.
   */
  bySurface: Map<CategoryId, Map<string, BankEntry>>;
  /** Entries that could not be filed under any initial, for diagnostics. */
  rejected: Array<{ category: CategoryId; raw: string; reason: string }>;
}

/** Split a `"surface|reading"` bank line. */
export function parseBankLine(raw: string): { surface: string; reading: string } {
  const bar = raw.indexOf('|');
  if (bar === -1) {
    const surface = raw.trim();
    return { surface, reading: surface };
  }
  return {
    surface: raw.slice(0, bar).trim(),
    reading: raw.slice(bar + 1).trim(),
  };
}

function compileEntry(
  language: LanguageConfig,
  raw: string,
): { entry: BankEntry } | { error: string } {
  const { surface, reading } = parseBankLine(raw);
  if (!surface) return { error: 'empty surface' };
  if (language.script === 'kana' && !isAllKana(reading)) {
    return { error: 'Japanese entries need a kana reading: "surface|よみ"' };
  }

  const { key, initialId } = analyse(language, reading);
  if (!key) return { error: 'reading normalises to nothing' };
  if (!initialId) return { error: `no initial matches "${reading}"` };

  return { entry: { surface, reading, key, initialId } };
}

export function compileBank(languageId: LanguageId, raw: RawBank): CompiledBank {
  const language = getLanguage(languageId);
  const bank: CompiledBank = {
    language: languageId,
    byCategory: new Map(),
    byInitial: new Map(),
    byKey: new Map(),
    bySurface: new Map(),
    rejected: [],
  };

  for (const category of CATEGORY_IDS) {
    const lines = raw[category] ?? [];
    const entries: BankEntry[] = [];
    const byInitial = new Map<string, BankEntry[]>();
    const byKey = new Map<string, BankEntry>();
    const bySurface = new Map<string, BankEntry>();

    for (const line of lines) {
      const result = compileEntry(language, line);
      if ('error' in result) {
        bank.rejected.push({ category, raw: line, reason: result.error });
        continue;
      }
      const { entry } = result;
      // First writer wins, so a duplicate word never shadows the
      // original spelling shown to players.
      if (byKey.has(entry.key)) continue;

      entries.push(entry);
      byKey.set(entry.key, entry);
      bySurface.set(tidy(entry.surface), entry);
      if (language.script === 'kana') {
        // カメ and かめ are the same answer to a player.
        bySurface.set(kanaFold(tidy(entry.surface)), entry);
      }
      const bucket = byInitial.get(entry.initialId);
      if (bucket) bucket.push(entry);
      else byInitial.set(entry.initialId, [entry]);
    }

    bank.byCategory.set(category, entries);
    bank.byInitial.set(category, byInitial);
    bank.byKey.set(category, byKey);
    bank.bySurface.set(category, bySurface);
  }

  return bank;
}

const compiled = new Map<LanguageId, CompiledBank>();

/** Compiled bank for a language, built on first use and then cached. */
export function getBank(languageId: LanguageId): CompiledBank {
  let bank = compiled.get(languageId);
  if (!bank) {
    bank = compileBank(languageId, RAW_BANKS[languageId]);
    compiled.set(languageId, bank);
  }
  return bank;
}

/** How many bank words satisfy a category/initial pair. */
export function coverage(bank: CompiledBank, category: CategoryId, initialId: string): number {
  return bank.byInitial.get(category)?.get(initialId)?.length ?? 0;
}

/** Total words held for a language, for the stats in the README. */
export function bankSize(bank: CompiledBank): number {
  let total = 0;
  for (const entries of bank.byCategory.values()) total += entries.length;
  return total;
}

/** Look up by normalised key within a category. */
export function findByKey(
  bank: CompiledBank,
  category: CategoryId,
  key: string,
): BankEntry | undefined {
  return bank.byKey.get(category)?.get(key);
}

/**
 * Look up by the exact string a player typed.
 *
 * This is how kanji answers resolve: `犬` is not foldable to a reading,
 * but it is a key in this index.
 */
export function findBySurface(
  bank: CompiledBank,
  category: CategoryId,
  surface: string,
): BankEntry | undefined {
  const index = bank.bySurface.get(category);
  if (!index) return undefined;
  const trimmed = tidy(surface);
  // The folded probe lets カメ and かめ find the same entry; kanji pass
  // through kanaFold untouched and match on the exact form.
  return index.get(trimmed) ?? index.get(kanaFold(trimmed));
}
