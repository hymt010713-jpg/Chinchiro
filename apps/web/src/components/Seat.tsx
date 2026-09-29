import type { Player, Roll } from '@chinchiro/rules';
import { payNote, signed } from '../lib/util';
import { MiniDice } from './Die';

interface Props {
  player: Player;
  color: string;
  score: number;
  isOya: boolean;
  isTurn: boolean;
  /** 子の口数。親は undefined */
  bet?: number;
  maxBet: number;
  /** 賭けの時間だけ渡す */
  onBet?: (units: number) => void;
  roll: Roll | null;
  delta: number | null;
  /** 子の振る順（1始まり）。親は undefined */
  order?: number;
  /** オンライン版：この端末の人 */
  isMe?: boolean;
  /** オンライン版：接続が切れてBOTが代わりに打っている */
  offline?: boolean;
  /** オンライン版：賭けを決定した */
  betDone?: boolean;
}

export function Seat({ player, color, score, isOya, isTurn, bet, maxBet, onBet, roll, delta, order, isMe, offline, betDone }: Props) {
  const cls = ['seat'];
  if (isOya) cls.push('oya');
  if (isTurn) cls.push('turn');
  if (delta !== null) cls.push(delta > 0 ? 'won' : 'lost');
  if (isMe) cls.push('me');
  if (offline) cls.push('offline');

  return (
    <div className={cls.join(' ')}>
      <div className="seat-head">
        <span className="av" style={{ background: color }}>
          {[...player.name][0]}
        </span>
        <span className="seat-name">{player.name}</span>
        {offline && <span className="badge bot-badge">BOT</span>}
        {isOya ? <span className="badge oya-badge">親</span> : order && <span className="badge">{order}番</span>}
      </div>
      <div className="seat-meta">
        <span className="sub">
          {isMe ? 'あなた・' : ''}
          {isOya ? (roll ? '親' : '最後に振る') : `${bet}口${betDone && !roll ? ' ✓' : ''}`}
        </span>
        <span className={`seat-score num ${score > 0 ? 'p' : score < 0 ? 'm' : ''}`}>{signed(score)}</span>
      </div>

      {onBet ? (
        <div className="chips" role="radiogroup" aria-label={`${player.name}の口数`}>
          {Array.from({ length: maxBet }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={bet === n}
              className={`chip ${bet === n ? 'on' : ''}`}
              onClick={() => onBet(n)}
            >
              {n}
            </button>
          ))}
        </div>
      ) : (
        roll && (
          <div className="seat-line">
            <span className={`seat-hand ${roll.hand.rank < 1 ? 'bad' : roll.hand.rank > 1.9 ? 'good' : ''}`}>
              {roll.hand.label}
            </span>
          </div>
        )
      )}

      {roll && !onBet && (
        <div className="seat-roll">
          {!roll.shonben && <MiniDice dice={roll.dice} used={roll.hand.used} />}
          {delta === null && <span className="sub small">{payNote(roll.hand)}</span>}
        </div>
      )}

      {delta !== null && (
        <div className={`seat-delta num ${delta > 0 ? 'p' : 'm'}`}>
          {signed(delta)}
          <span>{delta > 0 ? '勝ち' : '負け'}</span>
        </div>
      )}
    </div>
  );
}
