/**
 * Per-language configuration.
 *
 * Adding a language means adding one entry here plus one word bank. See
 * `docs/LANGUAGES.md` for the full checklist.
 */

import type { Initial, LanguageId } from './types.js';
import { foldDiacritics, kanaFold, stripArticle, toKey } from './normalize.js';

export interface LanguageConfig {
  id: LanguageId;
  /** Name of the language, written in that language. */
  nativeName: string;
  /** BCP-47 tag, used for `lang=` attributes and speech recognition. */
  bcp47: string;
  script: 'latin' | 'kana';
  /** Every initial a card may show, in display order. */
  initials: Initial[];
  /** Leading articles removed before matching. */
  articles: string[];
  /**
   * Placeholder shown in the answer box, in the language itself.
   */
  inputHint: string;
}

const latinInitials = (letters: string): Initial[] =>
  letters.split('').map((letter) => ({ id: letter, display: letter.toUpperCase() }));

/**
 * Japanese uses kana *rows* rather than single kana.
 *
 * Asking for words starting with `ぬ` would stall the game; asking for
 * the な row (な/に/ぬ/ね/の) keeps it moving. Voiced kana fold onto
 * their unvoiced row, so `が` counts as か行 — see `kanaFold`.
 */
export const KANA_ROWS: Array<{ id: string; display: string; members: string }> = [
  { id: 'a', display: 'あ行', members: 'あいうえお' },
  { id: 'ka', display: 'か行', members: 'かきくけこ' },
  { id: 'sa', display: 'さ行', members: 'さしすせそ' },
  { id: 'ta', display: 'た行', members: 'たちつてと' },
  { id: 'na', display: 'な行', members: 'なにぬねの' },
  { id: 'ha', display: 'は行', members: 'はひふへほ' },
  { id: 'ma', display: 'ま行', members: 'まみむめも' },
  { id: 'ya', display: 'や行', members: 'やゆよ' },
  { id: 'ra', display: 'ら行', members: 'らりるれろ' },
  { id: 'wa', display: 'わ行', members: 'わ' },
];

/** kana → row id, built once from KANA_ROWS. */
const KANA_ROW_BY_CHAR = new Map<string, string>(
  KANA_ROWS.flatMap((row) => Array.from(row.members).map((ch) => [ch, row.id] as const)),
);

export const LANGUAGES: Record<LanguageId, LanguageConfig> = {
  es: {
    id: 'es',
    nativeName: 'Español',
    bcp47: 'es-ES',
    script: 'latin',
    initials: latinInitials('abcdefghijlmnopqrstuvz'),
    articles: ['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas'],
    inputHint: 'Escribe tu palabra…',
  },
  fr: {
    id: 'fr',
    nativeName: 'Français',
    bcp47: 'fr-FR',
    script: 'latin',
    initials: latinInitials('abcdefghijlmnopqrstuvz'),
    articles: ["l'", 'le', 'la', 'les', 'un', 'une', 'des', 'du'],
    inputHint: 'Écris ton mot…',
  },
  pt: {
    id: 'pt',
    nativeName: 'Português',
    bcp47: 'pt-BR',
    script: 'latin',
    initials: latinInitials('abcdefghijlmnopqrstuvz'),
    articles: ['o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas'],
    inputHint: 'Escreva sua palavra…',
  },
  ja: {
    id: 'ja',
    nativeName: '日本語',
    bcp47: 'ja-JP',
    script: 'kana',
    initials: KANA_ROWS.map((row) => ({
      id: row.id,
      display: row.display,
      hint: Array.from(row.members).join('・'),
    })),
    articles: [],
    inputHint: 'ことばを入力…',
  },
};

export function getLanguage(id: LanguageId): LanguageConfig {
  const config = LANGUAGES[id];
  if (!config) throw new Error(`Unknown language: ${id}`);
  return config;
}

/**
 * Turn a raw submission into the three things validation needs.
 *
 * For Japanese, `reading` is only meaningful when the player typed kana;
 * a kanji submission has no derivable reading here, so `initialId` comes
 * back `null` and the caller falls back to a bank lookup by surface
 * form. Doing that properly would need a morphological analyser, which
 * is a dependency Lexo deliberately does not take.
 */
export function analyse(
  language: LanguageConfig,
  input: string,
): { folded: string; key: string; initialId: string | null } {
  if (language.script === 'kana') {
    const folded = kanaFold(input);
    const key = toKey(folded);
    return { folded, key, initialId: rowIdOf(key) };
  }

  const folded = stripArticle(foldDiacritics(input), language.articles);
  const key = toKey(folded);
  const first = key.charAt(0);
  const known = language.initials.some((initial) => initial.id === first);
  return { folded, key, initialId: known ? first : null };
}

/** Kana row for an already-folded reading, or `null`. */
export function rowIdOf(foldedReading: string): string | null {
  const first = foldedReading.charAt(0);
  return first ? (KANA_ROW_BY_CHAR.get(first) ?? null) : null;
}

/** Look an initial up by id, for rendering. */
export function findInitial(language: LanguageConfig, initialId: string): Initial | undefined {
  return language.initials.find((initial) => initial.id === initialId);
}
