import { useEffect, useMemo } from 'react';
import { useOnline } from '../lib/online';
import { Lobby } from './Lobby';
import { OnlineEntry } from './OnlineEntry';
import { OyaDraw } from './OyaDraw';
import { Result } from './Result';
import { Table, type TableControls } from './Table';

interface Props {
  initialCode: string;
  onExit: () => void;
}

/** オンライン版。部屋の場面に応じて画面を切り替える */
export function Online({ initialCode, onExit }: Props) {
  const online = useOnline();
  const { room, you, send } = online;

  // 同じ内容なら同じオブジェクトを渡し、親決めの演出が作り直されないようにする
  const drawKey = room?.draw ? JSON.stringify(room.draw) : '';
  const draw = useMemo(() => room?.draw ?? undefined, [drawKey]);
  const playersKey = room ? room.members.map((m) => `${m.id}:${m.name}`).join('|') : '';
  const players = useMemo(() => room?.members.map(({ id, name }) => ({ id, name })) ?? [], [playersKey]);

  useEffect(() => {
    if (!online.error || !room) return;
    const t = setTimeout(online.clearError, 4000);
    return () => clearTimeout(t);
  }, [online.error, room, online.clearError]);

  const leave = () => {
    online.leave();
    history.replaceState(null, '', '/');
    onExit();
  };

  const controls: TableControls | null = useMemo(() => {
    if (!room || !you) return null;
    return {
      me: you,
      bet: (_id, units) => send({ t: 'bet', units }),
      betDone: () => send({ t: 'betDone' }),
      betsDone: room.betsDone,
      roll: () => send({ t: 'roll' }),
      hold: (on) => send({ t: 'hold', on }),
      holding: room.holding,
      deadline: room.deadline ? room.deadline - online.offset : null,
      offline: room.members.filter((m) => !m.online).map((m) => m.id),
      disconnected: online.status !== 'open',
    };
  }, [room, you, send, online.offset, online.status]);

  if (!room || !you) {
    return (
      <OnlineEntry
        online={online}
        initialCode={initialCode}
        onBack={() => {
          online.leave();
          onExit();
        }}
      />
    );
  }

  const toast = online.error && <div className="toast">{online.error}</div>;

  switch (room.stage) {
    case 'lobby':
      return (
        <>
          <Lobby room={room} you={you} send={send} onLeave={leave} />
          {toast}
        </>
      );
    case 'drawing':
      return <OyaDraw players={players} draw={draw} />;
    case 'playing':
      return (
        <>
          <Table game={room.game!} controls={controls!} onExit={leave} exitLabel="退室" badge={room.code} />
          {toast}
        </>
      );
    case 'finished': {
      const isHost = room.hostId === you;
      const host = room.members.find((m) => m.id === room.hostId);
      return (
        <>
          <Result
            game={room.game!}
            onRematch={isHost ? () => send({ t: 'rematch' }) : undefined}
            rematchLabel="同じ部屋でもう一局"
            note={isHost ? undefined : `${host?.name ?? '部屋主'}さんが再戦を始めると待合室に戻ります`}
            onSetup={leave}
            setupLabel="退室する"
          />
          {toast}
        </>
      );
    }
  }
}
