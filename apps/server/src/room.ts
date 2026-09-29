/**
 * 1部屋（1卓）の進行。出目・締切・演出の待ち時間はすべてここで決める。
 * 通信には依存しない（Conn に送るだけ）ので、偽の時計でテストできる。
 */
import { randomBytes } from 'node:crypto';
import {
  BET_MS,
  BOT_ROLL_MS,
  DEFAULT_CONFIG,
  DRAW_ROUND_MS,
  GameError,
  MAX_LAPS,
  MAX_PLAYERS,
  MIN_LAPS,
  MIN_PLAYERS,
  NAME_MAX,
  NEXT_ROUND_MS,
  ROLL_MS,
  closeBets,
  createGame,
  currentRoller,
  drawFirstOya,
  nextRound,
  oyaId,
  placeBet,
  revealMs,
  rollAnimMs,
  rollFor,
  type ClientMessage,
  type GameState,
  type OyaDraw,
  type RoomConfig,
  type RoomStage,
  type RoomView,
  type Rng,
  type ServerMessage,
} from '@chinchiro/rules';

export interface Conn {
  send(msg: ServerMessage): void;
}

interface Member {
  id: string;
  name: string;
  token: string;
  conn: Conn | null;
}

/** 演出の終わりと押す操作のずれを許す幅 */
const LOCK_TOLERANCE_MS = 150;

export function sanitizeConfig(c: Partial<RoomConfig> | undefined): RoomConfig {
  const raw = Math.round(Number(c?.laps));
  const laps = Number.isFinite(raw) ? Math.min(MAX_LAPS, Math.max(MIN_LAPS, raw)) : DEFAULT_CONFIG.laps;
  return {
    shintaki: c?.shintaki === true,
    shonben: c?.shonben === true,
    laps,
    unitPoints: 100,
    maxBet: 5,
  };
}

export function cleanName(raw: unknown): string {
  const name = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  const chars = [...name];
  if (chars.length === 0) throw new GameError('名前を入れてください');
  return chars.slice(0, NAME_MAX).join('');
}

export class Room {
  readonly code: string;
  hostId = '';
  config: RoomConfig;
  stage: RoomStage = 'lobby';
  draw: OyaDraw | null = null;
  game: GameState | null = null;
  betsDone = new Set<string>();
  deadline: number | null = null;
  holding: string | null = null;

  private members: Member[] = [];
  private seq = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** この時刻までは演出中なので次の投擲を受け付けない */
  private lockUntil = 0;

  constructor(
    code: string,
    config: RoomConfig,
    private readonly rng: Rng,
  ) {
    this.code = code;
    this.config = sanitizeConfig(config);
  }

  // ---------- 入退室 ----------

  addMember(rawName: string, conn: Conn): Member {
    if (this.stage !== 'lobby') throw new GameError('対局中の部屋には入れません');
    if (this.members.length >= MAX_PLAYERS) throw new GameError(`満席です（${MAX_PLAYERS}人まで）`);
    const name = cleanName(rawName);
    // 接続が切れたまま残っている同じ名前の席は、入り直しとみなして空ける
    this.members = this.members.filter((m) => m.conn || m.name !== name);
    if (!this.members.some((m) => m.id === this.hostId)) this.hostId = this.members.find((m) => m.conn)?.id ?? '';
    if (this.members.some((m) => m.name === name)) throw new GameError('同じ名前の人がいます');
    const m: Member = { id: `m${++this.seq}`, name, token: randomBytes(16).toString('hex'), conn };
    this.members.push(m);
    if (!this.hostId) this.hostId = m.id;
    // 全員への通知は、本人に welcome を送ったあとで呼び出し側が行う
    return m;
  }

  reconnect(id: string, token: string, conn: Conn): Member {
    const m = this.members.find((x) => x.id === id && x.token === token);
    if (!m) throw new GameError('部屋に戻れませんでした');
    m.conn = conn;
    if (this.stage === 'playing' && this.game && currentRoller(this.game) === id) this.scheduleRoll();
    return m;
  }

  /** 接続が切れた。席は残し（同じ鍵で戻れる）、対局中はBOTが代わりに打つ */
  disconnect(id: string) {
    const m = this.members.find((x) => x.id === id);
    if (!m) return;
    m.conn = null;
    if (this.holding === id) this.holding = null;
    if (this.stage === 'playing' && this.game) {
      if (this.game.phase === 'betting' && this.game.order.includes(id)) {
        this.betsDone.add(id);
        if (this.allBetsDone()) {
          this.closeBetsNow();
          return;
        }
      }
      if (currentRoller(this.game) === id) this.scheduleRoll();
    }
    this.passHostIfAway();
    // 全員いなくなっても進行は止めない（BOTが打つ）。部屋の片付けはサーバーが行う
    this.broadcast();
  }

  /** 自分から退室した。対局前後なら席を空け、対局中は切断と同じ扱い */
  leave(id: string) {
    if (this.stage === 'lobby' || this.stage === 'finished') {
      const m = this.members.find((x) => x.id === id);
      if (!m) return;
      m.conn = null;
      this.members = this.members.filter((x) => x !== m);
      if (this.hostId === id) this.hostId = '';
      this.passHostIfAway();
      this.broadcast();
      return;
    }
    this.disconnect(id);
  }

  /** 部屋主がいなければ、つながっている人に部屋主を渡す */
  private passHostIfAway() {
    const host = this.members.find((x) => x.id === this.hostId);
    if (host?.conn) return;
    const next = this.members.find((x) => x.conn) ?? (host ? undefined : this.members[0]);
    if (next) this.hostId = next.id;
  }

  isOnline(id: string) {
    return !!this.members.find((m) => m.id === id)?.conn;
  }

  hasConnected() {
    return this.members.some((m) => m.conn);
  }

  dispose() {
    this.clearTimer();
  }

  // ---------- 操作 ----------

  handle(id: string, msg: ClientMessage) {
    const isHost = id === this.hostId;
    switch (msg.t) {
      case 'config':
        if (!isHost) throw new GameError('設定を変えられるのは部屋を作った人だけです');
        if (this.stage !== 'lobby') throw new GameError('対局中は設定を変えられません');
        this.config = sanitizeConfig(msg.config);
        return this.broadcast();
      case 'start':
        if (!isHost) throw new GameError('開始できるのは部屋を作った人だけです');
        return this.start();
      case 'bet':
        return this.bet(id, msg.units);
      case 'betDone':
        return this.betDone(id);
      case 'hold':
        return this.hold(id, msg.on);
      case 'roll':
        return this.roll(id);
      case 'rematch':
        if (!isHost) throw new GameError('再戦を始められるのは部屋を作った人だけです');
        return this.rematch();
      default:
        throw new GameError('知らない操作です');
    }
  }

  private start() {
    if (this.stage !== 'lobby') throw new GameError('すでに始まっています');
    const players = this.members.filter((m) => m.conn);
    if (players.length < MIN_PLAYERS) throw new GameError(`${MIN_PLAYERS}人以上で始められます`);
    this.members = players;
    this.draw = drawFirstOya(players.length, this.rng);
    this.stage = 'drawing';
    this.deadline = null;
    this.schedule(Date.now() + DRAW_ROUND_MS * this.draw.rounds.length + 1500, () => this.beginGame());
    this.broadcast();
  }

  private beginGame() {
    const players = this.members.map((m) => ({ id: m.id, name: m.name }));
    this.game = createGame(players, this.config, this.draw!.index);
    this.stage = 'playing';
    this.enterBetting();
  }

  private enterBetting() {
    const g = this.game!;
    this.betsDone = new Set(g.order.filter((id) => !this.isOnline(id)));
    this.deadline = Date.now() + BET_MS;
    this.schedule(this.deadline, () => this.closeBetsNow());
    if (this.allBetsDone()) return this.closeBetsNow();
    this.broadcast();
  }

  private bet(id: string, units: number) {
    const g = this.requirePhase('betting');
    if (this.betsDone.has(id)) throw new GameError('賭けはもう決定しています');
    this.game = placeBet(g, id, units);
    this.broadcast();
  }

  private betDone(id: string) {
    const g = this.requirePhase('betting');
    if (!g.order.includes(id)) throw new GameError('親は賭けません');
    this.betsDone.add(id);
    if (this.allBetsDone()) return this.closeBetsNow();
    this.broadcast();
  }

  private allBetsDone() {
    return this.game!.order.every((id) => this.betsDone.has(id));
  }

  private closeBetsNow() {
    this.game = closeBets(this.game!);
    this.lockUntil = Date.now();
    this.scheduleRoll();
    this.broadcast();
  }

  /** 今の人の投擲を待つ。接続が切れていればBOTが振る */
  private scheduleRoll() {
    const who = currentRoller(this.game!);
    if (!who) return;
    const start = Math.max(Date.now(), this.lockUntil);
    if (this.isOnline(who)) {
      this.deadline = start + ROLL_MS;
      this.schedule(this.deadline, () => this.doRoll(who));
    } else {
      this.deadline = start + BOT_ROLL_MS;
      this.schedule(this.deadline, () => this.doRoll(who));
    }
  }

  private hold(id: string, on: boolean) {
    if (!this.game || currentRoller(this.game) !== id) return;
    const next = on ? id : null;
    if (this.holding === next) return;
    this.holding = next;
    this.broadcast();
  }

  private roll(id: string) {
    if (this.stage !== 'playing' || !this.game) throw new GameError('対局中ではありません');
    if (currentRoller(this.game) !== id) throw new GameError('あなたの番ではありません');
    if (Date.now() < this.lockUntil - LOCK_TOLERANCE_MS) throw new GameError('前の人の演出が終わるまで待ってください');
    this.doRoll(id);
  }

  private doRoll(id: string) {
    this.clearTimer();
    this.holding = null;
    const next = rollFor(this.game!, id, this.rng);
    this.game = next;
    const tier = next.rolls[id]!.hand.tier;
    this.lockUntil = Date.now() + rollAnimMs(tier);
    if (next.phase === 'settled') {
      this.lockUntil += revealMs(next.order.length);
      this.deadline = this.lockUntil + NEXT_ROUND_MS;
      this.schedule(this.deadline, () => this.advance());
    } else {
      this.scheduleRoll();
    }
    this.broadcast();
  }

  private advance() {
    this.game = nextRound(this.game!);
    if (this.game.phase === 'gameOver') {
      this.stage = 'finished';
      this.deadline = null;
      this.clearTimer();
      this.broadcast();
      return;
    }
    this.enterBetting();
  }

  private rematch() {
    if (this.stage !== 'finished') throw new GameError('対局が終わってから再戦できます');
    this.stage = 'lobby';
    // 接続が切れたままの人はここで席を空ける
    this.members = this.members.filter((m) => m.conn);
    this.game = null;
    this.draw = null;
    this.deadline = null;
    this.betsDone.clear();
    this.broadcast();
  }

  private requirePhase(phase: GameState['phase']): GameState {
    if (this.stage !== 'playing' || !this.game || this.game.phase !== phase) {
      throw new GameError('今はその操作ができません');
    }
    return this.game;
  }

  // ---------- 送信とタイマー ----------

  view(): RoomView {
    return {
      code: this.code,
      hostId: this.hostId,
      members: this.members.map((m) => ({ id: m.id, name: m.name, online: !!m.conn })),
      config: this.config,
      stage: this.stage,
      draw: this.draw,
      game: this.game,
      betsDone: [...this.betsDone],
      deadline: this.deadline,
      holding: this.holding,
      now: Date.now(),
    };
  }

  broadcast() {
    const msg: ServerMessage = { t: 'room', room: this.view() };
    for (const m of this.members) m.conn?.send(msg);
  }

  private schedule(at: number, fn: () => void) {
    this.clearTimer();
    this.timer = setTimeout(
      () => {
        this.timer = null;
        try {
          fn();
        } catch (e) {
          console.error(`[room ${this.code}]`, e);
        }
      },
      Math.max(0, at - Date.now()),
    );
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** テスト用 */
  get oya() {
    return this.game ? oyaId(this.game) : null;
  }
}
