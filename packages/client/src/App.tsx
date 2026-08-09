/**
 * Screen selection.
 *
 * The server's `phase` decides what is on screen — the client never
 * navigates on its own. That is what makes a reconnecting player land
 * back on the live round instead of on a stale lobby.
 */

import { useEffect, useState } from 'react';
import { useGame } from './useGame.js';
import { detectUiLanguage, translator, type UiLanguage } from './i18n.js';
import { Home } from './screens/Home.js';
import { Lobby } from './screens/Lobby.js';
import { Board } from './screens/Board.js';
import { Results } from './screens/Results.js';

export function App() {
  const game = useGame();
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>(detectUiLanguage);
  const t = translator(uiLanguage);

  useEffect(() => {
    localStorage.setItem('lexo.ui', uiLanguage);
    document.documentElement.lang = uiLanguage;
  }, [uiLanguage]);

  const { room, me, actions } = game;

  if (!room) {
    return (
      <Home
        t={t}
        uiLanguage={uiLanguage}
        onUiLanguage={setUiLanguage}
        onCreate={actions.create}
        onJoin={actions.join}
        onResume={actions.resume}
        canResume={Boolean(localStorage.getItem('lexo.session'))}
        error={game.error?.message ?? null}
      />
    );
  }

  return (
    <>
      {game.status !== 'open' && (
        <p className="banner banner-warn connection-banner" role="status">
          {game.status === 'connecting' ? t('reconnecting') : t('offline')}
        </p>
      )}

      {game.error && (
        <button type="button" className="banner banner-error" onClick={game.dismissError}>
          {game.error.message}
        </button>
      )}

      {room.phase === 'lobby' && (
        <Lobby
          t={t}
          uiLanguage={uiLanguage}
          room={room}
          me={me}
          onSettings={actions.settings}
          onReady={actions.ready}
          onStart={actions.start}
        />
      )}

      {(room.phase === 'round' || room.phase === 'challenge' || room.phase === 'intermission') && (
        <Board
          t={t}
          room={room}
          me={me}
          round={game.round}
          result={game.result}
          challenge={game.challenge}
          rejection={game.rejection}
          now={actions.now}
          onAnswer={actions.answer}
          onVote={actions.vote}
        />
      )}

      {room.phase === 'finished' && game.summary && (
        <Results t={t} room={room} me={me} summary={game.summary} onRematch={actions.rematch} />
      )}
    </>
  );
}
