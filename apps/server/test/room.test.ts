import { DEFAULT_CONFIG, GameError, currentRoller, mulberry32, type RoomView, type ServerMessage } from '@chinchiro/rules';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Room, cleanName, sanitizeConfig } from '../src/room';

class FakeConn {
  last: RoomView | null = null;
  count = 0;
  send(msg: ServerMessage) {
    if (msg.t === 'room') {
      this.last = msg.room;
      this.count++;
    }
  }
}

function setup(n: number, laps = 3) {
  const room = new Room('TEST', { ...DEFAULT_CONFIG, laps }, mulberry32(1));
  const conns = Array.from({ length: n }, () => new FakeConn());
  const ms = conns.map((c, i) => room.addMember(`P${i}`, c));
  return { room, conns, ids: ms.map((m) => m.id), tokens: ms.map((m) => m.token) };
}

/** 時計を進める */
const tick = (ms = 60_000) => vi.advanceTimersByTime(ms);
/** 親決めが終わって賭けの時間になるまで進める */
function untilBetting(room: Room) {
  for (let i = 0; i < 100 && room.game?.phase !== 'betting'; i++) tick(250);
  expect(room.game?.phase).toBe('betting');
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('入室', () => {
  it('最初の人が部屋主。6人まで。同じ名前は不可', () => {
    const { room, ids } = setup(6);
    expect(room.hostId).toBe(ids[0]);
    expect(() => room.addMember('P9', new FakeConn())).toThrow('満席');
    const r2 = new Room('X', DEFAULT_CONFIG, mulberry32(1));
    r2.addMember('あおい', new FakeConn());
    expect(() => r2.addMember('あおい', new FakeConn())).toThrow('同じ名前');
  });

  it('名前は前後の空白と制御文字を除き8文字まで。空は不可', () => {
    expect(cleanName('  あいうえおかきくけこ ')).toBe('あいうえおかきく');
    expect(() => cleanName('   ')).toThrow(GameError);
  });

  it('設定は想定外の値を正す。周数は3〜10', () => {
    expect(sanitizeConfig({ laps: 99, shintaki: 'yes' as unknown as boolean })).toEqual({
      ...DEFAULT_CONFIG,
      laps: 10,
    });
    expect(sanitizeConfig({ laps: 1 }).laps).toBe(3);
    expect(sanitizeConfig({ laps: 7 }).laps).toBe(7);
    expect(sanitizeConfig({ laps: 'x' as unknown as number }).laps).toBe(3);
    expect(sanitizeConfig(undefined).laps).toBe(3);
  });

  it('ロビーで部屋主が退室すると次の人が部屋主', () => {
    const { room, ids } = setup(3);
    room.leave(ids[0]!);
    expect(room.hostId).toBe(ids[1]);
    expect(room.view().members).toHaveLength(2);
  });

  it('ロビーや終局後に接続が切れても席は残り、同じ鍵で戻れる', () => {
    const { room, ids, tokens } = setup(3);
    room.disconnect(ids[1]!);
    expect(room.view().members.find((m) => m.id === ids[1])?.online).toBe(false);
    room.reconnect(ids[1]!, tokens[1]!, new FakeConn());
    expect(room.view().members).toHaveLength(3);
    room.handle(ids[0]!, { t: 'start' });
    for (let i = 0; i < 200 && room.stage !== 'finished'; i++) tick(20_000);
    room.disconnect(ids[2]!);
    room.reconnect(ids[2]!, tokens[2]!, new FakeConn());
    expect(room.view().members).toHaveLength(3);
  });

  it('再戦のとき、接続が切れたままの人は外れる', () => {
    const { room, ids } = setup(3);
    room.handle(ids[0]!, { t: 'start' });
    for (let i = 0; i < 200 && room.stage !== 'finished'; i++) tick(20_000);
    room.disconnect(ids[2]!);
    room.handle(ids[0]!, { t: 'rematch' });
    expect(room.view().members.map((m) => m.id)).toEqual([ids[0], ids[1]]);
  });

  it('待合室で2分以上接続が切れたままの席は空く', () => {
    const { room, ids } = setup(3);
    room.disconnect(ids[0]!);
    room.pruneLobby(Date.now() + 60_000, 120_000);
    expect(room.view().members).toHaveLength(3);
    room.pruneLobby(Date.now() + 121_000, 120_000);
    expect(room.view().members.map((m) => m.id)).toEqual([ids[1], ids[2]]);
    expect(room.hostId).toBe(ids[1]);
  });

  it('部屋主以外は開始できない。1人では開始できない', () => {
    const { room, ids } = setup(2);
    expect(() => room.handle(ids[1]!, { t: 'start' })).toThrow('部屋を作った人');
    const solo = new Room('S', DEFAULT_CONFIG, mulberry32(1));
    const m = solo.addMember('ひとり', new FakeConn());
    expect(() => solo.handle(m.id, { t: 'start' })).toThrow('2人以上');
  });
});

describe('対局', () => {
  it('誰も操作しなくても締切とBOTで最後まで進み、合計0で終わる', () => {
    const { room, ids, conns } = setup(4, 3);
    room.handle(ids[0]!, { t: 'start' });
    expect(room.stage).toBe('drawing');
    expect(() => room.addMember('途中', new FakeConn())).toThrow('対局中');
    for (let i = 0; i < 500 && room.stage !== 'finished'; i++) tick(20_000);
    expect(room.stage).toBe('finished');
    const g = room.view().game!;
    expect(g.history).toHaveLength(12);
    expect(Object.values(g.scores).reduce((a, b) => a + b, 0)).toBe(0);
    expect(conns[3]!.last!.stage).toBe('finished');
  });

  it('賭けは本人だけが決められ、全員決定したら子の投擲へ', () => {
    const { room, ids } = setup(3);
    room.handle(ids[0]!, { t: 'start' });
    untilBetting(room);
    expect(room.game!.phase).toBe('betting');
    const kids = room.game!.order;
    room.handle(kids[0]!, { t: 'bet', units: 5 });
    room.handle(kids[0]!, { t: 'betDone' });
    expect(() => room.handle(kids[0]!, { t: 'bet', units: 2 })).toThrow('決定しています');
    expect(() => room.handle(room.oya!, { t: 'betDone' })).toThrow('親は賭けません');
    room.handle(kids[1]!, { t: 'betDone' });
    expect(room.game!.phase).toBe('koRoll');
    expect(room.game!.bets[kids[0]!]).toBe(5);
  });

  it('自分の番以外は振れず、前の演出中も振れない', () => {
    const { room, ids } = setup(3);
    room.handle(ids[0]!, { t: 'start' });
    untilBetting(room);
    for (const k of room.game!.order) room.handle(k, { t: 'betDone' });
    const first = currentRoller(room.game!)!;
    const other = room.game!.order[1]!;
    expect(() => room.handle(other, { t: 'roll' })).toThrow('あなたの番ではありません');
    room.handle(first, { t: 'roll' });
    expect(() => room.handle(other, { t: 'roll' })).toThrow('演出');
    tick(5_000);
    room.handle(other, { t: 'roll' });
    expect(room.game!.phase).toBe('oyaRoll');
  });

  it('投擲の持ち時間が過ぎたら自動で振る', () => {
    const { room, ids } = setup(2);
    room.handle(ids[0]!, { t: 'start' });
    untilBetting(room);
    for (const k of room.game!.order) room.handle(k, { t: 'betDone' });
    const who = currentRoller(room.game!)!;
    tick(9_000);
    expect(room.game!.rolls[who]).toBeUndefined();
    tick(1_500);
    expect(room.game!.rolls[who]).toBeDefined();
  });

  it('対局中に切断した人の番はBOTがすぐ振り、同じ鍵で戻れる', () => {
    const { room, ids, tokens } = setup(3);
    room.handle(ids[0]!, { t: 'start' });
    untilBetting(room);
    const kids = room.game!.order;
    room.disconnect(kids[0]!);
    // 切断した子は賭けを決定済み扱い
    expect(room.betsDone.has(kids[0]!)).toBe(true);
    room.handle(kids[1]!, { t: 'betDone' });
    expect(currentRoller(room.game!)).toBe(kids[0]);
    tick(1_600);
    expect(room.game!.rolls[kids[0]!]).toBeDefined();

    const idx = ids.indexOf(kids[0]!);
    expect(() => room.reconnect(kids[0]!, 'wrong', new FakeConn())).toThrow();
    const back = new FakeConn();
    room.reconnect(kids[0]!, tokens[idx]!, back);
    room.broadcast(); // サーバーは welcome を送ってから全員に知らせる
    expect(back.last?.members.find((m) => m.id === kids[0])?.online).toBe(true);
  });

  it('回線の切り替えで新しい接続が先に戻ったあと、古い接続の切断が届いても席はオフラインにならない', () => {
    const { room, ids, tokens, conns } = setup(3);
    const fresh = new FakeConn();
    room.reconnect(ids[1]!, tokens[1]!, fresh);
    room.disconnect(ids[1]!, conns[1]!); // 古い接続の切断
    expect(room.isOnline(ids[1]!)).toBe(true);
    room.disconnect(ids[1]!, fresh);
    expect(room.isOnline(ids[1]!)).toBe(false);
  });

  it('対局中は過去の局の記録を送らず、終局後だけ送る', () => {
    const { room, ids, conns } = setup(2);
    room.handle(ids[0]!, { t: 'start' });
    for (let i = 0; i < 400 && room.stage === 'drawing'; i++) tick(250);
    for (let i = 0; i < 400 && (room.game?.history.length ?? 0) < 2; i++) tick(1_000);
    expect(room.game!.history.length).toBeGreaterThanOrEqual(2);
    expect(conns[0]!.last!.game!.history).toEqual([]);
    for (let i = 0; i < 400 && room.stage !== 'finished'; i++) tick(20_000);
    expect(conns[0]!.last!.game!.history).toHaveLength(6);
  });

  it('投擲が断られたら「握っている」表示を戻す', () => {
    const { room, ids } = setup(3);
    room.handle(ids[0]!, { t: 'start' });
    untilBetting(room);
    for (const k of room.game!.order) room.handle(k, { t: 'betDone' });
    const first = currentRoller(room.game!)!;
    room.handle(first, { t: 'roll' });
    const next = currentRoller(room.game!)!;
    room.handle(next, { t: 'hold', on: true });
    expect(room.holding).toBe(next);
    expect(() => room.handle(next, { t: 'roll' })).toThrow('演出');
    expect(room.holding).toBeNull();
  });

  it('終局後、部屋主は再戦でロビーに戻せる', () => {
    const { room, ids } = setup(2);
    room.handle(ids[0]!, { t: 'start' });
    for (let i = 0; i < 200 && room.stage !== 'finished'; i++) tick(20_000);
    room.handle(ids[0]!, { t: 'rematch' });
    expect(room.stage).toBe('lobby');
    expect(room.game).toBeNull();
    room.handle(ids[0]!, { t: 'start' });
    expect(room.stage).toBe('drawing');
  });
});
