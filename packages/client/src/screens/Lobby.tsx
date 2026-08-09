/**
 * Lobby: who is here, and what game are we about to play.
 *
 * Only the host can change settings; everyone else sees the same
 * controls, disabled, so nobody has to ask what the game is set to.
 */

import {
  CATEGORIES,
  CATEGORY_IDS,
  LANGUAGES,
  LANGUAGE_IDS,
  MODES,
  GAME_MODE_IDS,
  type CategoryId,
  type GameSettings,
  type PlayerView,
  type RoomView,
} from '@lexo/core';
import type { T, UiLanguage } from '../i18n.js';
import { useState } from 'react';

export interface LobbyProps {
  t: T;
  uiLanguage: UiLanguage;
  room: RoomView;
  me: PlayerView | null;
  onSettings: (settings: GameSettings) => void;
  onReady: (ready: boolean) => void;
  onStart: () => void;
}

export function Lobby({ t, uiLanguage, room, me, onSettings, onReady, onStart }: LobbyProps) {
  const [copied, setCopied] = useState(false);
  const isHost = me?.isHost ?? false;
  const settings = room.settings;
  const mode = MODES[settings.mode];
  const seated = room.players.filter((player) => player.connected).length;
  const enoughPlayers = seated >= mode.minPlayers && seated <= mode.maxPlayers;

  const patch = (changes: Partial<GameSettings>) => onSettings({ ...settings, ...changes });

  const toggleCategory = (id: CategoryId) => {
    const next = settings.categories.includes(id)
      ? settings.categories.filter((other) => other !== id)
      : [...settings.categories, id];
    if (next.length > 0) patch({ categories: next });
  };

  const share = async () => {
    const url = `${location.origin}/?room=${room.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied — the code is on screen anyway.
    }
  };

  return (
    <main className="screen lobby">
      <header className="lobby-header">
        <div>
          <h1 className="wordmark small">Lexo</h1>
          <p className="muted">{t('lobby')}</p>
        </div>
        <button type="button" className="code-badge" onClick={share} title={t('shareLink')}>
          <span className="code-badge-code">{room.code}</span>
          <span className="code-badge-hint">{copied ? t('copied') : t('shareLink')}</span>
        </button>
      </header>

      <section className="panel">
        <h2>
          {t('players')} <span className="muted">({seated})</span>
        </h2>
        <ul className="player-list">
          {room.players.map((player) => (
            <li key={player.id} className={player.connected ? '' : 'offline'}>
              <span className="player-name">{player.name}</span>
              {player.isHost && <span className="pill">{t('host')}</span>}
              {player.team && <span className={`pill team-${player.team}`}>{player.team.toUpperCase()}</span>}
              <span className={`pill ${player.ready ? 'pill-ready' : 'pill-muted'}`}>
                {player.ready ? t('ready') : t('notReady')}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>{t('settings')}</h2>

        <label className="field">
          <span>{t('playLanguage')}</span>
          <select
            value={settings.language}
            disabled={!isHost}
            onChange={(event) => patch({ language: event.target.value as GameSettings['language'] })}
          >
            {LANGUAGE_IDS.map((id) => (
              <option key={id} value={id}>
                {LANGUAGES[id].nativeName}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>{t('mode')}</span>
          <select
            value={settings.mode}
            disabled={!isHost}
            onChange={(event) => {
              const next = event.target.value as GameSettings['mode'];
              patch({ ...MODES[next].defaults, mode: next });
            }}
          >
            {GAME_MODE_IDS.map((id) => (
              <option key={id} value={id}>
                {MODES[id].label[uiLanguage]}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">{mode.blurb[uiLanguage]}</p>

        <fieldset className="field" disabled={!isHost}>
          <legend>{t('categories')}</legend>
          <div className="chips">
            {CATEGORY_IDS.map((id) => {
              const active = settings.categories.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  className={`chip${active ? ' chip-on' : ''}`}
                  aria-pressed={active}
                  onClick={() => toggleCategory(id)}
                >
                  <span aria-hidden="true">{CATEGORIES[id].icon}</span>{' '}
                  {CATEGORIES[id].label[settings.language]}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="field">
          <span>
            {t('cards')}: {settings.deckSize}
          </span>
          <input
            type="range"
            min={5}
            max={60}
            value={settings.deckSize}
            disabled={!isHost}
            onChange={(event) => patch({ deckSize: Number(event.target.value) })}
          />
        </label>

        <label className="field">
          <span>
            {t('roundTime')}:{' '}
            {settings.roundSeconds ? `${settings.roundSeconds}${t('seconds')}` : t('noLimit')}
          </span>
          <input
            type="range"
            min={0}
            max={60}
            step={5}
            value={settings.roundSeconds ?? 0}
            disabled={!isHost}
            onChange={(event) => {
              const value = Number(event.target.value);
              patch({ roundSeconds: value === 0 ? null : Math.max(5, value) });
            }}
          />
        </label>

        <label className="field checkbox">
          <input
            type="checkbox"
            checked={settings.allowRepeats}
            disabled={!isHost}
            onChange={(event) => patch({ allowRepeats: event.target.checked })}
          />
          <span>{t('allowRepeats')}</span>
        </label>

        <label className="field checkbox">
          <input
            type="checkbox"
            checked={settings.allowChallenges}
            disabled={!isHost || settings.mode === 'solo'}
            onChange={(event) => patch({ allowChallenges: event.target.checked })}
          />
          <span>{t('allowChallenges')}</span>
        </label>
      </section>

      <div className="lobby-actions">
        <button
          type="button"
          className={me?.ready ? 'secondary' : 'primary'}
          onClick={() => onReady(!me?.ready)}
        >
          {me?.ready ? t('notReady') : t('ready')}
        </button>

        {isHost ? (
          <button type="button" className="primary" disabled={!enoughPlayers} onClick={onStart}>
            {t('start')}
          </button>
        ) : (
          <p className="muted">{t('waitingForHost')}</p>
        )}
      </div>
    </main>
  );
}
