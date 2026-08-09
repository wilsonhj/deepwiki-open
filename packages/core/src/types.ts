/**
 * Core domain types shared by the Lexo server and client.
 *
 * Everything in `@lexo/core` is pure and dependency-free so it can run
 * unchanged in Node (authoritative validation) and in the browser
 * (optimistic UI, offline solo play).
 */

/** Languages a game can be played in. */
export type LanguageId = 'es' | 'fr' | 'pt' | 'ja';

export const LANGUAGE_IDS: readonly LanguageId[] = ['es', 'fr', 'pt', 'ja'];

/** Word categories a round can ask for. */
export type CategoryId =
  | 'animal'
  | 'country'
  | 'city'
  | 'food'
  | 'object'
  | 'profession'
  | 'plant'
  | 'name';

export const CATEGORY_IDS: readonly CategoryId[] = [
  'animal',
  'country',
  'city',
  'food',
  'object',
  'profession',
  'plant',
  'name',
];

/**
 * The three card colours. Each colour is always paired with a distinct
 * shape so the game stays playable without colour perception.
 */
export type ColorId = 'azure' | 'amber' | 'magenta';

export const COLOR_IDS: readonly ColorId[] = ['azure', 'amber', 'magenta'];

/** Shape paired with each colour (accessibility: never colour alone). */
export const COLOR_SHAPES: Record<ColorId, 'circle' | 'triangle' | 'square'> = {
  azure: 'circle',
  amber: 'triangle',
  magenta: 'square',
};

export type GameModeId = 'classic' | 'chrono' | 'kids' | 'teams' | 'solo';

export const GAME_MODE_IDS: readonly GameModeId[] = [
  'classic',
  'chrono',
  'kids',
  'teams',
  'solo',
];

/**
 * An "initial" a word must start with.
 *
 * For Latin-script languages this is a single letter (`id: 'a'`). For
 * Japanese it is a kana row (`id: 'ka'`, `display: 'か行'`) because a
 * single kana is far too narrow a constraint to be fun. See
 * `docs/LANGUAGES.md`.
 */
export interface Initial {
  /** Stable machine id, unique per language. */
  id: string;
  /** What the player sees on the card. */
  display: string;
  /** Optional expansion, e.g. the five kana of a row. */
  hint?: string;
}

/** One entry in a word bank. */
export interface BankEntry {
  /** Surface form as a player would write it, e.g. `犬` or `águila`. */
  surface: string;
  /**
   * Reading used for initial matching. Equal to `surface` for Latin
   * scripts; kana for Japanese.
   */
  reading: string;
  /** Normalised reading, used as the lookup/uniqueness key. */
  key: string;
  /** Id of the initial this entry satisfies. */
  initialId: string;
}

/**
 * Raw, contributor-facing bank shape.
 *
 * Each string is either `"word"` or `"surface|reading"`. The second form
 * is required for Japanese and optional elsewhere (useful when the
 * written form and the spoken form disagree).
 */
export type RawBank = Partial<Record<CategoryId, string[]>>;

/** A single card in the reserve. */
export interface Card {
  id: string;
  category: CategoryId;
  /** Colour of the category — the colour players must match. */
  categoryColor: ColorId;
  /** Always three, in display order. Exactly one has `categoryColor`. */
  letters: Array<{ initial: Initial; color: ColorId }>;
  /** Id of the initial that actually counts this round. */
  answerInitialId: string;
}

export interface GameSettings {
  language: LanguageId;
  mode: GameModeId;
  categories: CategoryId[];
  /** Number of cards in the reserve (the last one is never scored). */
  deckSize: number;
  /** Round time limit in seconds; `null` means no limit. */
  roundSeconds: number | null;
  /** When true a word may be reused across the game. */
  allowRepeats: boolean;
  /** When true unknown words open a 5s vote instead of being rejected. */
  allowChallenges: boolean;
}

export type RejectionReason =
  | 'empty'
  | 'wrong-initial'
  | 'already-used'
  | 'unknown-word'
  | 'round-closed'
  | 'needs-reading';

export type ValidationOutcome =
  /** Found in the bank and clean — award immediately. */
  | { status: 'accepted'; entry: BankEntry; key: string; corrected: boolean }
  /** Initial is right but the word is not in the bank — put it to a vote. */
  | { status: 'challenge'; key: string; reading: string }
  | { status: 'rejected'; reason: RejectionReason; key: string };
