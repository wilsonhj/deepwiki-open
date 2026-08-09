#!/usr/bin/env node
/**
 * End-to-end smoke test.
 *
 * Boots the real server, opens two real WebSockets, and plays a whole
 * game through the wire protocol. The unit tests drive `Room` directly;
 * this is the one that would catch a broken handshake, a message that
 * does not survive JSON, or a client that can never join.
 *
 *   npm run build && node scripts/smoke.mjs
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getBank } from '../packages/core/dist/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SMOKE_PORT ?? 8199);
const BASE = `http://127.0.0.1:${PORT}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

class Client {
  constructor(name) {
    this.name = name;
    this.messages = [];
    this.socket = null;
  }

  async connect(roomCode) {
    this.socket = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      this.messages.push(JSON.parse(event.data));
    });
    this.send({ t: 'hello', name: this.name, ...(roomCode ? { roomCode } : {}) });
    await this.waitFor('welcome');
  }

  send(message) {
    this.socket.send(JSON.stringify(message));
  }

  last(type) {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].t === type) return this.messages[i];
    }
    return undefined;
  }

  async waitFor(type, timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = this.last(type);
      if (found) return found;
      await sleep(15);
    }
    throw new Error(`${this.name}: timed out waiting for "${type}"`);
  }

  close() {
    this.socket?.close();
  }
}

/** The letter wearing the category's colour — the rule of the game. */
function answerOf(round) {
  return round.card.letters.find((letter) => letter.color === round.card.categoryColor).initial.id;
}

function bankWord(language, category, initialId) {
  return getBank(language).byInitial.get(category).get(initialId)[0].surface;
}

console.log(`\nLexo smoke test on :${PORT}\n`);

const server = spawn(process.execPath, ['packages/server/dist/index.js'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(PORT),
    LEXO_HOST: '127.0.0.1',
    LEXO_INTERMISSION_MS: '150',
  },
  stdio: ['ignore', 'pipe', 'inherit'],
});

server.stdout.on('data', (chunk) => process.stdout.write(`  [server] ${chunk}`));

try {
  // --- wait for the port to answer ------------------------------------
  let up = false;
  for (let attempt = 0; attempt < 60 && !up; attempt++) {
    try {
      const response = await fetch(`${BASE}/healthz`);
      up = response.ok;
    } catch {
      await sleep(100);
    }
  }
  check('server responds on /healthz', up);
  if (!up) throw new Error('server never came up');

  const info = await (await fetch(`${BASE}/api/info`)).json();
  check('/api/info lists four languages', info.languages.length === 4);
  check('/api/info reports word counts', info.languages.every((l) => l.words > 200));
  check('/api/info lists five modes', info.modes.length === 5);

  // --- two players, one room ------------------------------------------
  const host = new Client('Ana');
  await host.connect();
  const code = host.last('welcome').room.code;
  check('host created a room', typeof code === 'string' && code.length === 4, code);

  const guest = new Client('Bruno');
  await guest.connect(code);
  await host.waitFor('room');
  check(
    'guest joined the same room',
    host.last('room').room.players.length === 2,
    JSON.stringify(host.last('room').room.players.map((p) => p.name)),
  );

  // --- configure and start ---------------------------------------------
  // 5 is the minimum reserve; anything smaller is clamped by
  // normaliseSettings, which is exactly what we want it to do.
  const settings = { ...host.last('welcome').room.settings, deckSize: 5, language: 'fr' };
  host.send({ t: 'settings', settings });
  await sleep(80);
  check('host settings applied', guest.last('room').room.settings.language === 'fr');
  check('deck size clamped to the minimum', guest.last('room').room.settings.deckSize === 5);

  guest.send({ t: 'start' });
  await sleep(80);
  check('non-host cannot start', guest.last('error')?.code === 'not-host');

  host.send({ t: 'start' });
  const firstRound = (await guest.waitFor('round')).round;
  check('round dealt to both players', Boolean(host.last('round')));
  check('card has three letters', firstRound.card.letters.length === 3);
  check('reserve keeps one card back', firstRound.total === 4);

  // --- a wrong letter is refused, and spamming is throttled -------------
  const wrongLetter = firstRound.card.letters.find(
    (letter) => letter.initial.id !== answerOf(firstRound),
  ).initial.id;
  guest.send({
    t: 'answer',
    word: bankWord('fr', firstRound.card.category, wrongLetter),
  });
  const refusal = await guest.waitFor('answer:rejected');
  check('wrong letter refused', refusal.reason === 'wrong-initial', refusal.reason);

  guest.send({ t: 'answer', word: 'immediatement' });
  await sleep(80);
  check('rapid-fire answers are rate limited', guest.last('error')?.code === 'rate-limited');

  // --- play it out ------------------------------------------------------
  // The answer cooldown is real (600ms by default), so a scripted player
  // has to pace itself just like a human.
  let played = 0;
  for (let i = 0; i < 4; i++) {
    await sleep(700);
    const round = host.last('round').round;
    const word = bankWord('fr', round.card.category, answerOf(round));
    guest.send({ t: 'answer', word });
    await guest.waitFor('round:end');
    played += 1;
    guest.messages = guest.messages.filter((m) => m.t !== 'round:end');
  }
  check('played every round of the reserve', played === 4);

  const summary = (await host.waitFor('game:end')).summary;
  check('game ended with a ranking', summary.ranking.length === 2);
  check('guest won every card', summary.ranking[0].score === 4, JSON.stringify(summary.ranking));
  check('summary logged the words', summary.words.length === 4);

  host.close();
  guest.close();
} catch (error) {
  failures += 1;
  console.error(`\n  ✗ ${error.message}`);
} finally {
  server.kill('SIGTERM');
  await sleep(200);
  server.kill('SIGKILL');
}

console.log(failures === 0 ? '\nSmoke test passed.\n' : `\n${failures} check(s) failed.\n`);
process.exit(failures === 0 ? 0 : 1);
