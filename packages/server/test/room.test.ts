/**
 * Room integration tests.
 *
 * These drive the real round loop through fake senders, so they cover
 * the parts a unit test of `validateAnswer` cannot: who wins a race,
 * what a challenge does to the clock, and whether a reconnecting player
 * gets their score back.
 *
 * Timings are shortened via env before the modules load.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  defaultSettings,
  getBank,
  type CategoryId,
  type GameSettings,
  type LanguageId,
  type RoundView,
  type ServerMessage,
} from '@lexo/core';

process.env.LEXO_INTERMISSION_MS = '10';
process.env.LEXO_CHALLENGE_MS = '60';
process.env.LEXO_ANSWER_COOLDOWN_MS = '0';

const { Room } = await import('../src/room.js');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class FakeSender {
  messages: ServerMessage[] = [];
  closed = false;

  send(message: ServerMessage): void {
    this.messages.push(message);
  }

  close(): void {
    this.closed = true;
  }

  last<T extends ServerMessage['t']>(type: T): Extract<ServerMessage, { t: T }> | undefined {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const message = this.messages[i];
      if (message.t === type) return message as Extract<ServerMessage, { t: T }>;
    }
    return undefined;
  }

  all<T extends ServerMessage['t']>(type: T): Array<Extract<ServerMessage, { t: T }>> {
    return this.messages.filter((m): m is Extract<ServerMessage, { t: T }> => m.t === type);
  }

  clear(): void {
    this.messages = [];
  }
}

/** The letter whose colour matches the category — what players must read. */
function answerOf(round: RoundView): string {
  const match = round.card.letters.find((letter) => letter.color === round.card.categoryColor);
  if (!match) throw new Error('card has no matching letter');
  return match.initial.id;
}

/** A word the bank will accept for this round. */
function bankWord(language: LanguageId, category: CategoryId, initialId: string): string {
  const entries = getBank(language).byInitial.get(category)?.get(initialId);
  if (!entries?.length) throw new Error(`no bank word for ${category}/${initialId}`);
  return entries[0].surface;
}

function settings(overrides: Partial<GameSettings> = {}): GameSettings {
  return { ...defaultSettings('es', 'classic'), deckSize: 6, ...overrides };
}

describe('Room', () => {
  let room: InstanceType<typeof Room>;
  let hostSender: FakeSender;
  let guestSender: FakeSender;
  let hostId: string;
  let guestId: string;
  let guestToken: string;

  beforeEach(() => {
    room = new Room('TEST', settings());
    hostSender = new FakeSender();
    guestSender = new FakeSender();

    const host = room.join(hostSender, 'Ana');
    const guest = room.join(guestSender, 'Bruno');
    if ('error' in host || 'error' in guest) throw new Error('join failed');
    hostId = host.playerId;
    guestId = guest.playerId;
    guestToken = guestSender.last('welcome')!.you.token;
  });

  it('makes the first player the host', () => {
    expect(hostSender.last('welcome')!.room.hostId).toBe(hostId);
    expect(hostSender.last('room')!.room.players).toHaveLength(2);
  });

  it('refuses to start for anyone but the host', () => {
    room.handle(guestId, { t: 'start' });
    expect(guestSender.last('error')?.code).toBe('not-host');
    expect(guestSender.last('round')).toBeUndefined();
  });

  it('deals a card to everybody when the host starts', () => {
    room.handle(hostId, { t: 'start' });
    const round = hostSender.last('round')!.round;
    expect(round.card.letters).toHaveLength(3);
    expect(guestSender.last('round')!.round.card.id).toBe(round.card.id);
    // One card of the reserve is never played.
    expect(round.total).toBe(5);
  });

  it('awards the round to the first valid answer', () => {
    room.handle(hostId, { t: 'start' });
    const round = guestSender.last('round')!.round;
    const word = bankWord('es', round.card.category, answerOf(round));

    room.handle(guestId, { t: 'answer', word });

    const result = hostSender.last('round:end')!.result;
    expect(result.reason).toBe('won');
    expect(result.winnerId).toBe(guestId);
    expect(result.scores.find((s) => s.playerId === guestId)!.score).toBe(1);
    expect(result.byVote).toBe(false);
  });

  it('rejects a word under the wrong letter without ending the round', () => {
    room.handle(hostId, { t: 'start' });
    const round = guestSender.last('round')!.round;
    const answer = answerOf(round);
    const wrongInitial = round.card.letters.find((l) => l.initial.id !== answer)!.initial.id;
    const word = bankWord('es', round.card.category, wrongInitial);

    guestSender.clear();
    room.handle(guestId, { t: 'answer', word });

    expect(guestSender.last('answer:rejected')?.reason).toBe('wrong-initial');
    expect(hostSender.last('round:end')).toBeUndefined();
  });

  it('will not award the same word twice in a game', async () => {
    room.handle(hostId, { t: 'start' });
    const round = guestSender.last('round')!.round;
    const word = bankWord('es', round.card.category, answerOf(round));
    room.handle(guestId, { t: 'answer', word });

    await sleep(40); // let the next round start
    guestSender.clear();
    room.handle(guestId, { t: 'answer', word });
    expect(guestSender.last('answer:rejected')?.reason).toMatch(/already-used|wrong-initial/);
  });

  it('puts an unknown word to a vote and awards it on a yes', async () => {
    room.handle(hostId, { t: 'start' });
    const round = guestSender.last('round')!.round;
    const initial = answerOf(round);
    // A word the bank will not have, but with the right initial.
    const invented = `${initial}rquibaldo`;

    room.handle(guestId, { t: 'answer', word: invented });
    const challenge = hostSender.last('challenge')!.challenge;
    expect(challenge.word).toBe(invented);
    expect(challenge.playerId).toBe(guestId);
    expect(challenge.voters).toBe(1);

    room.handle(hostId, { t: 'vote', accept: true });

    const result = hostSender.last('round:end')!.result;
    expect(result.winnerId).toBe(guestId);
    expect(result.byVote).toBe(true);
    expect(room.takeSuggestions()).toHaveLength(1);
  });

  it('rejects a contested word on a no, and hands the round back', async () => {
    room.handle(hostId, { t: 'start' });
    const round = guestSender.last('round')!.round;
    const invented = `${answerOf(round)}rquibaldo`;

    guestSender.clear();
    room.handle(guestId, { t: 'answer', word: invented });
    room.handle(hostId, { t: 'vote', accept: false });

    expect(guestSender.last('answer:rejected')?.reason).toBe('unknown-word');
    expect(hostSender.last('round:end')).toBeUndefined();
    expect(hostSender.last('room')!.room.phase).toBe('round');
  });

  it('rejects a contested word when nobody votes at all', async () => {
    room.handle(hostId, { t: 'start' });
    const round = guestSender.last('round')!.round;
    const invented = `${answerOf(round)}rquibaldo`;

    guestSender.clear();
    room.handle(guestId, { t: 'answer', word: invented });
    await sleep(90); // let the vote expire

    expect(guestSender.last('answer:rejected')?.reason).toBe('unknown-word');
  });

  it('gives a reconnecting player their seat and score back', () => {
    room.handle(hostId, { t: 'start' });
    const round = guestSender.last('round')!.round;
    room.handle(guestId, { t: 'answer', word: bankWord('es', round.card.category, answerOf(round)) });

    room.detach(guestId);
    expect(hostSender.last('room')!.room.players.find((p) => p.id === guestId)!.connected).toBe(
      false,
    );

    const rejoinSender = new FakeSender();
    const rejoined = room.join(rejoinSender, 'Bruno', guestToken);
    if ('error' in rejoined) throw new Error('rejoin failed');

    expect(rejoined.playerId).toBe(guestId);
    const me = rejoinSender.last('welcome')!.room.players.find((p) => p.id === guestId)!;
    expect(me.score).toBe(1);
    expect(me.connected).toBe(true);
  });

  it('ends the game after deckSize - 1 rounds and ranks the players', async () => {
    room.handle(hostId, { t: 'start' });

    for (let played = 0; played < 5; played++) {
      const round = hostSender.last('round')!.round;
      room.handle(guestId, {
        t: 'answer',
        word: bankWord('es', round.card.category, answerOf(round)),
      });
      await sleep(30);
    }

    const summary = hostSender.last('game:end')!.summary;
    expect(summary.ranking[0].playerId).toBe(guestId);
    expect(summary.ranking[0].score).toBe(5);
    expect(summary.words).toHaveLength(5);
    expect(hostSender.last('room')!.room.phase).toBe('finished');
  });

  it('does not start a mode that needs more players than it has', () => {
    const solo = new Room('SOLO', settings({ mode: 'teams' }));
    const sender = new FakeSender();
    const joined = solo.join(sender, 'Ana');
    if ('error' in joined) throw new Error('join failed');

    solo.handle(joined.playerId, { t: 'start' });
    expect(sender.last('error')?.code).toBe('not-enough-players');
    solo.dispose();
  });
});
