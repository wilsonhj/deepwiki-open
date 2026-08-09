/**
 * A room: the whole game, for one group of players.
 *
 * This class is the authority. It owns the reserve, the clock and the
 * scores, and it is the only place an answer is adjudicated. It knows
 * nothing about WebSockets — players arrive holding a `Sender`, which
 * makes the entire round loop testable without a socket in sight.
 *
 * Timing rule: an answer is stamped the moment this class sees it, never
 * from anything the client sent. Two players on different connections
 * are therefore ranked by when their packet reached the server, which is
 * the fairest thing a server can do without measuring every player's
 * latency. `docs/ARCHITECTURE.md` covers what that does and does not
 * guarantee.
 */

import {
  buildDeck,
  EmptyDeckError,
  findInitial,
  getBank,
  getLanguage,
  MODES,
  normaliseSettings,
  publicCard,
  randomSeed,
  type Card,
  type CategoryId,
  type ChallengeView,
  type ClientMessage,
  type ErrorCode,
  type GameSettings,
  type GameSummary,
  type PlayerView,
  type RankingRow,
  type RoomPhase,
  type RoomView,
  type RoundResult,
  type ServerMessage,
  type TeamId,
  validateAnswer,
} from '@lexo/core';
import { config } from './config.js';

export interface Sender {
  send(message: ServerMessage): void;
  close(): void;
}

interface Win {
  ms: number;
  category: CategoryId;
}

interface Player {
  id: string;
  token: string;
  name: string;
  score: number;
  ready: boolean;
  team: TeamId | null;
  sender: Sender | null;
  wins: Win[];
  lastAnswerAt: number;
  disconnectedAt: number | null;
}

interface ActiveRound {
  card: Card;
  startedAt: number;
  deadlineAt: number | null;
  timer: NodeJS.Timeout | null;
  /** Teams that have already used their single answer this round. */
  answeredTeams: Set<TeamId>;
  attempts: Map<string, number>;
}

interface ActiveChallenge {
  playerId: string;
  word: string;
  key: string;
  elapsedMs: number;
  deadlineAt: number;
  timer: NodeJS.Timeout;
  votes: Map<string, boolean>;
  /** Round time left when the challenge paused the clock. */
  pausedRemainingMs: number | null;
}

const CODE_ALPHABET = 'ACDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_NAME_LENGTH = 16;
const MAX_WORD_LENGTH = 48;

export function makeRoomCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

/** Trim, collapse and cap a display name; never let it be empty. */
function cleanName(raw: unknown): string {
  const text = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  const capped = text.slice(0, MAX_NAME_LENGTH);
  return capped || 'Anon';
}

export class Room {
  readonly code: string;
  readonly createdAt = Date.now();

  private players = new Map<string, Player>();
  private byToken = new Map<string, string>();
  private order: string[] = [];
  private hostId = '';

  private settings: GameSettings;
  private phase: RoomPhase = 'lobby';
  private deck: Card[] = [];
  private roundIndex = 0;
  private usedKeys = new Set<string>();
  private round: ActiveRound | null = null;
  private challenge: ActiveChallenge | null = null;
  private intermissionTimer: NodeJS.Timeout | null = null;
  private wordLog: GameSummary['words'] = [];
  private suggestions: GameSummary['suggestions'] = [];

  emptySince: number | null = Date.now();

  constructor(code: string, settings: GameSettings) {
    this.code = code;
    this.settings = normaliseSettings(settings);
  }

  // ---------------------------------------------------------------- state

  get isEmpty(): boolean {
    for (const player of this.players.values()) {
      if (player.sender) return false;
    }
    return true;
  }

  get roundsTotal(): number {
    // The last card of the reserve is never played, exactly as in the
    // physical game.
    return Math.max(0, this.deck.length - 1);
  }

  private view(): RoomView {
    return {
      code: this.code,
      phase: this.phase,
      settings: this.settings,
      players: this.order
        .map((id) => this.players.get(id))
        .filter((player): player is Player => Boolean(player))
        .map((player) => this.playerView(player)),
      hostId: this.hostId,
      roundIndex: this.roundIndex,
      roundsTotal: this.roundsTotal,
    };
  }

  private playerView(player: Player): PlayerView {
    const times = player.wins.map((win) => win.ms);
    return {
      id: player.id,
      name: player.name,
      score: player.score,
      connected: player.sender !== null,
      ready: player.ready,
      isHost: player.id === this.hostId,
      team: player.team,
      averageMs: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
    };
  }

  // ---------------------------------------------------------------- joining

  join(sender: Sender, name: unknown, token?: string): { playerId: string } | { error: ErrorCode } {
    const existingId = token ? this.byToken.get(token) : undefined;
    const returning = existingId ? this.players.get(existingId) : undefined;

    if (returning) {
      returning.sender?.close();
      returning.sender = sender;
      returning.disconnectedAt = null;
      this.emptySince = null;
      this.send(returning, {
        t: 'welcome',
        you: { id: returning.id, token: returning.token },
        room: this.view(),
        serverNow: Date.now(),
      });
      this.broadcastRoom();
      this.resendCurrentRound(returning);
      return { playerId: returning.id };
    }

    const mode = MODES[this.settings.mode];
    if (this.players.size >= mode.maxPlayers) return { error: 'room-full' };
    if (this.phase !== 'lobby' && this.phase !== 'finished') return { error: 'already-started' };

    const player: Player = {
      id: makeId('p'),
      token: makeId('t'),
      name: this.uniqueName(cleanName(name)),
      score: 0,
      ready: false,
      team: null,
      sender,
      wins: [],
      lastAnswerAt: 0,
      disconnectedAt: null,
    };

    this.players.set(player.id, player);
    this.byToken.set(player.token, player.id);
    this.order.push(player.id);
    if (!this.hostId) this.hostId = player.id;
    this.emptySince = null;

    this.send(player, {
      t: 'welcome',
      you: { id: player.id, token: player.token },
      room: this.view(),
      serverNow: Date.now(),
    });
    this.broadcastRoom();
    return { playerId: player.id };
  }

  private uniqueName(name: string): string {
    const taken = new Set(Array.from(this.players.values(), (player) => player.name));
    if (!taken.has(name)) return name;
    for (let suffix = 2; suffix < 100; suffix++) {
      const candidate = `${name} ${suffix}`;
      if (!taken.has(candidate)) return candidate;
    }
    return `${name} ${Math.floor(Math.random() * 1000)}`;
  }

  /** A reconnecting player needs the card back, not just the scoreboard. */
  private resendCurrentRound(player: Player): void {
    if (this.phase === 'round' && this.round) {
      this.send(player, { t: 'round', round: this.roundView(this.round) });
    }
    if (this.phase === 'challenge' && this.challenge) {
      this.send(player, { t: 'challenge', challenge: this.challengeView(this.challenge) });
    }
  }

  detach(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.sender = null;
    player.disconnectedAt = Date.now();
    player.ready = false;

    // The host badge follows the first still-connected player so a
    // dropped host cannot strand everyone else in the lobby.
    if (this.hostId === playerId) {
      const heir = this.order.find((id) => this.players.get(id)?.sender);
      if (heir) this.hostId = heir;
    }
    if (this.isEmpty) this.emptySince = Date.now();
    this.broadcastRoom();
  }

  /** Drop seats whose grace period has expired. Called by the sweeper. */
  prune(now: number): void {
    if (this.phase === 'round' || this.phase === 'challenge') return;
    for (const [id, player] of this.players) {
      if (player.sender) continue;
      if (player.disconnectedAt && now - player.disconnectedAt > config.reconnectGraceMs) {
        this.players.delete(id);
        this.byToken.delete(player.token);
        this.order = this.order.filter((other) => other !== id);
        if (this.hostId === id) this.hostId = this.order[0] ?? '';
      }
    }
  }

  // ---------------------------------------------------------------- messages

  handle(playerId: string, message: ClientMessage): void {
    const player = this.players.get(playerId);
    if (!player) return;

    switch (message.t) {
      case 'ping':
        this.send(player, { t: 'pong', at: message.at, serverNow: Date.now() });
        return;
      case 'settings':
        this.updateSettings(player, message.settings);
        return;
      case 'ready':
        player.ready = Boolean(message.ready);
        this.broadcastRoom();
        return;
      case 'start':
        this.start(player);
        return;
      case 'answer':
        this.submit(player, message.word);
        return;
      case 'vote':
        this.vote(player, Boolean(message.accept));
        return;
      case 'rematch':
        this.rematch(player);
        return;
      default:
        this.send(player, { t: 'error', code: 'bad-message', message: 'Unknown message type.' });
    }
  }

  private updateSettings(player: Player, settings: GameSettings): void {
    if (player.id !== this.hostId) {
      this.send(player, { t: 'error', code: 'not-host', message: 'Only the host can do that.' });
      return;
    }
    if (this.phase !== 'lobby' && this.phase !== 'finished') {
      this.send(player, {
        t: 'error',
        code: 'already-started',
        message: 'The game is already running.',
      });
      return;
    }
    this.settings = normaliseSettings(settings);
    this.broadcastRoom();
  }

  private start(player: Player): void {
    if (player.id !== this.hostId) {
      this.send(player, { t: 'error', code: 'not-host', message: 'Only the host can start.' });
      return;
    }
    if (this.phase === 'round' || this.phase === 'challenge' || this.phase === 'intermission') {
      this.send(player, { t: 'error', code: 'already-started', message: 'Already playing.' });
      return;
    }

    const mode = MODES[this.settings.mode];
    const seated = this.order.filter((id) => this.players.get(id)?.sender);
    if (seated.length < mode.minPlayers) {
      this.send(player, {
        t: 'error',
        code: 'not-enough-players',
        message: `This mode needs at least ${mode.minPlayers} players.`,
      });
      return;
    }
    if (seated.length > mode.maxPlayers) {
      this.send(player, {
        t: 'error',
        code: 'too-many-players',
        message: `This mode allows at most ${mode.maxPlayers} players.`,
      });
      return;
    }

    try {
      this.deck = buildDeck({
        bank: getBank(this.settings.language),
        languageId: this.settings.language,
        categories: this.settings.categories,
        size: this.settings.deckSize,
        seed: randomSeed(),
      });
    } catch (error) {
      const message =
        error instanceof EmptyDeckError
          ? error.message
          : 'Could not build a reserve from those settings.';
      this.send(player, { t: 'error', code: 'no-cards', message });
      return;
    }

    for (const [index, id] of seated.entries()) {
      const seatedPlayer = this.players.get(id)!;
      seatedPlayer.score = 0;
      seatedPlayer.wins = [];
      seatedPlayer.team = mode.teams ? (index % 2 === 0 ? 'a' : 'b') : null;
    }

    this.usedKeys.clear();
    this.wordLog = [];
    this.suggestions = [];
    this.roundIndex = 0;
    this.startRound();
  }

  private rematch(player: Player): void {
    if (this.phase !== 'finished') return;
    if (player.id !== this.hostId) {
      this.send(player, { t: 'error', code: 'not-host', message: 'Only the host can restart.' });
      return;
    }
    this.phase = 'lobby';
    for (const seated of this.players.values()) seated.ready = false;
    this.broadcastRoom();
  }

  // ---------------------------------------------------------------- rounds

  private startRound(): void {
    this.clearTimers();
    const card = this.deck[this.roundIndex];
    if (!card || this.roundIndex >= this.roundsTotal) {
      this.finish();
      return;
    }

    const startedAt = Date.now();
    const deadlineAt = this.settings.roundSeconds
      ? startedAt + this.settings.roundSeconds * 1000
      : null;

    this.phase = 'round';
    this.round = {
      card,
      startedAt,
      deadlineAt,
      timer: null,
      answeredTeams: new Set(),
      attempts: new Map(),
    };

    if (deadlineAt) {
      this.round.timer = setTimeout(() => this.timeout(), deadlineAt - startedAt);
    }

    this.broadcast({ t: 'round', round: this.roundView(this.round) });
    this.broadcastRoom();
  }

  private roundView(round: ActiveRound) {
    return {
      index: this.roundIndex,
      total: this.roundsTotal,
      card: publicCard(round.card),
      // Staggered like a card being turned over. Cosmetic only: the
      // round is already live at `startedAt`.
      revealDelaysMs: [0, 220, 440],
      startedAt: round.startedAt,
      deadlineAt: round.deadlineAt,
    };
  }

  private timeout(): void {
    if (this.phase !== 'round' || !this.round) return;
    this.endRound({
      reason: 'timeout',
      winnerId: null,
      surface: null,
      submitted: null,
      elapsedMs: null,
      byVote: false,
    });
  }

  private submit(player: Player, rawWord: unknown): void {
    const word = typeof rawWord === 'string' ? rawWord.slice(0, MAX_WORD_LENGTH) : '';

    if (this.phase !== 'round' || !this.round) {
      this.send(player, { t: 'answer:rejected', reason: 'round-closed', word });
      return;
    }

    const now = Date.now();
    if (now - player.lastAnswerAt < config.answerCooldownMs) {
      this.send(player, {
        t: 'error',
        code: 'rate-limited',
        message: 'Slow down a moment.',
      });
      return;
    }

    const attempts = this.round.attempts.get(player.id) ?? 0;
    if (attempts >= config.maxAttemptsPerRound) {
      this.send(player, { t: 'answer:rejected', reason: 'round-closed', word });
      return;
    }

    // In team mode a team gets one shot per round — a wrong guess costs
    // it, which is what makes buzzing in a decision.
    if (player.team && this.round.answeredTeams.has(player.team)) {
      this.send(player, { t: 'answer:rejected', reason: 'round-closed', word });
      return;
    }

    player.lastAnswerAt = now;
    this.round.attempts.set(player.id, attempts + 1);

    const language = getLanguage(this.settings.language);
    const voters = this.connected().filter((other) => other.id !== player.id).length;
    const outcome = validateAnswer(
      {
        language,
        bank: getBank(this.settings.language),
        category: this.round.card.category,
        expectedInitialId: this.round.card.answerInitialId,
        usedKeys: this.usedKeys,
        allowRepeats: this.settings.allowRepeats,
        allowChallenges: this.settings.allowChallenges && voters > 0,
      },
      word,
    );

    if (outcome.status !== 'rejected' || outcome.reason !== 'empty') {
      if (player.team) this.round.answeredTeams.add(player.team);
    }

    const elapsedMs = now - this.round.startedAt;

    switch (outcome.status) {
      case 'accepted':
        this.award(player, outcome.entry.surface, word, outcome.key, elapsedMs, false);
        return;
      case 'challenge':
        this.openChallenge(player, word, outcome.key, elapsedMs);
        return;
      case 'rejected':
        this.send(player, { t: 'answer:rejected', reason: outcome.reason, word });
        return;
    }
  }

  private award(
    player: Player,
    surface: string,
    submitted: string,
    key: string,
    elapsedMs: number,
    byVote: boolean,
  ): void {
    if (!this.round) return;
    player.score += 1;
    player.wins.push({ ms: elapsedMs, category: this.round.card.category });
    if (!this.settings.allowRepeats) this.usedKeys.add(key);
    this.wordLog.push({
      category: this.round.card.category,
      surface,
      playerId: player.id,
    });

    this.endRound({
      reason: 'won',
      winnerId: player.id,
      surface,
      submitted: submitted === surface ? null : submitted,
      elapsedMs,
      byVote,
    });
  }

  private endRound(
    partial: Pick<
      RoundResult,
      'reason' | 'winnerId' | 'surface' | 'submitted' | 'elapsedMs' | 'byVote'
    >,
  ): void {
    if (!this.round) return;
    const card = this.round.card;
    this.clearTimers();
    this.phase = 'intermission';

    const language = getLanguage(this.settings.language);
    const result: RoundResult = {
      ...partial,
      category: card.category,
      answerInitial: findInitial(language, card.answerInitialId) ?? {
        id: card.answerInitialId,
        display: card.answerInitialId.toUpperCase(),
      },
      scores: this.order
        .map((id) => this.players.get(id))
        .filter((player): player is Player => Boolean(player))
        .map((player) => ({ playerId: player.id, score: player.score })),
      nextRoundInMs: config.intermissionMs,
    };

    this.round = null;
    this.challenge = null;
    this.broadcast({ t: 'round:end', result });
    this.broadcastRoom();

    this.intermissionTimer = setTimeout(() => {
      this.roundIndex += 1;
      this.startRound();
    }, config.intermissionMs);
  }

  // ------------------------------------------------------------- challenges

  private openChallenge(player: Player, word: string, key: string, elapsedMs: number): void {
    if (!this.round) return;
    const voters = this.connected().filter((other) => other.id !== player.id);
    if (voters.length === 0) {
      this.send(player, { t: 'answer:rejected', reason: 'unknown-word', word });
      return;
    }

    // Freeze whatever is left of the round clock; arguing about a word
    // should not cost the other players their time.
    const pausedRemainingMs = this.round.deadlineAt
      ? Math.max(0, this.round.deadlineAt - Date.now())
      : null;
    if (this.round.timer) {
      clearTimeout(this.round.timer);
      this.round.timer = null;
    }

    this.phase = 'challenge';
    const deadlineAt = Date.now() + config.challengeMs;
    this.challenge = {
      playerId: player.id,
      word,
      key,
      elapsedMs,
      deadlineAt,
      timer: setTimeout(() => this.resolveChallenge(), config.challengeMs),
      votes: new Map(),
      pausedRemainingMs,
    };

    this.broadcast({ t: 'challenge', challenge: this.challengeView(this.challenge) });
    this.broadcastRoom();
  }

  private challengeView(challenge: ActiveChallenge): ChallengeView {
    let accepted = 0;
    let rejected = 0;
    for (const vote of challenge.votes.values()) {
      if (vote) accepted++;
      else rejected++;
    }
    return {
      playerId: challenge.playerId,
      playerName: this.players.get(challenge.playerId)?.name ?? '?',
      word: challenge.word,
      deadlineAt: challenge.deadlineAt,
      voters: this.connected().filter((player) => player.id !== challenge.playerId).length,
      accepted,
      rejected,
    };
  }

  private vote(player: Player, accept: boolean): void {
    const challenge = this.challenge;
    if (this.phase !== 'challenge' || !challenge) return;
    if (player.id === challenge.playerId) return;

    challenge.votes.set(player.id, accept);
    this.broadcast({ t: 'challenge', challenge: this.challengeView(challenge) });

    const voters = this.connected().filter((other) => other.id !== challenge.playerId).length;
    if (challenge.votes.size >= voters) this.resolveChallenge();
  }

  private resolveChallenge(): void {
    const challenge = this.challenge;
    if (!challenge) return;
    clearTimeout(challenge.timer);
    this.challenge = null;

    let accepted = 0;
    let rejected = 0;
    for (const vote of challenge.votes.values()) {
      if (vote) accepted++;
      else rejected++;
    }

    const player = this.players.get(challenge.playerId);
    // A tie rejects: the burden is on the word to convince the table.
    if (player && accepted > rejected) {
      this.suggestions.push({
        category: this.round?.card.category ?? 'animal',
        word: challenge.word,
        language: this.settings.language,
      });
      this.award(player, challenge.word, challenge.word, challenge.key, challenge.elapsedMs, true);
      return;
    }

    if (player) {
      this.send(player, { t: 'answer:rejected', reason: 'unknown-word', word: challenge.word });
    }

    // Hand the round back with the clock where it stopped.
    if (this.round) {
      this.phase = 'round';
      if (challenge.pausedRemainingMs !== null) {
        this.round.deadlineAt = Date.now() + challenge.pausedRemainingMs;
        this.round.timer = setTimeout(() => this.timeout(), challenge.pausedRemainingMs);
      }
      this.broadcast({ t: 'round', round: this.roundView(this.round) });
      this.broadcastRoom();
    } else {
      this.startRound();
    }
  }

  // ---------------------------------------------------------------- ending

  private finish(): void {
    this.clearTimers();
    this.phase = 'finished';
    this.round = null;
    this.challenge = null;
    this.broadcast({ t: 'game:end', summary: this.summary() });
    this.broadcastRoom();
  }

  private summary(): GameSummary {
    const ranking: RankingRow[] = this.order
      .map((id) => this.players.get(id))
      .filter((player): player is Player => Boolean(player))
      .map((player) => {
        const times = player.wins.map((win) => win.ms);
        const perCategory = new Map<CategoryId, number>();
        for (const win of player.wins) {
          perCategory.set(win.category, (perCategory.get(win.category) ?? 0) + 1);
        }
        const sorted = [...perCategory.entries()].sort((a, b) => b[1] - a[1]);
        const played = new Set(this.settings.categories);
        const unwon = [...played].filter((category) => !perCategory.has(category));

        return {
          playerId: player.id,
          name: player.name,
          team: player.team,
          score: player.score,
          averageMs: times.length
            ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
            : null,
          bestMs: times.length ? Math.min(...times) : null,
          strongest: sorted[0]?.[0] ?? null,
          weakest: unwon[0] ?? sorted.at(-1)?.[0] ?? null,
        };
      })
      .sort((a, b) => b.score - a.score || (a.averageMs ?? Infinity) - (b.averageMs ?? Infinity));

    return { ranking, words: this.wordLog, suggestions: this.suggestions };
  }

  /** Words voted through this game — the word bank's inbox. */
  takeSuggestions(): GameSummary['suggestions'] {
    return this.suggestions;
  }

  // ---------------------------------------------------------------- plumbing

  private connected(): Player[] {
    return this.order
      .map((id) => this.players.get(id))
      .filter((player): player is Player => Boolean(player?.sender));
  }

  private send(player: Player, message: ServerMessage): void {
    player.sender?.send(message);
  }

  private broadcast(message: ServerMessage): void {
    for (const player of this.players.values()) player.sender?.send(message);
  }

  private broadcastRoom(): void {
    this.broadcast({ t: 'room', room: this.view() });
  }

  private clearTimers(): void {
    if (this.round?.timer) clearTimeout(this.round.timer);
    if (this.challenge) clearTimeout(this.challenge.timer);
    if (this.intermissionTimer) clearTimeout(this.intermissionTimer);
    this.intermissionTimer = null;
  }

  /** Release every timer; called when the room is collected. */
  dispose(): void {
    this.clearTimers();
    for (const player of this.players.values()) player.sender?.close();
    this.players.clear();
    this.byToken.clear();
    this.order = [];
  }
}
