/**
 * End of game: podium, per-player stats, and the words that came up.
 *
 * The suggestions block is the bridge back to the repository — words a
 * real table voted through are exactly what the word bank is missing,
 * so they are shown with a nudge to open a pull request.
 */

import { CATEGORIES, type GameSummary, type PlayerView, type RoomView } from '@lexo/core';
import type { T } from '../i18n.js';

export interface ResultsProps {
  t: T;
  room: RoomView;
  me: PlayerView | null;
  summary: GameSummary;
  onRematch: () => void;
}

function formatMs(ms: number | null): string {
  return ms === null ? '—' : `${(ms / 1000).toFixed(2)}s`;
}

export function Results({ t, room, me, summary, onRematch }: ResultsProps) {
  const language = room.settings.language;
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <main className="screen results">
      <h1>{t('finalRanking')}</h1>

      <ol className="podium">
        {summary.ranking.map((row, index) => (
          <li key={row.playerId} className={row.playerId === me?.id ? 'is-me' : ''}>
            <span className="medal" aria-hidden="true">
              {medals[index] ?? `${index + 1}.`}
            </span>
            <span className="player-name">{row.name}</span>
            {row.team && <span className={`pill team-${row.team}`}>{row.team.toUpperCase()}</span>}
            <span className="score">
              {row.score} {t('points')}
            </span>
          </li>
        ))}
      </ol>

      <section className="panel">
        <table className="stats">
          <thead>
            <tr>
              <th>{t('players')}</th>
              <th>{t('averageTime')}</th>
              <th>{t('bestTime')}</th>
              <th>{t('strongest')}</th>
            </tr>
          </thead>
          <tbody>
            {summary.ranking.map((row) => (
              <tr key={row.playerId}>
                <td>{row.name}</td>
                <td>{formatMs(row.averageMs)}</td>
                <td>{formatMs(row.bestMs)}</td>
                <td>
                  {row.strongest
                    ? `${CATEGORIES[row.strongest].icon} ${CATEGORIES[row.strongest].label[language]}`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {summary.words.length > 0 && (
        <section className="panel">
          <h2>{t('wordsPlayed')}</h2>
          <ul className="word-log">
            {summary.words.map((entry, index) => (
              <li key={`${entry.surface}-${index}`}>
                <span aria-hidden="true">{CATEGORIES[entry.category].icon}</span>{' '}
                <span lang={language}>{entry.surface}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary.suggestions.length > 0 && (
        <section className="panel">
          <h2>{t('suggestions')}</h2>
          <p className="muted small">{t('suggestionsHint')}</p>
          <ul className="word-log">
            {summary.suggestions.map((entry, index) => (
              <li key={`${entry.word}-${index}`}>
                <span aria-hidden="true">{CATEGORIES[entry.category].icon}</span>{' '}
                <span lang={entry.language}>{entry.word}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {me?.isHost && (
        <button type="button" className="primary" onClick={onRematch}>
          {t('rematch')}
        </button>
      )}
    </main>
  );
}
