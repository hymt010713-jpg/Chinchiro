import { MAX_PLAYERS, MIN_PLAYERS, type ClientMessage, type RoomView } from '@chinchiro/rules';
import { useState } from 'react';
import { RoomSettings } from '../components/RoomSettings';
import { play } from '../lib/sfx';
import { SEAT_COLORS } from '../lib/util';

interface Props {
  room: RoomView;
  you: string;
  send: (m: ClientMessage) => void;
  onLeave: () => void;
}

export function Lobby({ room, you, send, onLeave }: Props) {
  const [copied, setCopied] = useState(false);
  const isHost = room.hostId === you;
  const host = room.members.find((m) => m.id === room.hostId);
  const ready = room.members.filter((m) => m.online).length;
  const link = `${location.origin}/?room=${room.code}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.getElementById('invite-link') as HTMLInputElement | null;
      el?.select();
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: 'チンチロ五', text: `部屋番号 ${room.code} で待っています`, url: link });
    } catch {
      // キャンセルや非対応は何もしない
    }
  };

  return (
    <main className="setup">
      <div className="back-row">
        <button type="button" className="btn ghost" onClick={onLeave}>
          ← 退室
        </button>
        <h1 className="screen-title">待合室</h1>
      </div>

      <section className="panel room-code-panel">
        <span className="small sub">部屋番号</span>
        <b className="room-code num">{room.code}</b>
        <div className="invite">
          <input id="invite-link" value={link} readOnly aria-label="招待リンク" onFocus={(e) => e.target.select()} />
          <button type="button" className="btn" onClick={copy}>
            {copied ? 'コピーしました' : 'リンクをコピー'}
          </button>
          {'share' in navigator && (
            <button type="button" className="btn" onClick={share}>
              送る
            </button>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>
          参加者 <span className="sub num">{room.members.length} / {MAX_PLAYERS}</span>
        </h2>
        <ol className="member-list">
          {room.members.map((m, i) => (
            <li key={m.id} className={m.online ? '' : 'away'}>
              <span className="av" style={{ background: SEAT_COLORS[i] }}>
                {[...m.name][0]}
              </span>
              <span className="member-name">{m.name}</span>
              {m.id === you && <span className="badge me-badge">あなた</span>}
              {m.id === room.hostId && <span className="badge oya-badge">部屋主</span>}
              {!m.online && <span className="badge">接続待ち</span>}
            </li>
          ))}
        </ol>
        <p className="small sub">入った順が席の順（時計回り）です。</p>
      </section>

      <section className="panel">
        <h2>ルーム設定{isHost ? '' : '（部屋主が決めます）'}</h2>
        <RoomSettings
          config={room.config}
          players={room.members.length}
          onChange={isHost ? (config) => send({ t: 'config', config }) : undefined}
        />
      </section>

      {isHost ? (
        <button
          type="button"
          className="btn primary big"
          disabled={ready < MIN_PLAYERS}
          onClick={() => {
            play('tap');
            send({ t: 'start' });
          }}
        >
          {ready < MIN_PLAYERS ? `あと${MIN_PLAYERS - ready}人で始められます` : `${ready}人で始める`}
        </button>
      ) : (
        <p className="waiting">{host?.name ?? '部屋主'}さんが始めるのを待っています…</p>
      )}
    </main>
  );
}
