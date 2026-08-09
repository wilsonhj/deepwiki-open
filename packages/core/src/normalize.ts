/**
 * Text normalisation.
 *
 * Every language Lexo supports needs the same three answers about a
 * submitted string:
 *
 *   1. what does it *sound* like  (the reading)
 *   2. what is its canonical key  (for uniqueness + bank lookup)
 *   3. which initial does it start with
 *
 * The rules differ per script, so the machinery lives here and the
 * per-language data lives in `languages.ts`.
 *
 * Unicode ranges are written as escapes throughout: several of the
 * characters involved are invisible combining marks, and spelling them
 * out keeps this file safe to edit.
 */

/**
 * Combining marks left behind by NFD.
 *
 * `̀-ͯ` covers Latin accents; `゙`/`゚` are the kana
 * dakuten and handakuten, which is what lets `が` fold onto `か`.
 */
const COMBINING = /[̀-゙゚ͯ]/g;

/**
 * Letters NFD leaves alone because they are not accented forms.
 *
 * `œ` is the one that actually bites: without this, `œuf` keys to `uf`
 * and gets filed under U instead of O.
 */
const LIGATURES: Record<string, string> = {
  'œ': 'oe',
  'æ': 'ae',
  'ß': 'ss',
  'ø': 'o',
  'đ': 'd',
  'ð': 'd',
  'þ': 'th',
  'ł': 'l',
  'ı': 'i',
};

/**
 * Fold accents, ligatures and case: `Águila` → `aguila`, `ç` → `c`,
 * `ñ` → `n`, `œuf` → `oeuf`.
 *
 * Players should never lose a round because they could not reach `é` on
 * a phone keyboard, so accents are informational only.
 */
export function foldDiacritics(input: string): string {
  const stripped = input.normalize('NFD').replace(COMBINING, '').toLowerCase();
  let out = '';
  for (const ch of stripped) out += LIGATURES[ch] ?? ch;
  return out;
}

const HIRAGANA_START = 0x3041; // ぁ
const HIRAGANA_END = 0x3096; // ゖ
const KATAKANA_START = 0x30a1; // ァ
const KATAKANA_END = 0x30f6; // ヶ
const KANA_OFFSET = 0x60; // katakana → hiragana
const PROLONGED_MARK = 'ー'; // ー
const MIDDLE_DOT = '・'; // ・

/** Small kana folded onto their full-size counterparts. */
const SMALL_KANA: Record<string, string> = {
  'ぁ': 'あ', // ぁ → あ
  'ぃ': 'い', // ぃ → い
  'ぅ': 'う', // ぅ → う
  'ぇ': 'え', // ぇ → え
  'ぉ': 'お', // ぉ → お
  'っ': 'つ', // っ → つ
  'ゃ': 'や', // ゃ → や
  'ゅ': 'ゆ', // ゅ → ゆ
  'ょ': 'よ', // ょ → よ
  'ゎ': 'わ', // ゎ → わ
};

/**
 * Fold any Japanese kana text to plain, unvoiced, full-size hiragana.
 *
 * `ギョウザ` → `きようさ`. Aggressive on purpose: the result only ever
 * feeds initial-matching and key comparison, never display.
 */
export function kanaFold(input: string): string {
  const unvoiced = input.normalize('NFD').replace(COMBINING, '');
  let out = '';
  for (const ch of unvoiced) {
    if (ch === PROLONGED_MARK || ch === MIDDLE_DOT) continue;
    const code = ch.codePointAt(0)!;
    const hira =
      code >= KATAKANA_START && code <= KATAKANA_END
        ? String.fromCodePoint(code - KANA_OFFSET)
        : ch;
    out += SMALL_KANA[hira] ?? hira;
  }
  return out;
}

/** Any hiragana or katakana, plus the prolonged-sound mark. */
const KANA_ONLY = /^[ぁ-ゖァ-ヺー・\s]+$/;

/** True when the input contains no kanji, i.e. it is already a reading. */
export function isAllKana(input: string): boolean {
  const trimmed = input.trim();
  return trimmed.length > 0 && KANA_ONLY.test(trimmed);
}

/** True when the character is a hiragana we can map to a kana row. */
export function isHiragana(ch: string): boolean {
  const code = ch.codePointAt(0);
  return code !== undefined && code >= HIRAGANA_START && code <= HIRAGANA_END;
}

/** Collapse whitespace and drop surrounding punctuation. */
export function tidy(input: string): string {
  return input
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'“”«».,!?]+|[\s"'“”«».,!?]+$/g, '')
    .trim();
}

/**
 * Remove a leading article.
 *
 * Articles are matched against the *folded* string so `L'ours`, `l'Ours`
 * and `L’ours` all reduce to `ours`. Only prefixes followed by a space
 * or an apostrophe count, so `lavanda` and `lille` are safe.
 */
export function stripArticle(folded: string, articles: readonly string[]): string {
  const normalised = folded.replace(/[’ʼ]/g, "'");
  for (const article of articles) {
    if (article.endsWith("'")) {
      if (normalised.startsWith(article)) return normalised.slice(article.length).trim();
    } else if (normalised.startsWith(article + ' ')) {
      return normalised.slice(article.length + 1).trim();
    }
  }
  return normalised;
}

/** Everything that is not a Latin letter, digit or hiragana. */
const NON_KEY_CHAR = /[^a-z0-9ぁ-ゖ]/g;

/** Reduce a folded, article-free string to its comparison key. */
export function toKey(folded: string): string {
  return folded.replace(NON_KEY_CHAR, '');
}

/** Levenshtein distance, capped so long mismatches exit early. */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      current.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[b.length];
}

/**
 * How much misspelling to forgive, by key length.
 *
 * Short words get no slack — `oso` and `osa` are different animals.
 */
export function allowedTypos(key: string): number {
  if (key.length >= 9) return 2;
  if (key.length >= 5) return 1;
  return 0;
}
