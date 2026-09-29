import type { GameState, Hand } from '@chinchiro/rules';
import { useEffect } from 'react';
import { MiniDice } from '../components/Die';
import { play } from '../lib/sfx';
import { SEAT_COLORS, signed } from '../lib/util';

interface Props {
  game: GameState;
  /** 渡さなければ再戦ボタンを出さない（オンラインで部屋主以外） */
  onRematch?: () => void;
  rematchLabel?: string;
  onSetup: () => void;
  setupLabel?: string;
  /** 再戦ボタンがない人向けの案内 */
  note?: string;
}

export function Result({ game, onRematch, rematchLabel = '同じメンバーでもう一局', onSetup, setupLabel = '設定に戻る', note }: Props) {
  useEffect(() => play('fanfare'), []);

  const color = (id: string) => SEAT_COLORS[game.players.findIndex((p) => p.id === id)]!;
  const nameOf = (id: string) => game.players.find((p) => p.id === id)?.name ?? id;

  const ranked = [...game.players].sort((a, b) => game.scores[b.id]! - game.scores[a.id]!);
  const rankOf = (id: string) => 1 + ranked.filter((p) => game.scores[p.id]! > game.scores[id]!).length;

  // この対局でいちばん強かった役（同じ強さなら先に出た方）
  let best: { hand: Hand; dice: number[]; who: string; round: number } | null = null;
  // 1回の勝負でいちばん大きく動いた点
  let swing: { from: string; to: string; amount: number; round: number } | null = null;
  for (const r of game.history) {
    for (const [who, roll] of Object.entries(r.rolls)) {
      if (!best || roll.hand.rank > best.hand.rank) best = { hand: roll.hand, dice: roll.dice, who, round: r.round };
    }
    for (const [id, d] of Object.entries(r.deltas)) {
      if (id === r.oya) continue;
      if (!swing || Math.abs(d) > swing.amount) {
        swing = { from: d > 0 ? r.oya : id, to: d > 0 ? id : r.oya, amount: Math.abs(d), round: r.round };
      }
    }
  }

  return (
    <main className="result">
      <h1 className="draw-title">終局</h1>
      <ol className="ranking">
        {ranked.map((p) => {
          const s = game.scores[p.id]!;
          const rank = rankOf(p.id);
          return (
            <li key={p.id} className={rank === 1 ? 'first' : ''}>
              <span className="rank num">{rank}位</span>
              <span className="av" style={{ background: color(p.id) }}>
                {[...p.name][0]}
              </span>
              <span className="rank-name">{p.name}</span>
              <span className={`rank-score num ${s > 0 ? 'p' : s < 0 ? 'm' : ''}`}>{signed(s)}</span>
            </li>
          );
        })}
      </ol>

      <section className="panel">
        <h2>持ち点の推移</h2>
        <ScoreChart game={game} color={color} />
      </section>

      <div className="highlights">
        {best && (
          <section className="panel">
            <h2>最大の役</h2>
            <p className="yk big-yk">{best.hand.label}</p>
            {best.hand.key !== 'shonben' && <MiniDice dice={best.dice} used={best.hand.used} />}
            <p className="small sub">
              第{best.round + 1}局　{nameOf(best.who)}
            </p>
          </section>
        )}
        {swing && (
          <section className="panel">
            <h2>いちばん動いた勝負</h2>
            <p className="big-num num">{swing.amount.toLocaleString('ja-JP')}点</p>
            <p className="small sub">
              第{swing.round + 1}局　{nameOf(swing.from)} → {nameOf(swing.to)}
            </p>
          </section>
        )}
      </div>

      <div className="result-actions">
        {onRematch && (
          <button type="button" className="btn primary big" onClick={onRematch}>
            {rematchLabel}
          </button>
        )}
        {note && <p className="sub small">{note}</p>}
        <button type="button" className="btn" onClick={onSetup}>
          {setupLabel}
        </button>
      </div>
    </main>
  );
}

function ScoreChart({ game, color }: { game: GameState; color: (id: string) => string }) {
  // スマホ幅でそのまま読める大きさに合わせた座標系
  const W = 360;
  const H = 200;
  const pad = { l: 48, r: 12, t: 10, b: 22 };
  const series = game.players.map((p) => [0, ...game.history.map((r) => r.scores[p.id]!)]);
  const all = series.flat();
  const lo = Math.min(0, ...all);
  const hi = Math.max(0, ...all);
  const span = hi - lo || 1;
  const n = game.history.length;
  const x = (i: number) => pad.l + (i / Math.max(n, 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + ((hi - v) / span) * (H - pad.t - pad.b);
  const every = Math.ceil(n / 8);

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="各プレイヤーの持ち点の推移">
        {[hi, 0, lo]
          .filter((v, i, a) => a.indexOf(v) === i)
          .map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className={v === 0 ? 'zero' : 'grid'} />
              <text x={pad.l - 6} y={y(v) + 3.5} textAnchor="end" className="axis num">
                {signed(v)}
              </text>
            </g>
          ))}
        {Array.from({ length: n }, (_, i) => i + 1)
          .filter((i) => i % every === 0 || i === n)
          .map((i) => (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="axis num">
              {i}局
            </text>
          ))}
        {game.players.map((p, i) => (
          <g key={p.id}>
            <polyline
              points={series[i]!.map((v, k) => `${x(k)},${y(v)}`).join(' ')}
              fill="none"
              stroke={color(p.id)}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <circle cx={x(n)} cy={y(series[i]![n]!)} r="3" fill={color(p.id)} />
          </g>
        ))}
      </svg>
      <ul className="legend">
        {game.players.map((p) => (
          <li key={p.id}>
            <i style={{ background: color(p.id) }} />
            {p.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
