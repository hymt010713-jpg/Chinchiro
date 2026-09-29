import type { GameState } from '@chinchiro/rules';
import { unlockAudio } from '../lib/sfx';

interface Props {
  resumable: GameState | null;
  onLocal: () => void;
  onOnline: () => void;
  onResume: (g: GameState) => void;
}

export function Home({ resumable, onLocal, onOnline, onResume }: Props) {
  return (
    <main className="setup">
      <header className="setup-hero">
        <div className="eyebrow">五面チンチロ　2〜6人</div>
        <h1 className="logo">
          チンチロ<span>五</span>
        </h1>
        <p className="sub">丼に五つの賽。役の強さで親と勝負。</p>
      </header>

      <div className="mode-grid">
        <button
          type="button"
          className="mode-card"
          onClick={() => {
            unlockAudio();
            onOnline();
          }}
        >
          <b>オンラインで遊ぶ</b>
          <span>部屋を作って招待リンクを送る。それぞれ自分のスマホで参加</span>
        </button>
        <button
          type="button"
          className="mode-card"
          onClick={() => {
            unlockAudio();
            onLocal();
          }}
        >
          <b>1台で遊ぶ</b>
          <span>1つの端末を順番に回して遊ぶ</span>
        </button>
      </div>

      {resumable && (
        <section className="panel resume">
          <div>
            <b>1台版の続きがあります</b>
            <p className="small sub">
              第{resumable.round + 1}局 / {resumable.totalRounds}　{resumable.players.map((p) => p.name).join('・')}
            </p>
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => {
              unlockAudio();
              onResume(resumable);
            }}
          >
            続きから
          </button>
        </section>
      )}
    </main>
  );
}
