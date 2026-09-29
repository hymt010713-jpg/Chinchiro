import type { RoomConfig } from '@chinchiro/rules';

const ROWS: Array<[string, string, string, string, 'shintaki' | 'shonben' | null]> = [
  ['五ピン', '1・1・1・1・1', '15倍', '1倍', null],
  ['五ゾロ', '5個とも同じ（2〜6）', '10倍', '1倍', null],
  ['四ピン', '1が4個', '8倍', '1倍', null],
  ['四ゾロ', '2〜6のどれかが4個', '5倍', '1倍', null],
  ['ピンゾロ', '1が3個', '5倍', '1倍', null],
  ['順新滝', '2・3・4・5・6', '5倍', '1倍', 'shintaki'],
  ['嵐', '2〜6のどれかが3個', '3倍', '1倍', null],
  ['シゴロ', '4・5・6を含む', '2倍', '1倍', null],
  ['6〜4の目', 'ペア＋1個。残り1個の最大値', '1倍', '1倍', null],
  ['ヒフミ', '1・2・3を含む', '1倍', '2倍払い', null],
  ['逆新滝', '1・2・3・4・5', '1倍', '5倍払い', 'shintaki'],
  ['ションベン', '1%で賽が丼の外へ', '1倍', '1倍', 'shonben'],
];

export function RulesSheet({ config, onClose }: { config: RoomConfig; onClose: () => void }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="役表" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>役表</h2>
          <button type="button" className="btn ghost" onClick={onClose}>
            閉じる
          </button>
        </div>
        <p className="small sub">上ほど強い。5倍の役どうし・嵐どうしなど同じ強さなら親の勝ち。目は数字で比べ、同じ目なら親の勝ち。</p>
        <p className="small">
          支払い ＝ 口数 × 勝った側の倍率 × 負けた側の払い倍率
        </p>
        <div className="tscroll">
          <table>
            <thead>
              <tr>
                <th>役</th>
                <th>条件</th>
                <th>勝ち</th>
                <th>負け</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.filter(([, , , , opt]) => opt === null || config[opt]).map(([name, cond, win, lose]) => (
                <tr key={name}>
                  <td className="yk">{name}</td>
                  <td>{cond}</td>
                  <td className="num">{win}</td>
                  <td className="num">{lose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
