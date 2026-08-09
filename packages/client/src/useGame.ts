/**
 * The client's view of a game.
 *
 * Holds one `Connection` for the life of the tab and folds server
 * messages into React state. Nothing here decides anything about the
 * game — it only mirrors what the server says, which is why an
 * out-of-date client can never disagree with a score.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ChallengeView,
  ErrorCode,
  GameSettings,
  GameSummary,
  RejectionReason,
  RoomView,
  RoundResult,
  RoundView,
} from '@lexo/core';
import { Connection, type Status } from './net.js';

const STORAGE_KEY = 'lexo.session';

interface StoredSession {
  name: string;
  roomCode: string;
  token: string;
}

function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

export interface GameState {
  status: Status;
  meId: string | null;
  room: RoomView | null;
  round: RoundView | null;
  result: RoundResult | null;
  challenge: ChallengeView | null;
  summary: GameSummary | null;
  rejection: { reason: RejectionReason; word: string; at: number } | null;
  error: { code: ErrorCode; message: string } | null;
}

const initialState: GameState = {
  status: 'closed',
  meId: null,
  room: null,
  round: null,
  result: null,
  challenge: null,
  summary: null,
  rejection: null,
  error: null,
};

export function useGame() {
  const connectionRef = useRef<Connection | null>(null);
  const [state, setState] = useState<GameState>(initialState);

  if (!connectionRef.current) connectionRef.current = new Connection();
  const connection = connectionRef.current;

  useEffect(() => {
    const offMessage = connection.onMessage((message) => {
      setState((previous) => {
        switch (message.t) {
          case 'welcome':
            localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify({
                name: message.room.players.find((p) => p.id === message.you.id)?.name ?? '',
                roomCode: message.room.code,
                token: message.you.token,
              } satisfies StoredSession),
            );
            return { ...previous, meId: message.you.id, room: message.room, error: null };
          case 'room':
            return {
              ...previous,
              room: message.room,
              // Leaving the board clears whatever was on it.
              ...(message.room.phase === 'lobby'
                ? { round: null, result: null, challenge: null, summary: null }
                : null),
            };
          case 'round':
            return { ...previous, round: message.round, result: null, challenge: null };
          case 'round:end':
            return { ...previous, result: message.result, challenge: null };
          case 'challenge':
            return { ...previous, challenge: message.challenge };
          case 'game:end':
            return { ...previous, summary: message.summary, round: null, challenge: null };
          case 'answer:rejected':
            return {
              ...previous,
              rejection: { reason: message.reason, word: message.word, at: Date.now() },
            };
          case 'error':
            return { ...previous, error: { code: message.code, message: message.message } };
          default:
            return previous;
        }
      });
    });

    const offStatus = connection.onStatus((status) => {
      setState((previous) => ({ ...previous, status }));
    });

    return () => {
      offMessage();
      offStatus();
    };
  }, [connection]);

  useEffect(() => () => connection.close(), [connection]);

  const actions = useMemo(
    () => ({
      create(name: string) {
        connection.start({ t: 'hello', name });
      },
      join(name: string, roomCode: string) {
        connection.start({ t: 'hello', name, roomCode: roomCode.toUpperCase().trim() });
      },
      /** Rejoin the game this browser was last in, if any. */
      resume(): boolean {
        const saved = loadSession();
        if (!saved?.roomCode || !saved.token) return false;
        connection.start({
          t: 'hello',
          name: saved.name || 'Anon',
          roomCode: saved.roomCode,
          token: saved.token,
        });
        return true;
      },
      settings(settings: GameSettings) {
        connection.send({ t: 'settings', settings });
      },
      ready(ready: boolean) {
        connection.send({ t: 'ready', ready });
      },
      start() {
        connection.send({ t: 'start' });
      },
      answer(word: string) {
        connection.send({ t: 'answer', word });
      },
      vote(accept: boolean) {
        connection.send({ t: 'vote', accept });
      },
      rematch() {
        connection.send({ t: 'rematch' });
      },
      leave() {
        localStorage.removeItem(STORAGE_KEY);
        connection.close();
        setState(initialState);
      },
      now: () => connection.now(),
    }),
    [connection],
  );

  const dismissError = useCallback(() => {
    setState((previous) => ({ ...previous, error: null }));
  }, []);

  const me = state.room?.players.find((player) => player.id === state.meId) ?? null;

  return { ...state, me, actions, dismissError };
}
