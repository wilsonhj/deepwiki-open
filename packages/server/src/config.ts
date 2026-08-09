/**
 * Server configuration, all overridable by environment variable.
 *
 * See `docs/SELF_HOSTING.md` for the full list.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

export const config = {
  host: process.env.LEXO_HOST ?? '0.0.0.0',
  port: int('PORT', int('LEXO_PORT', 8080)),

  /** Where the built client lives, relative to `packages/server/dist`. */
  clientDir: process.env.LEXO_CLIENT_DIR ?? path.resolve(here, '../../client/dist'),

  /** Pause between a round ending and the next card, in ms. */
  intermissionMs: int('LEXO_INTERMISSION_MS', 2500),

  /** How long players get to vote on a contested word, in ms. */
  challengeMs: int('LEXO_CHALLENGE_MS', 5000),

  /** Minimum gap between two answers from the same player, in ms. */
  answerCooldownMs: int('LEXO_ANSWER_COOLDOWN_MS', 600),

  /** Guesses a player may burn on one round before it stops listening. */
  maxAttemptsPerRound: int('LEXO_MAX_ATTEMPTS', 6),

  /** How long a disconnected player keeps their seat and score, in ms. */
  reconnectGraceMs: int('LEXO_RECONNECT_GRACE_MS', 120_000),

  /** How long an empty room lingers before it is collected, in ms. */
  emptyRoomTtlMs: int('LEXO_EMPTY_ROOM_TTL_MS', 300_000),

  /** Cap on concurrent rooms, so one host cannot exhaust memory. */
  maxRooms: int('LEXO_MAX_ROOMS', 500),

  /**
   * Optional JSONL file collecting words players voted through that the
   * bank does not know. These are word-bank pull requests waiting to
   * happen. Unset means suggestions are only returned in the summary.
   */
  suggestionsFile: process.env.LEXO_SUGGESTIONS_FILE ?? null,
} as const;

export type Config = typeof config;
