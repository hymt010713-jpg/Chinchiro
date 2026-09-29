const PIPS: Record<number, Array<[number, number]>> = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[27, 27], [50, 50], [73, 73]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[27, 27], [73, 27], [50, 50], [27, 73], [73, 73]],
  6: [[29, 25], [29, 50], [29, 75], [71, 25], [71, 50], [71, 75]],
};

/** 和賽：象牙色、一の目だけ大きな朱 */
export function DieFace({ value }: { value: number }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="die-face">
      <rect x="3" y="3" width="94" height="94" rx="20" fill="#F6F0E2" stroke="#CFC2A6" strokeWidth="2" />
      <rect x="9" y="9" width="82" height="82" rx="15" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="2" />
      {value === 1 ? (
        <>
          <circle cx="50" cy="50" r="15.5" fill="#C8281E" stroke="#8E1A13" strokeWidth="2" />
          <circle cx="46" cy="45" r="5" fill="#fff" fillOpacity=".25" />
        </>
      ) : (
        PIPS[value]?.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="8.5" fill="#1B1714" />)
      )}
    </svg>
  );
}

export function MiniDice({ dice, used }: { dice: number[]; used?: number[] }) {
  return (
    <span className="mini-dice" aria-label={dice.join('・')}>
      {dice.map((v, i) => (
        <span key={i} className={used && !used.includes(i) ? 'off' : used ? 'on' : ''}>
          <DieFace value={v} />
        </span>
      ))}
    </span>
  );
}
