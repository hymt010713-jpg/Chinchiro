import type { Hand } from '@chinchiro/rules';
import type { CSSProperties } from 'react';

/** 演出は役の確定後だけ表示。操作を遮らず、既存の待ち時間内に終える。 */
export function FiveOfAKind({ hand }: { hand: Hand }) {
  return (
    <div className="five-celebration" aria-hidden="true">
      <div className="five-halo" />
      <div className="five-ring" />
      {Array.from({ length: 28 }, (_, i) => (
        <i key={i} className="five-confetti" style={{
          '--x': `${(i * 37) % 100}%`,
          '--delay': `${(i % 7) * 0.09}s`,
          '--drift': `${((i % 5) - 2) * 28}px`,
          '--spin': `${(i % 2 ? 1 : -1) * (180 + i * 23)}deg`,
        } as CSSProperties} />
      ))}
      <div className="five-title">
        <span>五つ、揃った。</span>
        <strong>{hand.label}</strong>
        <small>勝てば {hand.win} 倍</small>
      </div>
    </div>
  );
}
