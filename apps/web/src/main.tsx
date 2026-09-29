import { createRoot } from 'react-dom/client';
import { App } from './App';
import { unlockAudio } from './lib/sfx';
import './styles.css';

// ブラウザは操作があるまで音を出せない。どこを触っても鳴らせるようにする
// （途中で開き直して自動で席に戻ったときも、画面に触れれば音が出る）
for (const type of ['pointerdown', 'keydown'] as const) {
  window.addEventListener(type, unlockAudio, { capture: true, passive: true });
}

createRoot(document.getElementById('root')!).render(<App />);
