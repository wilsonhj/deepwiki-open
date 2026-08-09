/**
 * Entry screen: pick a name, then create a room or join one.
 *
 * A room code in the URL (`/?room=ABCD`) pre-fills the join field, which
 * is what makes "send your friends this link" work.
 */

import { useEffect, useState } from 'react';
import type { T, UiLanguage } from '../i18n.js';
import { UI_LANGUAGES } from '../i18n.js';

export interface HomeProps {
  t: T;
  uiLanguage: UiLanguage;
  onUiLanguage: (language: UiLanguage) => void;
  onCreate: (name: string) => void;
  onJoin: (name: string, code: string) => void;
  onResume: () => void;
  canResume: boolean;
  error: string | null;
}

export function Home({
  t,
  uiLanguage,
  onUiLanguage,
  onCreate,
  onJoin,
  onResume,
  canResume,
  error,
}: HomeProps) {
  const [name, setName] = useState(() => localStorage.getItem('lexo.name') ?? '');
  const [code, setCode] = useState('');

  useEffect(() => {
    const fromUrl = new URLSearchParams(location.search).get('room');
    if (fromUrl) setCode(fromUrl.toUpperCase());
  }, []);

  const remember = (value: string) => {
    setName(value);
    localStorage.setItem('lexo.name', value);
  };

  const trimmed = name.trim();

  return (
    <main className="screen home">
      <header className="home-header">
        <h1 className="wordmark">Lexo</h1>
        <p className="tagline">{t('tagline')}</p>
      </header>

      {error && <p className="banner banner-error">{error}</p>}

      <form
        className="panel"
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed) onCreate(trimmed);
        }}
      >
        <label className="field">
          <span>{t('yourName')}</span>
          <input
            value={name}
            onChange={(event) => remember(event.target.value)}
            maxLength={16}
            autoComplete="nickname"
            required
          />
        </label>

        <button type="submit" className="primary" disabled={!trimmed}>
          {t('createGame')}
        </button>

        <div className="divider">
          <span>{t('or')}</span>
        </div>

        <label className="field">
          <span>{t('roomCode')}</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            maxLength={4}
            className="code-input"
            placeholder="ABCD"
            inputMode="text"
            autoCapitalize="characters"
            spellCheck={false}
          />
        </label>

        <button
          type="button"
          className="secondary"
          disabled={!trimmed || code.trim().length < 4}
          onClick={() => onJoin(trimmed, code)}
        >
          {t('joinGame')}
        </button>

        {canResume && (
          <button type="button" className="ghost" onClick={onResume}>
            ↩︎ {t('lobby')}
          </button>
        )}
      </form>

      <section className="panel how-to">
        <h2>{t('howToPlay')}</h2>
        <p>{t('rulesShort')}</p>
        <p className="muted small">{t('colorHint')}</p>
      </section>

      <footer className="home-footer">
        <label className="field inline">
          <span>{t('interfaceLanguage')}</span>
          <select
            value={uiLanguage}
            onChange={(event) => onUiLanguage(event.target.value as UiLanguage)}
          >
            {UI_LANGUAGES.map((language) => (
              <option key={language.id} value={language.id}>
                {language.label}
              </option>
            ))}
          </select>
        </label>
      </footer>
    </main>
  );
}
