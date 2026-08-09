/**
 * Lexo server: HTTP for the client bundle, WebSocket for the game.
 *
 * The socket layer is thin on purpose. It parses, it rate-limits, it
 * routes — every decision that affects a score is made in `Room`.
 */

import { createServer } from 'node:http';
import { appendFile } from 'node:fs/promises';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  bankSize,
  CATEGORIES,
  CATEGORY_IDS,
  defaultSettings,
  getBank,
  LANGUAGE_IDS,
  LANGUAGES,
  MODES,
  normaliseSettings,
  type ClientMessage,
  type ServerMessage,
} from '@lexo/core';
import { config } from './config.js';
import { RoomManager } from './rooms.js';
import type { Room, Sender } from './room.js';
import { createStaticHandler } from './static.js';

const rooms = new RoomManager();
rooms.startSweeper();

const serveStatic = createStaticHandler(config.clientDir);

/** Everything a client needs to render a lobby before joining one. */
function info() {
  return {
    name: 'lexo',
    languages: LANGUAGE_IDS.map((id) => ({
      id,
      nativeName: LANGUAGES[id].nativeName,
      bcp47: LANGUAGES[id].bcp47,
      initials: LANGUAGES[id].initials,
      words: bankSize(getBank(id)),
    })),
    categories: CATEGORY_IDS.map((id) => CATEGORIES[id]),
    modes: Object.values(MODES).map((mode) => ({
      id: mode.id,
      label: mode.label,
      blurb: mode.blurb,
      minPlayers: mode.minPlayers,
      maxPlayers: mode.maxPlayers,
      teams: mode.teams,
    })),
    rooms: rooms.size,
  };
}

const http = createServer((request, response) => {
  const url = request.url ?? '/';

  if (url === '/healthz') {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('ok');
    return;
  }

  if (url === '/api/info') {
    response.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60',
    });
    response.end(JSON.stringify(info()));
    return;
  }

  void serveStatic(request, response).catch(() => {
    if (!response.headersSent) response.writeHead(500);
    response.end('Internal error');
  });
});

// 4 KiB is far more than any legitimate message; anything larger is
// either a bug or someone probing.
const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 4096 });

interface Session {
  room: Room | null;
  playerId: string | null;
}

/** Sockets that missed the last ping, tracked outside the ws instance. */
const alive = new WeakSet<WebSocket>();

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

function senderFor(socket: WebSocket): Sender {
  return {
    send: (message) => send(socket, message),
    close: () => socket.close(4000, 'replaced'),
  };
}

function parse(raw: unknown): ClientMessage | null {
  try {
    const parsed = JSON.parse(String(raw));
    if (parsed && typeof parsed === 'object' && typeof parsed.t === 'string') {
      return parsed as ClientMessage;
    }
  } catch {
    /* fall through */
  }
  return null;
}

wss.on('connection', (socket: WebSocket) => {
  const session: Session = { room: null, playerId: null };
  alive.add(socket);

  socket.on('pong', () => {
    alive.add(socket);
  });

  socket.on('message', (raw) => {
    const message = parse(raw);
    if (!message) {
      send(socket, { t: 'error', code: 'bad-message', message: 'Could not read that message.' });
      return;
    }

    if (message.t === 'hello') {
      if (session.room) return; // one hello per connection
      const settings = normaliseSettings(defaultSettings('es', 'classic'));
      const room = message.roomCode ? rooms.get(message.roomCode) : rooms.create(settings);

      if (!room) {
        send(socket, {
          t: 'error',
          code: message.roomCode ? 'room-not-found' : 'internal',
          message: message.roomCode
            ? 'No room with that code. Check the letters and try again.'
            : 'The server is at capacity. Try again in a moment.',
        });
        socket.close(4004, 'no-room');
        return;
      }

      const result = room.join(senderFor(socket), message.name, message.token);
      if ('error' in result) {
        send(socket, { t: 'error', code: result.error, message: describe(result.error) });
        socket.close(4003, result.error);
        return;
      }
      session.room = room;
      session.playerId = result.playerId;
      return;
    }

    if (!session.room || !session.playerId) {
      send(socket, { t: 'error', code: 'bad-message', message: 'Say hello first.' });
      return;
    }
    session.room.handle(session.playerId, message);
  });

  socket.on('close', () => {
    if (session.room && session.playerId) {
      const room = session.room;
      room.detach(session.playerId);
      void persistSuggestions(room);
    }
  });

  socket.on('error', () => socket.close());
});

function describe(code: string): string {
  switch (code) {
    case 'room-full':
      return 'That room is full.';
    case 'already-started':
      return 'That game has already started.';
    default:
      return 'Could not join that room.';
  }
}

/**
 * Append words the table voted through to a JSONL file.
 *
 * These are the raw material for word-bank pull requests: real players
 * agreeing that a word counts is exactly the signal the bank is missing.
 */
async function persistSuggestions(room: Room): Promise<void> {
  if (!config.suggestionsFile) return;
  const suggestions = room.takeSuggestions();
  if (suggestions.length === 0) return;
  const lines = suggestions
    .map((entry) => JSON.stringify({ ...entry, at: new Date().toISOString() }))
    .join('\n');
  try {
    await appendFile(config.suggestionsFile, lines + '\n', 'utf8');
  } catch (error) {
    console.warn('[lexo] could not write suggestions:', error);
  }
}

// Drop connections that stopped answering, so rooms do not fill up with
// browser tabs that were closed without a clean handshake.
const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (!alive.has(socket)) {
      socket.terminate();
      continue;
    }
    alive.delete(socket);
    socket.ping();
  }
}, 30_000);
heartbeat.unref?.();

http.listen(config.port, config.host, () => {
  console.log(`[lexo] listening on http://${config.host}:${config.port}`);
  console.log(`[lexo] serving client from ${config.clientDir}`);
});

function shutdown(signal: string): void {
  console.log(`[lexo] ${signal} — shutting down`);
  clearInterval(heartbeat);
  rooms.stop();
  wss.close();
  http.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
