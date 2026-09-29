/**
 * 1卓の進行。状態は不変で、各操作は新しい状態を返す。
 * 乱数は外から渡すので、同じコードを1台版でもサーバーでも使える。
 *
 * betting → koRoll（子が時計回りに1回ずつ）→ oyaRoll（親が最後）→ settled → 次の局 or gameOver
 */
import { judge, shonbenHand, type Hand } from './hands';
import { rollDie, type Rng } from './rng';
import { settle } from './settle';

export interface RoomConfig {
  /** 新滝ルール */
  shintaki: boolean;
  /** ションベン（ONのとき投擲ごとに shonbenRate の確率で起きる） */
  shonben: boolean;
  /** 全員が親をやる回数（周数） */
  laps: number;
  /** 1口の点数 */
  unitPoints: number;
  /** 子が賭けられる最大口数 */
  maxBet: number;
}

export const DEFAULT_CONFIG: RoomConfig = {
  shintaki: false,
  shonben: false,
  laps: 3,
  unitPoints: 100,
  maxBet: 5,
};

export const SHONBEN_RATE = 0.01;
/** ルーム設定で選べる周数 */
export const MIN_LAPS = 3;
export const MAX_LAPS = 10;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

export interface Player {
  id: string;
  name: string;
}

export interface Roll {
  dice: number[];
  shonben: boolean;
  hand: Hand;
}

export interface RoundRecord {
  round: number;
  oya: string;
  bets: Record<string, number>;
  rolls: Record<string, Roll>;
  /** 点数の増減（親を含む。合計0） */
  deltas: Record<string, number>;
  /** 局が終わった時点の持ち点 */
  scores: Record<string, number>;
}

export type Phase = 'betting' | 'koRoll' | 'oyaRoll' | 'settled' | 'gameOver';

export interface GameState {
  config: RoomConfig;
  players: Player[];
  scores: Record<string, number>;
  /** 0始まりの局番号 */
  round: number;
  totalRounds: number;
  firstOyaIndex: number;
  oyaIndex: number;
  phase: Phase;
  bets: Record<string, number>;
  rolls: Record<string, Roll>;
  /** 子が振る順（親の左隣から時計回り） */
  order: string[];
  /** order のうち次に振る子の位置 */
  turn: number;
  /** settled のときの増減 */
  deltas: Record<string, number> | null;
  history: RoundRecord[];
}

export class GameError extends Error {}

export function createGame(players: Player[], config: RoomConfig, firstOyaIndex: number): GameState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new GameError(`人数は${MIN_PLAYERS}〜${MAX_PLAYERS}人`);
  }
  if (new Set(players.map((p) => p.id)).size !== players.length) {
    throw new GameError('プレイヤーIDが重複している');
  }
  if (!Number.isInteger(config.laps) || config.laps < 1) throw new GameError('周数は1以上');
  if (firstOyaIndex < 0 || firstOyaIndex >= players.length) throw new GameError('最初の親が範囲外');
  return startRound({
    config,
    players,
    scores: Object.fromEntries(players.map((p) => [p.id, 0])),
    round: 0,
    totalRounds: players.length * config.laps,
    firstOyaIndex,
    oyaIndex: firstOyaIndex,
    phase: 'betting',
    bets: {},
    rolls: {},
    order: [],
    turn: 0,
    deltas: null,
    history: [],
  });
}

function startRound(s: GameState): GameState {
  const n = s.players.length;
  const order = Array.from({ length: n - 1 }, (_, k) => s.players[(s.oyaIndex + 1 + k) % n]!.id);
  return {
    ...s,
    phase: 'betting',
    bets: Object.fromEntries(order.map((id) => [id, 1])),
    rolls: {},
    order,
    turn: 0,
    deltas: null,
  };
}

export function oyaId(s: GameState): string {
  return s.players[s.oyaIndex]!.id;
}

/** 今振る人。振る場面でなければ null */
export function currentRoller(s: GameState): string | null {
  if (s.phase === 'koRoll') return s.order[s.turn] ?? null;
  if (s.phase === 'oyaRoll') return oyaId(s);
  return null;
}

export function placeBet(s: GameState, playerId: string, units: number): GameState {
  if (s.phase !== 'betting') throw new GameError('賭けの時間ではない');
  if (!s.order.includes(playerId)) throw new GameError('親は賭けない');
  if (!Number.isInteger(units) || units < 1 || units > s.config.maxBet) {
    throw new GameError(`口数は1〜${s.config.maxBet}`);
  }
  return { ...s, bets: { ...s.bets, [playerId]: units } };
}

/** 賭けを締め切って子の投擲へ */
export function closeBets(s: GameState): GameState {
  if (s.phase !== 'betting') throw new GameError('賭けの時間ではない');
  return { ...s, phase: 'koRoll', turn: 0 };
}

export function makeRoll(config: RoomConfig, rng: Rng): Roll {
  const shonben = config.shonben && rng() < SHONBEN_RATE;
  const dice = Array.from({ length: 5 }, () => rollDie(rng));
  const hand = shonben ? shonbenHand() : judge(dice, { shintaki: config.shintaki });
  return { dice, shonben, hand };
}

/** playerId が振る。出目は rng から作る（テストでは roll を直接渡せる） */
export function rollFor(s: GameState, playerId: string, rng: Rng, fixed?: Roll): GameState {
  const roller = currentRoller(s);
  if (roller === null) throw new GameError('振る場面ではない');
  if (roller !== playerId) throw new GameError('あなたの番ではない');
  const roll = fixed ?? makeRoll(s.config, rng);
  const rolls = { ...s.rolls, [playerId]: roll };

  if (s.phase === 'koRoll') {
    const turn = s.turn + 1;
    return { ...s, rolls, turn, phase: turn >= s.order.length ? 'oyaRoll' : 'koRoll' };
  }
  return settleRound({ ...s, rolls });
}

function settleRound(s: GameState): GameState {
  const oya = oyaId(s);
  const oyaHand = s.rolls[oya]!.hand;
  const deltas: Record<string, number> = { [oya]: 0 };
  for (const ko of s.order) {
    const d = settle(s.rolls[ko]!.hand, oyaHand, s.bets[ko]!) * s.config.unitPoints;
    deltas[ko] = d;
    deltas[oya]! -= d;
  }
  const scores = { ...s.scores };
  for (const [id, d] of Object.entries(deltas)) scores[id]! += d;
  const record: RoundRecord = {
    round: s.round,
    oya,
    bets: s.bets,
    rolls: s.rolls,
    deltas,
    scores,
  };
  return { ...s, scores, deltas, phase: 'settled', history: [...s.history, record] };
}

/** 精算を見終えたら次の局へ。全員が同じ回数だけ親をやったら終局 */
export function nextRound(s: GameState): GameState {
  if (s.phase !== 'settled') throw new GameError('まだ精算していない');
  const round = s.round + 1;
  if (round >= s.totalRounds) return { ...s, round, phase: 'gameOver' };
  return startRound({ ...s, round, oyaIndex: (s.oyaIndex + 1) % s.players.length });
}

export interface OyaDraw {
  /** 振り合いの各回。各回は [プレイヤー位置, 出目] の並び */
  rounds: Array<Array<[number, number]>>;
  index: number;
}

/** 最初の親決め：全員が賽を1個振り、最大の人。同点なら同点者だけで振り直し */
export function drawFirstOya(playerCount: number, rng: Rng): OyaDraw {
  let contenders = Array.from({ length: playerCount }, (_, i) => i);
  const rounds: OyaDraw['rounds'] = [];
  for (;;) {
    const r = contenders.map((i) => [i, rollDie(rng)] as [number, number]);
    rounds.push(r);
    const top = Math.max(...r.map(([, v]) => v));
    contenders = r.filter(([, v]) => v === top).map(([i]) => i);
    if (contenders.length === 1) return { rounds, index: contenders[0]! };
  }
}
