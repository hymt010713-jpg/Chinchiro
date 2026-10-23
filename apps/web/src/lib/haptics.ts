import type { Hand } from '@chinchiro/rules';

const KEY = 'chinchiro-go:vibration';
let enabled = true;
try {
  enabled = localStorage.getItem(KEY) !== 'off';
} catch { /* 保存できない環境では初期設定を使う */ }

export const canVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
export const isVibrationEnabled = () => enabled;

export function stopVibration() {
  try { navigator.vibrate?.(0); } catch { /* 非対応でも続行 */ }
}

export function setVibrationEnabled(value: boolean) {
  enabled = value;
  if (!value) stopVibration();
  try { localStorage.setItem(KEY, value ? 'on' : 'off'); } catch { /* 設定はこの画面では有効 */ }
}

export function vibrate(pattern: number | number[]) {
  if (!enabled || !canVibrate()) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  try { navigator.vibrate(pattern); } catch { /* 端末側で拒否されても対局を続行 */ }
}

export function vibrateHand(hand: Hand) {
  if (hand.key === 'gopin' || hand.key === 'gozoro') {
    vibrate([100, 70, 100, 70, 180, 110, 300]);
  } else if (hand.key === 'yonpin' || hand.key === 'yonzoro') {
    vibrate([70, 50, 70, 50, 140]);
  } else if (hand.tier === 'dai') vibrate([20, 40, 60]);
  else vibrate(12);
}
