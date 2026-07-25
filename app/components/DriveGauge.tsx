"use client";

type DriveGaugeProps = {
  speedKmh: number;
  horsepower: number;
  powerNorm: number;
  reverse: boolean;
  labelSpeed: string;
  labelHp: string;
  labelReverse: string;
};

const SPEED_MAX = 160; // km/h dial top (covers boost ~137)
const HP_MAX = 60;
const START = (-210 * Math.PI) / 180;
const SWEEP = (240 * Math.PI) / 180;

function polar(cx: number, cy: number, r: number, t: number) {
  return { x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r };
}

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p0 = polar(cx, cy, r, a0);
  const p1 = polar(cx, cy, r, a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y}`;
}

/** Bottom-right car-style dual dial: speed (km/h) + horsepower. */
export function DriveGauge({
  speedKmh,
  horsepower,
  powerNorm,
  reverse,
  labelSpeed,
  labelHp,
  labelReverse,
}: DriveGaugeProps) {
  const speed = Math.min(SPEED_MAX, Math.max(0, speedKmh));
  const hp = Math.min(HP_MAX, Math.max(0, horsepower));
  const speedT = START + (speed / SPEED_MAX) * SWEEP;
  const hpT = START + (hp / HP_MAX) * SWEEP;
  const speedNeedle = polar(90, 96, 62, speedT);
  const hpNeedle = polar(90, 96, 44, hpT);
  const powerArcEnd = START + powerNorm * SWEEP;

  const ticks = Array.from({ length: 9 }, (_, i) => {
    const t = START + (i / 8) * SWEEP;
    const outer = polar(90, 96, 72, t);
    const inner = polar(90, 96, i % 2 === 0 ? 62 : 66, t);
    const label = polar(90, 96, 52, t);
    return { i, outer, inner, label, value: Math.round((i / 8) * SPEED_MAX) };
  });

  return (
    <div className={`drive-gauge ${reverse ? "reverse" : ""}`} aria-live="polite">
      <svg className="drive-gauge-svg" viewBox="0 0 180 130" role="img" aria-label={`${labelSpeed} ${Math.round(speed)}, ${labelHp} ${Math.round(hp)}`}>
        <path className="gauge-track" d={arcPath(90, 96, 70, START, START + SWEEP)} />
        <path className="gauge-power" d={arcPath(90, 96, 48, START, Math.max(START + 0.02, powerArcEnd))} />
        <path className="gauge-track-inner" d={arcPath(90, 96, 48, START, START + SWEEP)} />

        {ticks.map((tick) => (
          <g key={tick.i}>
            <line className="gauge-tick" x1={tick.inner.x} y1={tick.inner.y} x2={tick.outer.x} y2={tick.outer.y} />
            {tick.i % 2 === 0 && (
              <text className="gauge-tick-label" x={tick.label.x} y={tick.label.y} textAnchor="middle" dominantBaseline="middle">
                {tick.value}
              </text>
            )}
          </g>
        ))}

        <line className="gauge-needle hp" x1={90} y1={96} x2={hpNeedle.x} y2={hpNeedle.y} />
        <line className="gauge-needle speed" x1={90} y1={96} x2={speedNeedle.x} y2={speedNeedle.y} />
        <circle className="gauge-hub" cx={90} cy={96} r={5} />
      </svg>

      <div className="drive-gauge-readout">
        <div className="gauge-speed">
          <strong>{reverse ? `−${Math.round(speed)}` : Math.round(speed)}</strong>
          <span>{labelSpeed}</span>
        </div>
        <div className="gauge-hp">
          <strong>{Math.round(hp)}</strong>
          <span>{labelHp}</span>
        </div>
      </div>
      {reverse && <div className="gauge-reverse">{labelReverse}</div>}
    </div>
  );
}
