/**
 * オンライン対戦の通信の型と、サーバーと画面で共有する時間。
 * 演出の長さをサーバーも知っているので、演出中に次の人が振れてしまうことがない。
 */
import type { GameState, OyaDraw, RoomConfig } from './game';
import type { Tier } from './hands';

/** 賽が丼に落ちるまで */
export const LAND_DELAY_MS = 700;
/** 役が決まってから席に結果を出すまで（格が高いほど長く見せる） */
export const HOLD_AFTER_LAND_MS: Record<Tier, number> = {
  me: 700,
  sho: 1000,
  chu: 1400,
  dai: 2200,
  kiwami: 3600,
  make: 1400,
};
/** 精算で子1人ずつ結果を出す間隔 */
export const REVEAL_STEP_MS = 600;
/** 親決めの1回あたりの長さ */
export const DRAW_ROUND_MS = 2200;
/** 賭けの持ち時間 */
export const BET_MS = 15_000;
/** 投擲の持ち時間（過ぎると自動で振る） */
export const ROLL_MS = 10_000;
/** 精算を見終えてから次の局まで */
export const NEXT_ROUND_MS = 4_000;
/** 接続が切れた人の番が来たとき、代わりに振るまで */
export const BOT_ROLL_MS = 1_500;

/** 1回の投擲の演出にかかる時間 */
export function rollAnimMs(tier: Tier): number {
  return LAND_DELAY_MS + HOLD_AFTER_LAND_MS[tier];
}

/** 精算の演出にかかる時間（子の人数ぶん＋親） */
export function revealMs(children: number): number {
  return REVEAL_STEP_MS * (children + 1) + 300;
}

export interface MemberView {
  id: string;
  name: string;
  online: boolean;
}

export type RoomStage = 'lobby' | 'drawing' | 'playing' | 'finished';

export interface RoomView {
  code: string;
  hostId: string;
  members: MemberView[];
  config: RoomConfig;
  stage: RoomStage;
  /** 親決めの結果（drawing 以降） */
  draw: OyaDraw | null;
  game: GameState | null;
  /** 賭けを決定した子 */
  betsDone: string[];
  /** 今の場面の締切（サーバー時刻 ms）。賭け・投擲・次の局 */
  deadline: number | null;
  /** 握っている人（見た目用） */
  holding: string | null;
  /** 送信時のサーバー時刻。端末との時計のずれを直す */
  now: number;
}

export type ClientMessage =
  | { t: 'create'; name: string; config: RoomConfig }
  | { t: 'join'; code: string; name: string }
  | { t: 'rejoin'; code: string; id: string; token: string }
  | { t: 'config'; config: RoomConfig }
  | { t: 'start' }
  | { t: 'bet'; units: number }
  | { t: 'betDone' }
  | { t: 'hold'; on: boolean }
  | { t: 'roll' }
  | { t: 'rematch' }
  | { t: 'leave' };

export type ServerMessage =
  | { t: 'welcome'; code: string; you: string; token: string }
  | { t: 'room'; room: RoomView }
  | { t: 'error'; message: string; fatal?: boolean };

export const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const NAME_MAX = 8;

/**
 * 1対局のおおよその長さ（分）。1局 ≒ 賭け8秒 ＋ 1人あたり（投擲と演出と精算）4秒 ＋ 次の局まで4秒
 */
export function estimateMinutes(players: number, laps: number): number {
  const perRoundSec = 12 + 4 * players;
  return Math.max(1, Math.round((players * laps * perRoundSec) / 60));
}
