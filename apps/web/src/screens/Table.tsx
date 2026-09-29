/**
 * 対局画面。1台版とオンライン版で共通。
 * 演出は「状態に新しい投擲が増えたこと」をきっかけに再生するので、
 * 自分が振っても、他の人の投擲がサーバーから届いても同じように見える。
 */
import {
  LAND_DELAY_MS,
  REVEAL_STEP_MS,
  currentRoller,
  oyaId,
  rollAnimMs,
  type GameState,
  type Roll,
  type Tier,
} from '@chinchiro/rules';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bowl, type BowlMode } from '../components/Bowl';
import { RulesSheet } from '../components/RulesSheet';
import { Seat } from '../components/Seat';
import { isMuted, play, playHand, setMuted, unlockAudio } from '../lib/sfx';
import { SEAT_COLORS, signed, vibrate } from '../lib/util';

export interface TableControls {
  /** この端末で操作する人。null なら全員（1台版） */
  me: string | null;
  bet: (id: string, units: number) => void;
  /** 1台版：賭けを締め切る */
  closeBets?: () => void;
  /** オンライン版：自分の賭けを決定する */
  betDone?: () => void;
  betsDone?: string[];
  roll: () => void;
  /** オンライン版：握っていることを他の人に見せる */
  hold?: (on: boolean) => void;
  /** オンライン版：いま握っている人 */
  holding?: string | null;
  /** 1台版：次の局へ */
  next?: () => void;
  /** 端末時刻に直した締切（オンライン版） */
  deadline?: number | null;
  offline?: string[];
  /** 通信が切れていて操作できない */
  disconnected?: boolean;
}

interface Props {
  game: GameState;
  controls: TableControls;
  onExit: () => void;
  exitLabel: string;
  /** 部屋番号など、上部に出す補足 */
  badge?: string;
}

interface Anim {
  mode: BowlMode;
  roll: Roll | null;
  throwId: number;
}

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export function Table({ game, controls, onExit, exitLabel, badge }: Props) {
  const { me } = controls;
  const [anim, setAnim] = useState<Anim>({ mode: 'empty', roll: null, throwId: 0 });
  /** 演出が終わるまで席に結果を出さない人 */
  const [hidden, setHidden] = useState<string[]>([]);
  /** 精算：何人目の子まで結果を出したか。子の人数＋1で親も */
  const [revealed, setRevealed] = useState(game.phase === 'settled' ? Infinity : -1);
  const [busy, setBusy] = useState(false);
  const [holdingLocal, setHoldingLocal] = useState(false);
  const [power, setPower] = useState(0);
  const [showRules, setShowRules] = useState(false);
  const [muted, setMutedState] = useState(isMuted());
  const [confirmExit, setConfirmExit] = useState(false);

  const feltRef = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const hold = useRef<{ loop: number; raf: number } | null>(null);
  const gameRef = useRef(game);
  gameRef.current = game;
  const prevRef = useRef(game);
  const queue = useRef<string[]>([]);
  const animating = useRef(false);
  const throwSeq = useRef(0);
  const lastTick = useRef(-1);

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(
    () => () => {
      clearTimers();
      if (hold.current) {
        clearInterval(hold.current.loop);
        cancelAnimationFrame(hold.current.raf);
      }
    },
    [],
  );

  const oya = oyaId(game);
  const roller = currentRoller(game);
  const nameOf = (id: string) => game.players.find((p) => p.id === id)?.name ?? id;
  const unit = game.config.unitPoints;
  const canControl = (id: string | null) => !!id && (me === null || me === id);
  const canRoll = canControl(roller) && !busy && !controls.disconnected;

  const effects = (tier: Tier, bad: boolean) => {
    const felt = feltRef.current;
    if (felt) {
      felt.classList.remove('fx-shake', 'fx-glow');
      void felt.offsetWidth;
      if (tier === 'chu' || tier === 'dai' || tier === 'kiwami') felt.classList.add('fx-shake');
      if (tier === 'dai' || tier === 'kiwami') felt.classList.add('fx-glow');
      felt.classList.toggle('fx-dim', bad);
    }
    if (tier === 'kiwami') {
      const f = document.getElementById('flash');
      if (f) {
        f.classList.remove('on');
        void f.offsetWidth;
        f.classList.add('on');
      }
      vibrate([30, 60, 30, 60, 120]);
    } else if (tier === 'dai') vibrate([20, 40, 60]);
    else vibrate(12);
  };

  const finishAnim = () => {
    animating.current = false;
    setBusy(false);
    const g = gameRef.current;
    const who = currentRoller(g);
    if (who && queue.current.length === 0 && (me === null || me === who)) play('turn');
    pump();
  };

  const startReveal = (g: GameState) => {
    setRevealed(0);
    const n = g.order.length;
    const step = (i: number) => {
      setRevealed(i);
      if (i <= n) {
        const units = Math.abs(g.deltas![g.order[i - 1]!]!) / unit;
        play(units >= 10 ? 'bigCoins' : units >= 3 ? 'coins' : 'coin');
        later(REVEAL_STEP_MS, () => step(i + 1));
      } else later(300, finishAnim);
    };
    later(REVEAL_STEP_MS, () => step(1));
  };

  /** 待っている投擲の演出を1つずつ再生する */
  const pump = () => {
    if (animating.current) return;
    const id = queue.current.shift();
    if (!id) return;
    const g = gameRef.current;
    const roll = g.rolls[id];
    if (!roll) return pump();
    const round = g.round;
    animating.current = true;
    setBusy(true);
    const throwId = ++throwSeq.current;
    feltRef.current?.classList.remove('fx-dim');
    setAnim({ mode: 'throwing', roll, throwId });
    play('throwLand');
    later(LAND_DELAY_MS, () => {
      setAnim({ mode: 'landed', roll, throwId });
      playHand(roll.hand);
      effects(roll.hand.tier, roll.hand.rank < 1);
    });
    later(rollAnimMs(roll.hand.tier), () => {
      setHidden((h) => h.filter((x) => x !== id));
      const now = gameRef.current;
      if (now.round === round && now.phase === 'settled' && id === oyaId(now)) startReveal(now);
      else finishAnim();
    });
  };

  // 状態の変化を見て、新しい投擲の演出を始める
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = game;
    if (prev === game) return;
    if (game.round !== prev.round) {
      clearTimers();
      queue.current = [];
      animating.current = false;
      setBusy(false);
      setHidden([]);
      setRevealed(-1);
      feltRef.current?.classList.remove('fx-dim');
      setAnim((a) => ({ mode: 'empty', roll: null, throwId: a.throwId }));
      if (game.phase === 'betting') play('turn');
      return;
    }
    const fresh = Object.keys(game.rolls).filter((id) => !prev.rolls[id]);
    if (fresh.length === 0) return;
    setHidden((h) => [...h, ...fresh]);
    queue.current.push(...fresh);
    pump();
    // pump は ref だけを読むので依存は game だけでよい
  }, [game]);

  // ---------- 握る・投げる ----------

  const startHold = useCallback(() => {
    if (!canRoll || hold.current) return;
    unlockAudio();
    feltRef.current?.classList.remove('fx-dim');
    play('shake');
    vibrate(15);
    const start = performance.now();
    const tick = () => {
      if (!hold.current) return;
      const t = ((performance.now() - start) / 1200) % 2;
      setPower(t < 1 ? t : 2 - t);
      hold.current.raf = requestAnimationFrame(tick);
    };
    hold.current = { loop: window.setInterval(() => play('shake'), 780), raf: requestAnimationFrame(tick) };
    setHoldingLocal(true);
    controls.hold?.(true);
  }, [canRoll, controls]);

  const release = useCallback(() => {
    if (!hold.current) return;
    clearInterval(hold.current.loop);
    cancelAnimationFrame(hold.current.raf);
    hold.current = null;
    setHoldingLocal(false);
    setPower(0);
    controls.roll();
  }, [controls]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || showRules) return;
      if ((e.target as HTMLElement)?.closest('input,textarea')) return;
      e.preventDefault();
      startHold();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      e.preventDefault();
      release();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [startHold, release, showRules]);

  // ---------- 締切 ----------

  const now = useNow(!!controls.deadline);
  const remain = controls.deadline ? Math.max(0, Math.ceil((controls.deadline - now) / 1000)) : null;
  const myTurnToAct =
    (game.phase === 'betting' && !!me && game.order.includes(me) && !controls.betsDone?.includes(me)) ||
    (!!me && roller === me && !busy);
  useEffect(() => {
    if (remain === null || !myTurnToAct) return;
    if (remain <= 3 && remain > 0 && remain !== lastTick.current) play('tick');
    lastTick.current = remain;
  }, [remain, myTurnToAct]);

  // ---------- 表示 ----------

  const isRevealed = (id: string) => {
    if (game.phase !== 'settled') return false;
    const k = game.order.indexOf(id);
    return k === -1 ? revealed > game.order.length : revealed > k;
  };
  const settledNow = game.phase === 'settled';
  const koDone = game.phase === 'koRoll' ? game.turn : game.order.length;
  const lastRound = game.round + 1 >= game.totalRounds;
  const otherHolding = !!controls.holding && controls.holding !== me && !busy;
  const bowlMode: BowlMode = holdingLocal || otherHolding ? 'holding' : anim.mode;
  const iAmKo = !!me && game.order.includes(me);
  const myBetDone = !!me && !!controls.betsDone?.includes(me);
  const timer = remain !== null && <span className={`timer num ${remain <= 3 ? 'low' : ''}`}>{remain}秒</span>;

  let caption = '';
  if (game.phase === 'betting') caption = '子は口数を選んでください';
  else if (roller) caption = `${nameOf(roller)}の番`;

  const exit = () => {
    if (me !== null && !confirmExit) {
      setConfirmExit(true);
      later(3000, () => setConfirmExit(false));
      return;
    }
    onExit();
  };

  return (
    <div className="table-screen">
      <header className="topbar">
        <div className="round num">
          第{game.round + 1}局<small> / {game.totalRounds}</small>
        </div>
        <div className="topbar-oya">
          親：<b>{nameOf(oya)}</b>
        </div>
        <div className="topbar-rules">
          {badge && <span className="tag code-tag">{badge}</span>}
          {game.config.shintaki && <span className="tag">新滝</span>}
          {game.config.shonben && <span className="tag">ションベン</span>}
        </div>
        <div className="topbar-actions">
          <button type="button" className="btn ghost" onClick={() => setShowRules(true)}>
            役表
          </button>
          <button
            type="button"
            className="btn ghost"
            aria-pressed={!muted}
            onClick={() => {
              setMuted(!muted);
              setMutedState(!muted);
            }}
          >
            {muted ? '音なし' : '音あり'}
          </button>
          <button type="button" className={`btn ghost ${confirmExit ? 'danger' : ''}`} onClick={exit}>
            {confirmExit ? 'もう一度押すと退室' : exitLabel}
          </button>
        </div>
      </header>

      {controls.disconnected && <div className="conn-banner">通信が切れました。つなぎ直しています…</div>}

      <div className="table-main">
        <section className="seats" aria-label="席">
          {game.players.map((p, i) => {
            const isOya = p.id === oya;
            const r = game.rolls[p.id];
            const shownRoll = r && !hidden.includes(p.id) ? r : null;
            const rev = isRevealed(p.id);
            const delta = rev ? game.deltas![p.id]! : null;
            const score = settledNow && !rev ? game.scores[p.id]! - game.deltas![p.id]! : game.scores[p.id]!;
            const k = game.order.indexOf(p.id);
            const betOpen =
              game.phase === 'betting' && !isOya && canControl(p.id) && !controls.betsDone?.includes(p.id);
            return (
              <Seat
                key={p.id}
                player={p}
                color={SEAT_COLORS[i]!}
                score={score}
                isOya={isOya}
                isTurn={roller === p.id && !busy}
                bet={isOya ? undefined : game.bets[p.id]}
                maxBet={game.config.maxBet}
                onBet={
                  betOpen
                    ? (n) => {
                        play('tap');
                        controls.bet(p.id, n);
                      }
                    : undefined
                }
                roll={shownRoll}
                delta={delta}
                order={k === -1 ? undefined : k + 1}
                isMe={me !== null && me === p.id}
                offline={controls.offline?.includes(p.id)}
                betDone={controls.betsDone?.includes(p.id)}
              />
            );
          })}
        </section>

        <section className="felt" ref={feltRef}>
          <Bowl
            mode={bowlMode}
            dice={anim.roll?.dice ?? []}
            hand={anim.roll?.hand ?? null}
            shonben={anim.roll?.shonben ?? false}
            throwId={anim.throwId}
            caption={caption}
          />
        </section>
      </div>

      <footer className="action">
        {game.phase === 'betting' &&
          (me === null ? (
            <>
              <p className="action-text">
                子（{game.order.map(nameOf).join('・')}）は口数を選んでください。1口＝{unit}点
              </p>
              <button
                type="button"
                className="btn primary big"
                onClick={() => {
                  unlockAudio();
                  controls.closeBets?.();
                }}
              >
                賭けを締め切る
              </button>
            </>
          ) : iAmKo && !myBetDone ? (
            <>
              <p className="action-text">
                口数を選んで決定してください（1口＝{unit}点） {timer}
              </p>
              <button
                type="button"
                className="btn primary big"
                disabled={controls.disconnected}
                onClick={() => {
                  unlockAudio();
                  play('tap');
                  controls.betDone?.();
                }}
              >
                {game.bets[me!] ?? 1}口で決定
              </button>
            </>
          ) : (
            <p className="action-text">
              {iAmKo ? '決定しました。' : 'あなたは親です。'}
              子の賭けを待っています（{controls.betsDone?.length ?? 0} / {game.order.length}） {timer}
            </p>
          ))}

        {(game.phase === 'koRoll' || game.phase === 'oyaRoll') && roller && (
          <>
            <p className="action-text">
              {busy ? (
                '…'
              ) : canControl(roller) ? (
                game.phase === 'oyaRoll' ? (
                  <>
                    <b>{me === null ? `親 ${nameOf(roller)}` : 'あなた（親）'}</b> の番。これで全員の勝負が決まります {timer}
                  </>
                ) : (
                  <>
                    <b>{me === null ? nameOf(roller) : 'あなた'}</b> の番（子 {koDone + 1} / {game.order.length}） {timer}
                  </>
                )
              ) : (
                <>
                  <b>{nameOf(roller)}</b>
                  {game.phase === 'oyaRoll' ? '（親）' : ''} が振るのを待っています
                  {controls.offline?.includes(roller) ? '（BOTが代わりに振ります）' : ''} {timer}
                </>
              )}
            </p>
            {canControl(roller) && (
              <>
                <button
                  type="button"
                  className={`rollbtn ${holdingLocal ? 'holding' : ''}`}
                  disabled={!canRoll}
                  onPointerDown={(e) => {
                    try {
                      e.currentTarget.setPointerCapture(e.pointerId);
                    } catch {
                      // 取り込めなくても振れる
                    }
                    startHold();
                  }}
                  onPointerUp={release}
                  onPointerCancel={release}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  {holdingLocal ? '離して投げる' : '長押しで握る'}
                  <span className="gauge" aria-hidden="true">
                    <i style={{ width: `${Math.round(power * 100)}%` }} />
                  </span>
                </button>
                <p className="small sub keyhint">PCはスペースキー長押しでも振れます</p>
              </>
            )}
          </>
        )}

        {settledNow && (
          <>
            <p className="action-text">
              {busy ? (
                '精算中…'
              ) : (
                <>
                  親 {nameOf(oya)}：
                  <b className={game.deltas![oya]! >= 0 ? 'p' : 'm'}>{signed(game.deltas![oya]!)}点</b>
                  {!controls.next && remain !== null && (
                    <span className="sub">　{lastRound ? '結果発表' : '次の局'}まで {remain}秒</span>
                  )}
                </>
              )}
            </p>
            {controls.next && (
              <button type="button" className="btn primary big" onClick={controls.next} disabled={busy}>
                {lastRound ? '結果を見る' : '次の局へ'}
              </button>
            )}
          </>
        )}
      </footer>

      {showRules && <RulesSheet config={game.config} onClose={() => setShowRules(false)} />}
    </div>
  );
}
