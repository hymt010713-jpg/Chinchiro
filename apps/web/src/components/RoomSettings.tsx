import { MAX_LAPS, MIN_LAPS, estimateMinutes, type RoomConfig } from '@chinchiro/rules';

interface Props {
  config: RoomConfig;
  /** 人数。まだ分からないとき（部屋を作る前）は null */
  players: number | null;
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
        <div className="laps-row">
          <span className="laps-label">
            <b>周数</b>
            <small>1周＝全員が1回ずつ親をやる</small>
          </span>
          <div className="stepper">
            <button
              type="button"
              aria-label="周数を減らす"
              disabled={ro || config.laps <= MIN_LAPS}
              onClick={() => onChange?.({ ...config, laps: config.laps - 1 })}
            >
              −
            </button>
            <output aria-live="polite" className="num">
              {config.laps}周
            </output>
            <button
              type="button"
              aria-label="周数を増やす"
              disabled={ro || config.laps >= MAX_LAPS}
              onClick={() => onChange?.({ ...config, laps: config.laps + 1 })}
            >
              ＋
            </button>
          </div>
        </div>
        <small className="sub">
          {players
            ? `${players}人 × ${config.laps}周 ＝ 全${players * config.laps}局（約${estimateMinutes(players, config.laps)}分）`
            : `局数は 人数 × 周数。例：4人なら全${4 * config.laps}局（約${estimateMinutes(4, config.laps)}分）`}
        </small>
      </div>
    </div>
  );
}
