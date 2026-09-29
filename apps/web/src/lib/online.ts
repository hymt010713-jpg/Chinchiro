/**
 * オンライン対戦の接続。切れたら自動でつなぎ直し、同じ席に戻る。
 */
import type { ClientMessage, RoomConfig, RoomView, ServerMessage } from '@chinchiro/rules';
import { useCallback, useEffect, useRef, useState } from 'react';

export type OnlineStatus = 'idle' | 'connecting' | 'open' | 'reconnecting';

interface SavedSeat {
  code: string;
  id: string;
  token: string;
}

const SEAT_KEY = 'chinchiro-go:seat';
const NAME_KEY = 'chinchiro-go:name';

function wsUrl(): string {
  const env = import.meta.env.VITE_WS_URL as string | undefined;
  if (env) return env;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

/** 同じタブで再読み込みしても席に戻れるよう sessionStorage に置く（タブごとに別の人になれる） */
export function loadSeat(): SavedSeat | null {
  try {
    const raw = sessionStorage.getItem(SEAT_KEY);
    return raw ? (JSON.parse(raw) as SavedSeat) : null;
  } catch {
    return null;
  }
}
function saveSeat(seat: SavedSeat | null) {
  try {
    if (seat) sessionStorage.setItem(SEAT_KEY, JSON.stringify(seat));
    else sessionStorage.removeItem(SEAT_KEY);
  } catch {
    // 保存できなくても遊べる（再読み込みで席に戻れないだけ）
  }
}

export function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}
export function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // 無視
  }
}

export interface Online {
  status: OnlineStatus;
  room: RoomView | null;
  you: string | null;
  error: string | null;
  /** サーバー時刻 − 端末時刻 */
  offset: number;
  send: (msg: ClientMessage) => void;
  create: (name: string, config: RoomConfig) => void;
  join: (code: string, name: string) => void;
  leave: () => void;
  clearError: () => void;
}

export function useOnline(): Online {
  const [status, setStatus] = useState<OnlineStatus>('idle');
  const [room, setRoom] = useState<RoomView | null>(null);
  const [you, setYou] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  const ws = useRef<WebSocket | null>(null);
  const pending = useRef<ClientMessage | null>(null);
  const retry = useRef(0);
  const retryTimer = useRef<number | null>(null);
  const leaving = useRef(false);

  const connect = useCallback(() => {
    if (ws.current && ws.current.readyState <= WebSocket.OPEN) return;
    setStatus(retry.current > 0 ? 'reconnecting' : 'connecting');
    const sock = new WebSocket(wsUrl());
    ws.current = sock;

    sock.onopen = () => {
      retry.current = 0;
      setStatus('open');
      const seat = loadSeat();
      if (pending.current) {
        sock.send(JSON.stringify(pending.current));
        pending.current = null;
      } else if (seat) {
        sock.send(JSON.stringify({ t: 'rejoin', ...seat } satisfies ClientMessage));
      }
    };
    sock.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.t === 'welcome') {
        saveSeat({ code: msg.code, id: msg.you, token: msg.token });
        setYou(msg.you);
        setError(null);
      } else if (msg.t === 'room') {
        setRoom(msg.room);
        setOffset(msg.room.now - Date.now());
      } else if (msg.t === 'error') {
        setError(msg.message);
        if (msg.fatal) {
          saveSeat(null);
          setRoom(null);
          setYou(null);
        }
      }
    };
    sock.onclose = () => {
      if (ws.current !== sock) return;
      ws.current = null;
      if (leaving.current || !loadSeat()) {
        setStatus('idle');
        return;
      }
      // 席がある間はつなぎ直す（1, 2, 4, 8秒…最大10秒）
      const wait = Math.min(10_000, 1000 * 2 ** retry.current);
      retry.current++;
      setStatus('reconnecting');
      retryTimer.current = window.setTimeout(connect, wait);
    };
  }, []);

  // 席が残っていれば（再読み込み後など）すぐ戻る
  useEffect(() => {
    if (loadSeat()) connect();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && loadSeat() && !ws.current) connect();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [connect]);

  const send = useCallback(
    (msg: ClientMessage) => {
      const sock = ws.current;
      if (sock && sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify(msg));
      else {
        pending.current = msg;
        connect();
      }
    },
    [connect],
  );

  const create = useCallback(
    (name: string, config: RoomConfig) => {
      leaving.current = false;
      saveName(name);
      send({ t: 'create', name, config });
    },
    [send],
  );

  const join = useCallback(
    (code: string, name: string) => {
      leaving.current = false;
      saveName(name);
      send({ t: 'join', code, name });
    },
    [send],
  );

  const leave = useCallback(() => {
    leaving.current = true;
    const sock = ws.current;
    if (sock && sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({ t: 'leave' } satisfies ClientMessage));
    saveSeat(null);
    setRoom(null);
    setYou(null);
    sock?.close();
    ws.current = null;
    setStatus('idle');
  }, []);

  return { status, room, you, error, offset, send, create, join, leave, clearError: () => setError(null) };
}
