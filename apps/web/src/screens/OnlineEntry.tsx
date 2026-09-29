import { DEFAULT_CONFIG, NAME_MAX, type RoomConfig } from '@chinchiro/rules';
import { useState } from 'react';
import { RoomSettings } from '../components/RoomSettings';
import { loadName, type Online } from '../lib/online';
import { play, unlockAudio } from '../lib/sfx';

interface Props {
  online: Online;
  initialCode: string;
  onBack: () => void;
}

export function OnlineEntry({ online, initialCode, onBack }: Props) {
  const [name, setName] = useState(loadName);
  const [code, setCode] = useState(initialCode);
  const [config, setConfig] = useState<RoomConfig>(DEFAULT_CONFIG);
  const [tried, setTried] = useState(false);

  const busy = online.status === 'connecting' || online.status === 'reconnecting';
  const nameOk = name.trim().length > 0;
  const codeOk = /^[A-Z0-9]{4}$/.test(code);

  const go = (fn: () => void) => {
    setTried(true);
    if (!nameOk) return;
    unlockAudio();
    play('tap');
    online.clearError();
    fn();
  };

  return (
    <main className="setup">
      <div className="back-row">
        <button type="button" className="btn ghost" onClick={onBack}>
          ← 戻る
        </button>
        <h1 className="screen-title">オンラインで遊ぶ</h1>
      </div>

      <section className="panel">
        <label className="field">
          <b>あなたの名前</b>
          <input
            id="online-name"
            value={name}
            maxLength={NAME_MAX}
            placeholder="例：あおい"
            autoComplete="nickname"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {tried && !nameOk && <p className="warn small">名前を入れてください</p>}
      </section>

      {online.error && <p className="error-box">{online.error}</p>}

      <section className="panel">
        <h2>部屋に入る</h2>
        <p className="small sub">招待された4文字の部屋番号を入れてください。</p>
        <div className="join-row">
          <input
            id="room-code"
            className="code-input"
            value={code}
            maxLength={4}
            placeholder="ABCD"
            autoCapitalize="characters"
            autoComplete="off"
            inputMode="text"
            aria-label="部屋番号"
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          />
          <button
            type="button"
            className="btn primary"
            disabled={!codeOk || busy}
            onClick={() => go(() => online.join(code, name.trim()))}
          >
            {busy ? '接続中…' : '入る'}
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>部屋を作る</h2>
        <RoomSettings config={config} players={4} onChange={setConfig} />
        <p className="small sub">局数は集まった人数で決まります（上は4人の場合）。</p>
        <button
          type="button"
          className="btn primary big"
          disabled={busy}
          onClick={() => go(() => online.create(name.trim(), config))}
        >
          {busy ? '接続中…' : '部屋を作る'}
        </button>
      </section>
    </main>
  );
}
