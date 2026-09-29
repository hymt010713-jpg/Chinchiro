/**
 * チンチロ五 オンラインサーバー。
 * - /ws     WebSocket（部屋の作成・参加・対局）
 * - /healthz 死活確認
 * - それ以外 apps/web のビルド結果を配信（同じURLで遊べる）
 */
import { randomInt } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { networkInterfaces } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GameError,
  ROOM_CODE_CHARS,
  type ClientMessage,
  type Rng,
  type ServerMessage,
} from '@chinchiro/rules';
import { WebSocket, WebSocketServer } from 'ws';
import { Room, sanitizeConfig } from './room';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';
const here = dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = resolve(process.env.STATIC_DIR ?? join(here, '../../web/dist'));
/** 誰も接続していない部屋を片付けるまで */
const EMPTY_ROOM_TTL_MS = 10 * 60_000;
/** 待合室で接続が切れたままの席を空けるまで */
const LOBBY_SEAT_TTL_MS = 2 * 60_000;
/** 1接続あたりのメッセージ数の上限（RATE_WINDOW_MS ごと） */
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 5_000;
const MAX_ROOMS = 1000;

/** サーバーの出目は暗号学的乱数から作る */
const serverRng: Rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

const rooms = new Map<string, Room>();
const emptySince = new Map<string, number>();

function newCode(): string {
  for (;;) {
    const code = Array.from({ length: 4 }, () => ROOM_CODE_CHARS[randomInt(ROOM_CODE_CHARS.length)]).join('');
    if (!rooms.has(code)) return code;
  }
}

// ---------- 静的ファイル ----------

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(req: IncomingMessage, res: ServerResponse) {
  try {
    serveStaticInner(req, res);
  } catch (e) {
    // どんなリクエストでもサーバー全体を落とさない
    console.error('[http]', e);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
}

function serveStaticInner(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(`ok rooms=${rooms.size}`);
    return;
  }
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  let file = normalize(join(STATIC_DIR, path));
  if (file !== STATIC_DIR && !file.startsWith(STATIC_DIR + sep)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(STATIC_DIR, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('画面が見つかりません。先に npm run build を実行してください。');
    return;
  }
  const isAsset = file.includes(`${join(STATIC_DIR, 'assets')}`);
  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}

// ---------- WebSocket ----------

const http = createServer(serveStatic);
const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 4096 });

interface Session {
  room: Room | null;
  memberId: string | null;
}

/** 直近の ping に応答した接続 */
const alive = new WeakSet<WebSocket>();

wss.on('connection', (ws: WebSocket) => {
  alive.add(ws);
  ws.on('pong', () => alive.add(ws));
  // 大きすぎるメッセージなどの通信エラーはこの接続だけを切る（リスナーがないとサーバーごと落ちる）
  ws.on('error', (e) => {
    console.warn('[ws]', e.message);
    ws.terminate();
  });
  let windowStart = Date.now();
  let count = 0;
  const s: Session = { room: null, memberId: null };
  const conn = {
    send(msg: ServerMessage) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
  };
  /** 別の部屋へ移る・退室する（席を空ける） */
  const leaveCurrent = () => {
    if (s.room && s.memberId) s.room.leave(s.memberId);
    s.room = null;
    s.memberId = null;
  };

  ws.on('message', (data) => {
    const now = Date.now();
    if (now - windowStart > RATE_WINDOW_MS) {
      windowStart = now;
      count = 0;
    }
    if (++count > RATE_LIMIT) {
      if (count === RATE_LIMIT + 1) conn.send({ t: 'error', message: '操作が多すぎます。少し待ってください' });
      if (count > RATE_LIMIT * 4) ws.close(1008, 'rate limit');
      return;
    }
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(data));
      if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') throw new Error();
    } catch {
      conn.send({ t: 'error', message: '送られてきた内容を読めませんでした' });
      return;
    }
    try {
      switch (msg.t) {
        case 'create': {
          if (rooms.size >= MAX_ROOMS) throw new GameError('いま部屋を作れません。少し待ってください');
          leaveCurrent();
          const room = new Room(newCode(), sanitizeConfig(msg.config), serverRng);
          rooms.set(room.code, room);
          const m = room.addMember(msg.name, conn);
          s.room = room;
          s.memberId = m.id;
          conn.send({ t: 'welcome', code: room.code, you: m.id, token: m.token });
          room.broadcast();
          break;
        }
        case 'join': {
          const room = rooms.get(String(msg.code ?? '').trim().toUpperCase());
          if (!room) throw new GameError('部屋が見つかりません。部屋番号を確かめてください');
          leaveCurrent();
          const m = room.addMember(msg.name, conn);
          s.room = room;
          s.memberId = m.id;
          conn.send({ t: 'welcome', code: room.code, you: m.id, token: m.token });
          room.broadcast();
          break;
        }
        case 'rejoin': {
          const room = rooms.get(String(msg.code ?? '').toUpperCase());
          if (!room) {
            conn.send({ t: 'error', message: '部屋はもう閉じています', fatal: true });
            return;
          }
          leaveCurrent();
          let m;
          try {
            m = room.reconnect(String(msg.id), String(msg.token), conn);
          } catch {
            conn.send({ t: 'error', message: '部屋に戻れませんでした。もう一度入り直してください', fatal: true });
            return;
          }
          s.room = room;
          s.memberId = m.id;
          emptySince.delete(room.code);
          conn.send({ t: 'welcome', code: room.code, you: m.id, token: m.token });
          room.broadcast();
          break;
        }
        case 'leave':
          leaveCurrent();
          break;
        default:
          if (!s.room || !s.memberId) throw new GameError('部屋に入っていません');
          s.room.handle(s.memberId, msg);
      }
    } catch (e) {
      if (e instanceof GameError) conn.send({ t: 'error', message: e.message });
      else {
        console.error(e);
        conn.send({ t: 'error', message: 'サーバーで問題が起きました' });
      }
    }
  });

  // 接続が切れただけなら席は残す（再接続で戻れる）
  ws.on('close', () => {
    if (s.room && s.memberId) s.room.disconnect(s.memberId, conn);
  });
});

// 応答のない接続を切り、空き部屋を片付ける
setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.has(ws)) {
      ws.terminate();
      continue;
    }
    alive.delete(ws);
    ws.ping();
  }
  const now = Date.now();
  for (const room of rooms.values()) room.pruneLobby(now, LOBBY_SEAT_TTL_MS);
  for (const [code, room] of rooms) {
    if (room.hasConnected()) {
      emptySince.delete(code);
      continue;
    }
    const since = emptySince.get(code) ?? now;
    emptySince.set(code, since);
    if (now - since > EMPTY_ROOM_TTL_MS || room.stage === 'lobby') {
      room.dispose();
      rooms.delete(code);
      emptySince.delete(code);
    }
  }
}, 30_000).unref();

http.listen(PORT, HOST, () => {
  console.log(`チンチロ五 サーバー起動: http://localhost:${PORT}`);
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  同じWi-Fiの端末から: http://${a.address}:${PORT}`);
    }
  }
  if (!existsSync(join(STATIC_DIR, 'index.html'))) {
    console.log('  （画面のビルドがありません。npm run build で作ると、このURLで遊べます）');
  }
});
