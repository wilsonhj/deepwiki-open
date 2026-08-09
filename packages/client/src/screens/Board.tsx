/**
 * The board: card, answer box, scores, and the two overlays that can
 * interrupt a round (a contested word, and the result).
 *
 * One detail worth keeping: the answer box must not submit while an IME
 * is composing. Japanese players press Enter to *convert* kana to kanji
 * long before they mean to answer, and a naive form would fire on that
 * first Enter every single time.
 */

import { useEffect, useRef, useState } from 'react';
import {
  CATEGORIES,
  LANGUAGES,
  type ChallengeView,
  type PlayerView,
  type RoomView,
  type RoundResult,
  type RoundView,
} from '@lexo/core';
import { CardView } from '../components/CardView.js';
import type { T } from '../i18n.js';

export interface BoardProps {
  t: T;
  room: RoomView;
  me: PlayerView | null;
  round: RoundView | null;
  result: RoundResult | null;
  challenge: ChallengeView | null;
  rejection: { reason: string; word: string; at: number } | null;
  now: () => number;
  onAnswer: (word: string) => void;
  onVote: (accept: boolean) => void;
}

/** Countdown to a server deadline, in whole seconds. */
function useCountdown(deadlineAt: number | null, now: () => number) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (deadlineAt === null) {
      setRemaining(null);
      return;
    }
    const tick = () => setRemaining(Math.max(0, deadlineAt - now()));
    tick();
    const timer = window.setInterval(tick, 100);
    return () => window.clearInterval(timer);
  }, [deadlineAt, now]);

  return remaining;
}

export function Board({
  t,
  room,
  me,
  round,
  result,
  challenge,
  rejection,
  now,
  onAnswer,
  onVote,
}: BoardProps) {
  const [word, setWord] = useState('');
  const [shake, setShake] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const language = room.settings.language;
  const remaining = useCountdown(round?.deadlineAt ?? null, now);
  const settled = room.phase !== 'round';

  // A new round means a clean box and the focus back where it belongs.
  useEffect(() => {
    setWord('');
    if (room.phase === 'round') inputRef.current?.focus();
  }, [round?.card.id, room.phase]);

  useEffect(() => {
    if (!rejection) return;
    setShake(rejection.at);
    if (navigator.vibrate) navigator.vibrate(40);
  }, [rejection?.at]);

  const submit = () => {
    const trimmed = word.trim();
    if (!trimmed || settled) return;
    onAnswer(trimmed);
    setWord('');
  };

  const totalMs = round?.deadlineAt && round ? round.deadlineAt - round.startedAt : null;
  const progress = totalMs && remaining !== null ? Math.max(0, remaining / totalMs) : null;

  return (
    <main className="screen board">
      <header className="board-header">
        <span className="muted">
          {t('round')} {(round?.index ?? room.roundIndex) + 1} {t('of')}{' '}
          {round?.total ?? room.roundsTotal}
        </span>
        {remaining !== null && (
          <span className={`clock${remaining < 5000 ? ' clock-urgent' : ''}`}>
            {Math.ceil(remaining / 1000)}
            {t('seconds')}
          </span>
        )}
      </header>

      {progress !== null && (
        <div className="timer-track" role="presentation">
          <div className="timer-bar" style={{ transform: `scaleX(${progress})` }} />
        </div>
      )}

      {round && (
        <CardView
          card={round.card}
          language={language}
          revealDelaysMs={round.revealDelaysMs}
          settled={settled}
        />
      )}

      <form
        className={`answer${shake ? ' answer-shake' : ''}`}
        key={shake}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          ref={inputRef}
          value={word}
          onChange={(event) => setWord(event.target.value)}
          onKeyDown={(event) => {
            // Enter during IME composition means "convert", not "send".
            if (event.key === 'Enter' && event.nativeEvent.isComposing) {
              event.preventDefault();
            }
          }}
          placeholder={LANGUAGES[language].inputHint}
          lang={LANGUAGES[language].bcp47}
          disabled={settled}
          maxLength={48}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label={t('yourAnswer')}
        />
        <button type="submit" className="primary" disabled={settled || !word.trim()}>
          {t('send')}
        </button>
      </form>

      {rejection && !result && (
        <p className="banner banner-error" role="status">
          {t(`error.${rejection.reason}`)}
        </p>
      )}

      <ol className="scores">
        {[...room.players]
          .sort((a, b) => b.score - a.score)
          .map((player) => (
            <li
              key={player.id}
              className={`${player.id === me?.id ? 'is-me' : ''}${
                player.connected ? '' : ' offline'
              }`}
            >
              <span className="player-name">{player.name}</span>
              <span className="score">{player.score}</span>
            </li>
          ))}
      </ol>

      {challenge && (
        <ChallengeOverlay
          t={t}
          challenge={challenge}
          isMine={challenge.playerId === me?.id}
          now={now}
          onVote={onVote}
        />
      )}

      {result && !challenge && <ResultOverlay t={t} room={room} result={result} />}
    </main>
  );
}

function ChallengeOverlay({
  t,
  challenge,
  isMine,
  now,
  onVote,
}: {
  t: T;
  challenge: ChallengeView;
  isMine: boolean;
  now: () => number;
  onVote: (accept: boolean) => void;
}) {
  const remaining = useCountdown(challenge.deadlineAt, now);
  const [voted, setVoted] = useState(false);

  useEffect(() => setVoted(false), [challenge.word, challenge.playerId]);

  return (
    <div className="overlay" role="dialog" aria-live="polite">
      <div className="overlay-panel">
        <h2>{t('challengeTitle')}</h2>
        <p className="challenge-word">{challenge.word}</p>
        <p className="muted">
          {t('challengeBy')} {challenge.playerName}
          {remaining !== null && ` · ${Math.ceil(remaining / 1000)}${t('seconds')}`}
        </p>

        {isMine || voted ? (
          <p className="muted">{t('challengeWaiting')}</p>
        ) : (
          <div className="overlay-actions">
            <button
              type="button"
              className="primary"
              onClick={() => {
                setVoted(true);
                onVote(true);
              }}
            >
              {t('voteYes')}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setVoted(true);
                onVote(false);
              }}
            >
              {t('voteNo')}
            </button>
          </div>
        )}

        <p className="tally">
          ✓ {challenge.accepted} · ✕ {challenge.rejected} / {challenge.voters}
        </p>
      </div>
    </div>
  );
}

function ResultOverlay({ t, room, result }: { t: T; room: RoomView; result: RoundResult }) {
  const winner = room.players.find((player) => player.id === result.winnerId);
  const category = CATEGORIES[result.category];

  return (
    <div className="overlay" role="status" aria-live="polite">
      <div className="overlay-panel">
        {result.winnerId ? (
          <>
            <p className="muted">
              {t('wonBy')} <strong>{winner?.name}</strong>
            </p>
            <p className="result-word" lang={room.settings.language}>
              {result.surface}
            </p>
            {result.submitted && (
              <p className="muted small">
                {t('youTyped')}: {result.submitted}
              </p>
            )}
            {result.byVote && <p className="muted small">({t('byVote')})</p>}
            {result.elapsedMs !== null && (
              <p className="muted small">{(result.elapsedMs / 1000).toFixed(2)}s</p>
            )}
          </>
        ) : (
          <p className="result-word">{t('nobodyFound')}</p>
        )}

        <p className="muted small">
          {category.icon} {category.label[room.settings.language]} ·{' '}
          <strong>{result.answerInitial.display}</strong>
        </p>
        <p className="muted small">{t('nextRound')}</p>
      </div>
    </div>
  );
}
