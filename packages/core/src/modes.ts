/**
 * Game modes.
 *
 * A mode is nothing but a named bundle of settings — the round loop is
 * identical in all of them. Keeping it that way means a new mode costs
 * one entry here instead of a branch in the server.
 */

import type { CategoryId, GameModeId, GameSettings, LanguageId } from './types.js';
import { CATEGORY_IDS } from './types.js';
import { SIMPLE_CATEGORY_IDS } from './categories.js';
import { DEFAULT_DECK_SIZE } from './deck.js';

export interface ModeDef {
  id: GameModeId;
  label: Record<LanguageId | 'en', string>;
  blurb: Record<LanguageId | 'en', string>;
  minPlayers: number;
  maxPlayers: number;
  /** Players are grouped into two teams; one answer per team per round. */
  teams: boolean;
  defaults: Omit<GameSettings, 'language' | 'mode'>;
}

const allCategories = (): CategoryId[] => [...CATEGORY_IDS];

export const MODES: Record<GameModeId, ModeDef> = {
  classic: {
    id: 'classic',
    label: { es: 'Clásico', fr: 'Classique', pt: 'Clássico', ja: 'クラシック', en: 'Classic' },
    blurb: {
      es: 'Sin cronómetro. La ronda dura hasta que alguien acierta.',
      fr: 'Sans chrono. La manche dure jusqu’à ce que quelqu’un trouve.',
      pt: 'Sem cronômetro. A rodada dura até alguém acertar.',
      ja: '制限時間なし。誰かが正解するまで続きます。',
      en: 'No clock. The round runs until somebody lands it.',
    },
    minPlayers: 2,
    maxPlayers: 6,
    teams: false,
    defaults: {
      categories: allCategories(),
      deckSize: DEFAULT_DECK_SIZE,
      roundSeconds: null,
      allowRepeats: false,
      allowChallenges: true,
    },
  },
  chrono: {
    id: 'chrono',
    label: { es: 'Contrarreloj', fr: 'Chrono', pt: 'Cronômetro', ja: 'タイムアタック', en: 'Chrono' },
    blurb: {
      es: '20 segundos por ronda. Si nadie responde, la carta se descarta.',
      fr: '20 secondes par manche. Sans réponse, la carte est écartée.',
      pt: '20 segundos por rodada. Sem resposta, a carta é descartada.',
      ja: '1ラウンド20秒。誰も答えられなければカードは捨て札に。',
      en: '20 seconds a round. Nobody answers, the card is discarded.',
    },
    minPlayers: 2,
    maxPlayers: 6,
    teams: false,
    defaults: {
      categories: allCategories(),
      deckSize: DEFAULT_DECK_SIZE,
      roundSeconds: 20,
      allowRepeats: false,
      allowChallenges: true,
    },
  },
  kids: {
    id: 'kids',
    label: { es: 'Peques', fr: 'Enfants', pt: 'Crianças', ja: 'キッズ', en: 'Kids' },
    blurb: {
      es: 'Categorías sencillas, sin reloj y se pueden repetir palabras.',
      fr: 'Catégories simples, sans horloge, mots réutilisables.',
      pt: 'Categorias simples, sem relógio e palavras podem repetir.',
      ja: 'やさしいカテゴリー、制限時間なし、同じことばも何回でもOK。',
      en: 'Simple categories, no clock, words may be reused.',
    },
    minPlayers: 2,
    maxPlayers: 6,
    teams: false,
    defaults: {
      categories: [...SIMPLE_CATEGORY_IDS],
      deckSize: 20,
      roundSeconds: null,
      allowRepeats: true,
      allowChallenges: true,
    },
  },
  teams: {
    id: 'teams',
    label: { es: 'Equipos', fr: 'Équipes', pt: 'Times', ja: 'チーム戦', en: 'Teams' },
    blurb: {
      es: 'Dos equipos. Sólo cuenta la primera respuesta de cada equipo.',
      fr: 'Deux équipes. Seule la première réponse de chaque équipe compte.',
      pt: 'Dois times. Só vale a primeira resposta de cada time.',
      ja: '2チーム対戦。各チーム最初の回答だけが有効です。',
      en: 'Two teams. Only each team’s first answer counts.',
    },
    minPlayers: 4,
    maxPlayers: 6,
    teams: true,
    defaults: {
      categories: allCategories(),
      deckSize: DEFAULT_DECK_SIZE,
      roundSeconds: 20,
      allowRepeats: false,
      allowChallenges: true,
    },
  },
  solo: {
    id: 'solo',
    label: {
      es: 'Solo',
      fr: 'Entraînement',
      pt: 'Treino',
      ja: 'ひとり練習',
      en: 'Solo practice',
    },
    blurb: {
      es: 'Tú contra el reloj. Sólo valen palabras del diccionario del juego.',
      fr: 'Toi contre la montre. Seuls les mots du dictionnaire comptent.',
      pt: 'Você contra o relógio. Só valem palavras do dicionário do jogo.',
      ja: '時間との勝負。辞書に載っていることばだけが有効です。',
      en: 'You against the clock. Only words in the game’s bank count.',
    },
    minPlayers: 1,
    maxPlayers: 1,
    teams: false,
    defaults: {
      categories: allCategories(),
      deckSize: 20,
      roundSeconds: 15,
      allowRepeats: false,
      // Nobody is around to vote, so an unknown word cannot be judged.
      allowChallenges: false,
    },
  },
};

/** Settings for a fresh game, before the host changes anything. */
export function defaultSettings(language: LanguageId, mode: GameModeId): GameSettings {
  return { language, mode, ...MODES[mode].defaults, categories: [...MODES[mode].defaults.categories] };
}

/**
 * Force a settings object back inside the rules of its mode.
 *
 * The host UI is free to send anything; this is what the server trusts.
 */
export function normaliseSettings(settings: GameSettings): GameSettings {
  const mode = MODES[settings.mode] ?? MODES.classic;
  const categories = settings.categories.filter((id) => CATEGORY_IDS.includes(id));

  return {
    language: settings.language,
    mode: mode.id,
    categories: categories.length > 0 ? categories : [...mode.defaults.categories],
    deckSize: clamp(Math.round(settings.deckSize), 5, 120),
    roundSeconds:
      settings.roundSeconds === null ? null : clamp(Math.round(settings.roundSeconds), 5, 60),
    allowRepeats: Boolean(settings.allowRepeats),
    allowChallenges: mode.id === 'solo' ? false : Boolean(settings.allowChallenges),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
