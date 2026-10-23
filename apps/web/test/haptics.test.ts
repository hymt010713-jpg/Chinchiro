import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { judge } from '@chinchiro/rules';

const vibration = vi.fn(() => true);
let storage: Map<string, string>;

beforeEach(() => {
  vi.resetModules();
  vibration.mockClear();
  storage = new Map();
  vi.stubGlobal('navigator', { vibrate: vibration });
  vi.stubGlobal('document', { visibilityState: 'visible' });
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('振動', () => {
  it.each(['22223', '11112'])('四面の確定時に連続振動する：%s', async (dice) => {
    const { vibrateHand } = await import('../src/lib/haptics');
    vibrateHand(judge([...dice].map(Number), { shintaki: false }));
    expect(vibration).toHaveBeenCalledTimes(1);
    expect(vibration).toHaveBeenCalledWith([70, 50, 70, 50, 140]);
  });

  it.each(['22222', '11111'])('五面は専用の長い振動になる：%s', async (dice) => {
    const { vibrateHand } = await import('../src/lib/haptics');
    vibrateHand(judge([...dice].map(Number), { shintaki: false }));
    expect(vibration).toHaveBeenCalledTimes(1);
    expect(vibration).toHaveBeenCalledWith([100, 70, 100, 70, 180, 110, 300]);
  });

  it('OFFで即停止し、その後の演出も振動せず、次回も設定を引き継ぐ', async () => {
    const h = await import('../src/lib/haptics');
    h.setVibrationEnabled(false);
    expect(vibration).toHaveBeenCalledWith(0);
    vibration.mockClear();
    h.vibrate(100);
    h.vibrateHand(judge([1, 1, 1, 1, 1], { shintaki: false }));
    expect(vibration).not.toHaveBeenCalled();
    vi.resetModules();
    const reloaded = await import('../src/lib/haptics');
    expect(reloaded.isVibrationEnabled()).toBe(false);
    reloaded.setVibrationEnabled(true);
    reloaded.vibrate(70);
    expect(vibration).toHaveBeenCalledWith(70);
  });

  it('非対応・振動の拒否・非表示でもエラーで対局を止めない', async () => {
    const h = await import('../src/lib/haptics');
    vi.stubGlobal('navigator', {});
    expect(h.canVibrate()).toBe(false);
    expect(() => h.vibrate(100)).not.toThrow();
    expect(() => h.stopVibration()).not.toThrow();
    vi.stubGlobal('navigator', { vibrate: () => { throw new Error('not allowed'); } });
    expect(() => h.vibrate(100)).not.toThrow();
    expect(() => h.stopVibration()).not.toThrow();
    vi.stubGlobal('navigator', { vibrate: vibration });
    vi.stubGlobal('document', { visibilityState: 'hidden' });
    h.vibrate(100);
    expect(vibration).not.toHaveBeenCalled();
  });

  it('保存が禁止されていても、その場でON/OFFできる', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    });
    const h = await import('../src/lib/haptics');
    expect(h.isVibrationEnabled()).toBe(true);
    expect(() => h.setVibrationEnabled(false)).not.toThrow();
    expect(h.isVibrationEnabled()).toBe(false);
  });
});
