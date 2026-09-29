/**
 * 動作確認用のBOT。部屋に入って自動で賭けて振る。
 *
 *   npx tsx scripts/bots.ts ABCD 2         部屋 ABCD に BOT を2人入れる
 *   npx tsx scripts/bots.ts --create 3     BOT 3人で部屋を作り、全員そろったら開始して最後まで遊ぶ
 *
 * 環境変数 WS_URL で接続先を変えられる（既定 ws://localhost:8787/ws）
 */
import { currentRoller, DEFAULT_CONFIG, type RoomView, type ServerMessage } from '@chinchiro/rules';
import WebSocket from 'ws';

const URL = process.env.WS_URL ?? 'ws://localhost:8787/ws';
const args = process.argv.slice(2);
const create = args[0] === '--create';
const code0 = create ? '' : (args[0] ?? '').toUpperCase();
const count = Number(args[1] ?? 2);
const NAMES = ['ぼっと壱', 'ぼっと弐', 'ぼっと参', 'ぼっと四', 'ぼっと伍'];

if (!create && !/^[A-Z0-9]{4}$/.test(code0)) {
  console.error('使い方: npx tsx scripts/bots.ts <部屋番号> [人数]  または  --create [人数]');
  process.exit(1);
}

let roomCode = code0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function bot(name: string, isCreator: boolean): Promise<void> {
  return new Promise((resolve) => {
    const ws = new WebSocket(URL);
    let me = '';
    let acted = '';
    let started = false;
    const send = (m: object) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m));

    ws.on('open', () => {
      if (isCreator) send({ t: 'create', name, config: { ...DEFAULT_CONFIG, laps: 1, shintaki: true } });
      else send({ t: 'join', code: roomCode, name });
    });

    ws.on('message', async (data) => {
      const msg = JSON.parse(String(data)) as ServerMessage;
      if (msg.t === 'error') console.log(`[${name}] ${msg.message}`);
      if (msg.t === 'welcome') {
        me = msg.you;
        if (isCreator) roomCode = msg.code;
        console.log(`[${name}] 入室 ${msg.code}`);
      }
      if (msg.t !== 'room' || !me) return;
      const room: RoomView = msg.room;
      const g = room.game;

      if (room.stage === 'lobby' && isCreator && !started && room.hostId === me && room.members.length >= count) {
        started = true;
        await sleep(500);
        send({ t: 'start' });
      }
      if (room.stage === 'finished') {
        const s = g!.scores;
        console.log(`[${name}] 終局 ${room.members.map((m) => `${m.name}:${s[m.id]}`).join(' ')}`);
        ws.close();
        return;
      }
      if (!g || room.stage !== 'playing') return;

      // 同じ場面で二度動かない
      const key = `${g.round}:${g.phase}:${g.turn}`;
      if (acted === key) return;

      if (g.phase === 'betting' && g.order.includes(me) && !room.betsDone.includes(me)) {
        acted = key;
        await sleep(400 + Math.random() * 800);
        send({ t: 'bet', units: 1 + Math.floor(Math.random() * 5) });
        await sleep(200);
        send({ t: 'betDone' });
      } else if (currentRoller(g) === me) {
        acted = key;
        // サーバーの演出待ちが明けるのを待ってから握って投げる
        const wait = Math.max(0, (room.deadline ?? 0) - room.now - 10_000) + 600;
        await sleep(wait);
        send({ t: 'hold', on: true });
        await sleep(700);
        send({ t: 'roll' });
      }
    });

    ws.on('close', () => resolve());
  });
}

const main = async () => {
  if (create) {
    const first = bot(NAMES[0]!, true);
    while (!roomCode) await sleep(50);
    const rest = NAMES.slice(1, count).map((n) => bot(n, false));
    await Promise.all([first, ...rest]);
  } else {
    await Promise.all(NAMES.slice(0, count).map((n) => bot(n, false)));
  }
};
void main();
