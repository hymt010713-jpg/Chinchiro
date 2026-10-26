import { HOLD_AFTER_LAND_MS, type Hand, type HandKey } from '@chinchiro/rules';
import { useEffect, useState, type CSSProperties } from 'react';
import { payNote } from '../lib/util';
import { FiveOfAKind } from './FiveOfAKind';

const SCENES: Partial<Record<HandKey, { theme: string; caption: string }>> = {
  yonpin: { theme: 'four', caption: '四つの一、揃い踏み。' },
  yonzoro: { theme: 'four', caption: '四つ、揃った。' },
  pinzoro: { theme: 'four', caption: '三つの一、揃い踏み。' },
  arashi: { theme: 'wind', caption: '嵐、来たる。' },
  junShintaki: { theme: 'water', caption: '流れをつかんだ。' },
  shigoro: { theme: 'four', caption: '四・五・六。' },
  hifumi: { theme: 'rain', caption: 'ああ、ヒフミ。' },
  gyakuShintaki: { theme: 'rain', caption: '流れが、逆に。' },
  shonben: { theme: 'rain', caption: '丼の外へ…。' },
};

/** 役が確定してから表示。動きを減らす設定でも、既存の演出時間内に片付ける。 */
export function HandReveal({ hand }: { hand: Hand }) {
  const [active, setActive] = useState(true);
  const duration = HOLD_AFTER_LAND_MS[hand.tier];
  useEffect(() => {
    const timer = window.setTimeout(() => setActive(false), duration);
    return () => window.clearTimeout(timer);
  }, [duration]);

  if (!active) return null;
  if (hand.key === 'gopin' || hand.key === 'gozoro') return <FiveOfAKind hand={hand} />;
  const scene = SCENES[hand.key];
  if (!scene) return null;
  return (
    <div className={`hand-reveal reveal-${scene.theme}`} aria-hidden="true"
      style={{ '--reveal-duration': `${duration}ms` } as CSSProperties}>
      <div className="reveal-motif">
        {Array.from({ length: 9 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}
      </div>
      <div className="reveal-banner">
        <span>{scene.caption}</span>
        <strong>{hand.label}</strong>
        <small>{payNote(hand)}</small>
      </div>
    </div>
  );
}
