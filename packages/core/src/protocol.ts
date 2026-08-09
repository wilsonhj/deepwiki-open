/**
 * Wire protocol.
 *
 * Types only — no logic — so the server and the client cannot drift.
 * Every timestamp on the wire is server epoch milliseconds; the client
 * corrects for its own clock skew using `serverNow`, and never sends a
 * time the server is expected to trust.
 *
 * See `docs/PROTOCOL.md` for the message flow.
 */

import type {
  Card,
  CategoryId,
  GameSettings,
  Initial,
  RejectionReason,
} from './types.js';

/** A card as players see it: the answer field is stripped. */
export type PublicCard = Omit<Card, 'answerInitialId'>;

export type RoomPhase = 'lobby' | 'round' | 'challenge' | 'intermission' | 'finished';

export type TeamId = 'a' | 'b';

export interface PlayerView {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  ready: boolean;
  isHost: boolean;
  team: TeamId | null;
  /** Mean time to a winning answer, in ms. `null` until they win one. */
  averageMs: number | null;
}

export interface RoomView {
  code: string;
  phase: RoomPhase;
  settings: GameSettings;
  players: PlayerView[];
  hostId: string;
  /** 0-based index of the round in play. */
  roundIndex: number;
  /** Rounds in the whole game — one fewer than the reserve, by rule. */
  roundsTotal: number;
}

export interface RoundView {
  index: number;
  total: number;
  card: PublicCard;
  /**
   * Per-letter reveal offsets in ms, mimicking the physical card being
   * turned over. Purely cosmetic: answers are accepted from `startedAt`.
   */
  revealDelaysMs: number[];
  startedAt: number;
  /** Server time the round expires, or `null` in untimed modes. */
  deadlineAt: number | null;
}

export interface ChallengeView {
  playerId: string;
  playerName: string;
  /** What the player actually typed. */
  word: string;
  deadlineAt: number;
  /** How many players may vote. */
  voters: number;
  accepted: number;
  rejected: number;
}

export type RoundEndReason = 'won' | 'timeout' | 'abandoned';

export interface RoundResult {
  reason: RoundEndReason;
  winnerId: string | null;
  /** The word as it will be shown — the bank spelling when we have one. */
  surface: string | null;
  /** What the player typed, when it differs from `surface`. */
  submitted: string | null;
  category: CategoryId;
  answerInitial: Initial;
  /** Time from round start to the winning answer, in ms. */
  elapsedMs: number | null;
  /** Won by a majority vote rather than by the word bank. */
  byVote: boolean;
  scores: Array<{ playerId: string; score: number }>;
  nextRoundInMs: number;
}

export interface RankingRow {
  playerId: string;
  name: string;
  team: TeamId | null;
  score: number;
  averageMs: number | null;
  bestMs: number | null;
  /** Categories this player won most and least often. */
  strongest: CategoryId | null;
  weakest: CategoryId | null;
}

export interface GameSummary {
  ranking: RankingRow[];
  /** Every word won this game, in order. */
  words: Array<{ category: CategoryId; surface: string; playerId: string | null }>;
  /** Words accepted by vote — candidates for the word bank. */
  suggestions: Array<{ category: CategoryId; word: string; language: string }>;
}

export type ClientMessage =
  /** First message on every connection. No `roomCode` means "create one". */
  | { t: 'hello'; name: string; roomCode?: string; token?: string }
  | { t: 'settings'; settings: GameSettings }
  | { t: 'ready'; ready: boolean }
  | { t: 'start' }
  | { t: 'answer'; word: string }
  | { t: 'vote'; accept: boolean }
  | { t: 'rematch' }
  | { t: 'ping'; at: number };

export type ServerMessage =
  | {
      t: 'welcome';
      you: { id: string; token: string };
      room: RoomView;
      serverNow: number;
    }
  | { t: 'room'; room: RoomView }
  | { t: 'round'; round: RoundView }
  | { t: 'answer:rejected'; reason: RejectionReason; word: string }
  | { t: 'challenge'; challenge: ChallengeView }
  | { t: 'round:end'; result: RoundResult }
  | { t: 'game:end'; summary: GameSummary }
  | { t: 'pong'; at: number; serverNow: number }
  | { t: 'error'; code: ErrorCode; message: string };

export type ErrorCode =
  | 'bad-message'
  | 'room-not-found'
  | 'room-full'
  | 'name-taken'
  | 'not-host'
  | 'already-started'
  | 'not-enough-players'
  | 'too-many-players'
  | 'no-cards'
  | 'rate-limited'
  | 'internal';
