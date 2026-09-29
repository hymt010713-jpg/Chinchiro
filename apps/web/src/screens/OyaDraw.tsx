import { DRAW_ROUND_MS, drawFirstOya, type OyaDraw as Draw, type Player } from '@chinchiro/rules';
import { useEffect, useMemo, useState } from 'react';
import { DieFace } from '../components/Die';
import { play } from '../lib/sfx';
import { SEAT_COLORS, cryptoRng } from '../lib/util';

interface Props {
  players: Player[];
  /** オンライン版はサーバーが決めた結果を渡す。なければこの端末で振る */
  draw?: Draw;
  /** 1台版だけ。オンライン版はサーバーが次へ進める */
  onDone?: (index: number) => void;
}

/** 最初の親決め：全員が賽を1個振り、最大の人。同点者だけで振り直し */
export function OyaDraw({ players, draw: given, onDone }: Props) {
  const draw = useMemo(() => given ?? drawFirstOya(players.length, cryptoRng), [given, players]);
  const [step, setStep] = useState(0);
  const [landed, setLanded] = useState(false);
  const [flicker, setFlicker] = useState(1);

  useEffect(() => {
    setLanded(false);
    play('shake');
    const f = setInterval(() => setFlicker(1 + Math.floor(Math.random() * 6)), 70);
    const t1 = setTimeout(() => {
      clearInterval(f);
      setLanded(true);
      play('throwLand');
    }, 900);
    const t2 =
      step < draw.rounds.length - 1
        ? setTimeout(() => setStep((s) => s + 1), DRAW_ROUND_MS)
        : setTimeout(() => play('turn'), 1500);
    return () => {
      clearInterval(f);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [step, draw]);

  const round = draw.rounds[step]!;
  const done = landed && step === draw.rounds.length - 1;
  const top = landed ? Math.max(...round.map(([, v]) => v)) : 0;
  const winner = players[draw.index]!;

  return (
    <main className="draw">
      <h1 className="draw-title">親決め</h1>
      <p className="sub">全員が賽を1個振り、いちばん大きい目の人が最初の親です。</p>
      {step > 0 && <p className="small warn">同点だった人だけで振り直し（{step + 1}回目）</p>}
      <ul className="draw-list">
        {round.map(([i, v]) => (
          <li key={i} className={landed && v === top ? 'top' : ''}>
            <span className="av" style={{ background: SEAT_COLORS[i] }}>
              {[...players[i]!.name][0]}
            </span>
            <span className="draw-name">{players[i]!.name}</span>
            <span className={`draw-die ${landed ? '' : 'shaking'}`}>
              <DieFace value={landed ? v : flicker} />
            </span>
          </li>
        ))}
      </ul>
      <div className="draw-foot">
        {done ? (
          <>
            <p className="draw-result">
              最初の親は <b>{winner.name}</b>
            </p>
            {onDone ? (
              <button type="button" className="btn primary big" onClick={() => onDone(draw.index)}>
                対局開始
              </button>
            ) : (
              <p className="sub">まもなく対局が始まります</p>
            )}
          </>
        ) : (
          <p className="sub">振っています…</p>
        )}
      </div>
    </main>
  );
}
