import { MAX_PLAYERS, MIN_PLAYERS, type Player, type RoomConfig } from '@chinchiro/rules';
import { useState } from 'react';
import { RoomSettings } from '../components/RoomSettings';
import { play, unlockAudio } from '../lib/sfx';
import { DEFAULT_NAMES, SEAT_COLORS } from '../lib/util';

interface Props {
  initialNames: string[];
  initialConfig: RoomConfig;
  onStart: (players: Player[], config: RoomConfig) => void;
  onBack: () => void;
}

/** 1台版の設定 */
export function Setup({ initialNames, initialConfig, onStart, onBack }: Props) {
  const [names, setNames] = useState<string[]>(initialNames);
  const [config, setConfig] = useState<RoomConfig>(initialConfig);

  const trimmed = names.map((n, i) => n.trim() || DEFAULT_NAMES[i]!);
  const dupes = new Set(trimmed.filter((n, i) => trimmed.indexOf(n) !== i));

  const start = () => {
    unlockAudio();
    play('tap');
    onStart(
      trimmed.map((name, i) => ({ id: `p${i}`, name })),
      config,
    );
  };

  return (
    <main className="setup">
      <div className="back-row">
        <button type="button" className="btn ghost" onClick={onBack}>
          ← 戻る
        </button>
        <h1 className="screen-title">1台で遊ぶ</h1>
      </div>

      <section className="panel">
        <h2>参加者</h2>
        <p className="small sub">席の順番が時計回りの順番です。親の左隣の人から振ります。</p>
        <ol className="name-list">
          {names.map((n, i) => (
            <li key={i}>
              <span className="av" style={{ background: SEAT_COLORS[i] }}>
                {[...(trimmed[i] ?? '')][0]}
              </span>
              <input
                id={`name-${i}`}
                value={n}
                maxLength={8}
                placeholder={DEFAULT_NAMES[i]}
                aria-label={`${i + 1}番目の席の名前`}
                onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))}
              />
              {names.length > MIN_PLAYERS && (
                <button
                  type="button"
                  className="btn ghost small-btn"
                  aria-label={`${trimmed[i]}を外す`}
                  onClick={() => setNames(names.filter((_, j) => j !== i))}
                >
                  外す
                </button>
              )}
            </li>
          ))}
        </ol>
        {names.length < MAX_PLAYERS && (
          <button type="button" className="btn ghost" onClick={() => setNames([...names, ''])}>
            ＋ 席を増やす
          </button>
        )}
        {dupes.size > 0 && <p className="warn small">同じ名前があります：{[...dupes].join('、')}</p>}
      </section>

      <section className="panel">
        <h2>ルーム設定</h2>
        <RoomSettings config={config} players={names.length} onChange={setConfig} />
      </section>

      <button type="button" className="btn primary big" onClick={start} disabled={dupes.size > 0}>
        親を決める
      </button>
    </main>
  );
}
