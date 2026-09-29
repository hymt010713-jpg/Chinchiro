import {
  DEFAULT_CONFIG,
  closeBets,
  createGame,
  currentRoller,
  nextRound,
  placeBet,
  rollFor,
  type GameState,
  type Player,
  type RoomConfig,
} from '@chinchiro/rules';
import { useEffect, useMemo, useState } from 'react';
import { loadSeat } from './lib/online';
import { play } from './lib/sfx';
import { DEFAULT_NAMES, cryptoRng, loadGame, saveGame } from './lib/util';
import { Home } from './screens/Home';
import { Online } from './screens/Online';
import { OyaDraw } from './screens/OyaDraw';
import { Result } from './screens/Result';
import { Setup } from './screens/Setup';
import { Table, type TableControls } from './screens/Table';

type Screen = 'home' | 'setup' | 'draw' | 'table' | 'result' | 'online';

const inviteCode = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '';

export function App() {
  // 招待リンクで開いたか、前回の席が残っていればオンライン画面から始める
  const [screen, setScreen] = useState<Screen>(inviteCode || loadSeat() ? 'online' : 'home');
  const [players, setPlayers] = useState<Player[]>(
    DEFAULT_NAMES.slice(0, 4).map((name, i) => ({ id: `p${i}`, name })),
  );
  const [config, setConfig] = useState<RoomConfig>(DEFAULT_CONFIG);
  const [game, setGame] = useState<GameState | null>(null);

  useEffect(() => {
    if (screen === 'table' && game) saveGame(game);
  }, [screen, game]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  // 1台版：全員をこの端末で操作する
  const localControls: TableControls | null = useMemo(() => {
    if (!game) return null;
    return {
      me: null,
      bet: (id, units) => setGame(placeBet(game, id, units)),
      closeBets: () => {
        play('turn');
        setGame(closeBets(game));
      },
      roll: () => {
        const who = currentRoller(game);
        if (who) setGame(rollFor(game, who, cryptoRng));
      },
      next: () => {
        play('tap');
        const next = nextRound(game);
        setGame(next);
        if (next.phase === 'gameOver') {
          saveGame(null);
          setScreen('result');
        }
      },
    };
  }, [game]);

  switch (screen) {
    case 'home':
      return (
        <Home
          resumable={loadGame()}
          onLocal={() => setScreen('setup')}
          onOnline={() => setScreen('online')}
          onResume={(g) => {
            setPlayers(g.players);
            setConfig(g.config);
            setGame(g);
            setScreen('table');
          }}
        />
      );
    case 'setup':
      return (
        <Setup
          initialNames={players.map((p) => p.name)}
          initialConfig={config}
          onBack={() => setScreen('home')}
          onStart={(ps, cfg) => {
            setPlayers(ps);
            setConfig(cfg);
            saveGame(null);
            setScreen('draw');
          }}
        />
      );
    case 'draw':
      return (
        <OyaDraw
          players={players}
          onDone={(index) => {
            setGame(createGame(players, config, index));
            setScreen('table');
          }}
        />
      );
    case 'table':
      return <Table game={game!} controls={localControls!} onExit={() => setScreen('home')} exitLabel="中断" />;
    case 'result':
      return <Result game={game!} onRematch={() => setScreen('draw')} onSetup={() => setScreen('setup')} />;
    case 'online':
      return <Online initialCode={inviteCode} onExit={() => setScreen('home')} />;
  }
}
