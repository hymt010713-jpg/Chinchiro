import type { RoomConfig } from '@chinchiro/rules';

interface Props {
  config: RoomConfig;
  players: number;
  /** 渡さなければ見るだけ */
  onChange?: (c: RoomConfig) => void;
}

export function RoomSettings({ config, players, onChange }: Props) {
  const ro = !onChange;
  return (
    <div className="settings">
      <label className={`switch ${ro ? 'ro' : ''}`}>
        <input
          id="cfg-shintaki"
          type="checkbox"
          checked={config.shintaki}
          disabled={ro}
          onChange={(e) => onChange?.({ ...config, shintaki: e.target.checked })}
        />
        <span>
          <b>新滝ルール</b>
          <small>23456＝順新滝（5倍）、12345＝逆新滝（5倍払い）</small>
        </span>
      </label>
      <label className={`switch ${ro ? 'ro' : ''}`}>
        <input
          id="cfg-shonben"
          type="checkbox"
          checked={config.shonben}
          disabled={ro}
          onChange={(e) => onChange?.({ ...config, shonben: e.target.checked })}
        />
        <span>
          <b>ションベン</b>
          <small>投げるたびに1%で賽が丼の外へ。最弱・1倍払い</small>
        </span>
      </label>
      <div className="laps">
        <b>周数</b>
        <div className="seg" role="radiogroup" aria-label="周数">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={config.laps === n}
              className={config.laps === n ? 'on' : ''}
              disabled={ro}
              onClick={() => onChange?.({ ...config, laps: n })}
            >
              {n}周
            </button>
          ))}
        </div>
        <small className="sub">
          全員が{config.laps}回ずつ親をやって、全{players * config.laps}局
        </small>
      </div>
    </div>
  );
}
