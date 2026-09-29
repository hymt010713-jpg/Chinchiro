import type { Hand } from '@chinchiro/rules';
import { useEffect, useId, useMemo, useState } from 'react';
import { payNote } from '../lib/util';
import { DieFace } from './Die';

export type BowlMode = 'empty' | 'holding' | 'throwing' | 'landed';

interface Props {
  mode: BowlMode;
  dice: number[];
  hand: Hand | null;
  shonben: boolean;
  /** 投げるたびに変わる番号。賽の位置をばらけさせる */
  throwId: number;
  caption?: string;
}

type Pos = [x: number, y: number, rot: number];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function scatter(): Pos[] {
  const out: Pos[] = [];
  for (let guard = 0; out.length < 5 && guard < 3000; guard++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 25;
    const x = 50 + Math.cos(a) * r;
    const y = 50 + Math.sin(a) * r;
    if (out.every(([px, py]) => Math.hypot(px - x, py - y) > 17)) out.push([x, y, rnd(-40, 40)]);
  }
  while (out.length < 5) out.push([50, 50, 0]);
  return out;
}

function outside(): Pos[] {
  return [0, 1, 2, 3, 4].map((i) => {
    const a = ((i * 72 + rnd(20, 40)) * Math.PI) / 180;
    const r = rnd(50, 56);
    return [50 + Math.cos(a) * r, 50 + Math.sin(a) * r, rnd(-60, 60)];
  });
}

const HAND_POS: Pos[] = [
  [42, 84, -8],
  [50, 81, 10],
  [58, 84, -4],
  [46, 90, 16],
  [54, 90, -14],
];

const randFaces = () => Array.from({ length: 5 }, () => 1 + Math.floor(Math.random() * 6));

export function Bowl({ mode, dice, hand, shonben, throwId, caption }: Props) {
  const gid = useId().replace(/:/g, '');
  const final = useMemo(() => (shonben ? outside() : scatter()), [throwId, shonben]);
  const [placed, setPlaced] = useState(true);
  const [faces, setFaces] = useState<number[]>(randFaces);

  useEffect(() => {
    if (mode !== 'throwing') return;
    setPlaced(false);
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setPlaced(true));
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [mode, throwId]);

  useEffect(() => {
    if (mode !== 'holding' && mode !== 'throwing') return;
    const id = setInterval(() => setFaces(randFaces()), 70);
    return () => clearInterval(id);
  }, [mode]);

  const showDice = mode !== 'empty';
  const positions: Pos[] =
    mode === 'holding' ? HAND_POS : mode === 'throwing' && !placed ? HAND_POS : final;
  const shown = mode === 'landed' ? dice : faces;
  const used = mode === 'landed' && hand ? hand.used : null;

  return (
    <div className={`bowl mode-${mode}`}>
      <svg className="bowl-svg" viewBox="0 0 400 400" aria-hidden="true">
        <defs>
          <radialGradient id={`in${gid}`} cx="50%" cy="46%" r="55%">
            <stop offset="0" stopColor="#FBFAF6" />
            <stop offset=".62" stopColor="#EEEAE1" />
            <stop offset=".9" stopColor="#CFC8BA" />
            <stop offset="1" stopColor="#B5AD9E" />
          </radialGradient>
        </defs>
        <circle cx="200" cy="200" r="197" fill="#E9E4D9" />
        <circle cx="200" cy="200" r="194" fill="#B23428" />
        <circle cx="200" cy="200" r="194" fill="none" stroke="#D9AE55" strokeWidth="1.5" />
        {Array.from({ length: 30 }, (_, i) => (
          <path
            key={i}
            transform={`rotate(${i * 12} 200 200) translate(200 18)`}
            d="M-7 5 V-5 H6 V4 H-3 V-1 H2"
            fill="none"
            stroke="#F7F1E6"
            strokeWidth="1.8"
          />
        ))}
        <circle cx="200" cy="200" r="171" fill="none" stroke="#D9AE55" strokeWidth="1.5" />
        <circle cx="200" cy="200" r="169" fill={`url(#in${gid})`} />
        <circle cx="200" cy="208" r="52" fill="none" stroke="#35568A" strokeOpacity=".28" strokeWidth="3" />
        <text x="200" y="228" textAnchor="middle" fontSize="56" fill="#35568A" fillOpacity=".28" fontFamily="Yuji Syuku, serif">
          五
        </text>
      </svg>

      {mode === 'empty' && caption && <div className="bowl-caption">{caption}</div>}

      {showDice &&
        positions.map(([x, y, r], i) => {
          const cls = ['die'];
          if (mode === 'holding') cls.push('in-hand');
          if (used) cls.push(used.includes(i) ? 'used' : 'dim');
          if (used && hand && hand.rank < 1) cls.push('bad');
          if (mode === 'landed' && shonben) cls.push('out');
          return (
            <span
              key={i}
              className={cls.join(' ')}
              style={{ left: `${x}%`, top: `${y}%`, ['--r' as string]: `${r}deg` }}
            >
              <DieFace value={shown[i] ?? 1} />
            </span>
          );
        })}

      {mode === 'landed' && hand && (
        <div key={throwId} className={`stamp t-${hand.tier}`}>
          {hand.label}
          <small>{payNote(hand)}</small>
        </div>
      )}
    </div>
  );
}
