import { useId } from 'react';
import { COMPANION_STATES } from '../utils/companionContent.js';

const MINT = '#83E6C0';
const FACE = '#1C1630';
const PEACH = '#F2B8A2';

const STROKE = { stroke: MINT, strokeWidth: 3.4, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };

function Shine({ cx, cy }) {
  return <circle cx={cx + 1.8} cy={cy - 2.4} r="1.7" fill="#F7F4FF" />;
}

function Eyes({ state }) {
  switch (state) {
    case 'happy':
    case 'proud':
      return (
        <g className="mm-eyes-static" {...STROKE} strokeWidth="4">
          <path d="M41 67 Q47 58 53 67" />
          <path d="M67 67 Q73 58 79 67" />
        </g>
      );
    case 'in_the_zone':
      return (
        <g>
          <g className="mm-eyes">
            <ellipse cx="47" cy="65" rx="5.5" ry="6" fill={MINT} />
            <ellipse cx="73" cy="65" rx="5.5" ry="6" fill={MINT} />
            <Shine cx={47} cy={65} />
            <Shine cx={73} cy={65} />
          </g>
          <path d="M40 55 L54 58.5 M80 55 L66 58.5" {...STROKE} strokeWidth="3" />
        </g>
      );
    case 'overloaded':
      return (
        <g className="mm-eyes">
          <circle cx="47" cy="64" r="7.5" {...STROKE} strokeWidth="2.8" />
          <circle cx="73" cy="64" r="7.5" {...STROKE} strokeWidth="2.8" />
          <circle cx="46" cy="65" r="2.2" fill={MINT} />
          <circle cx="72" cy="65" r="2.2" fill={MINT} />
        </g>
      );
    case 'tired':
      return (
        <g className="mm-eyes-static">
          <path d="M41 65 A6 6 0 0 0 53 65 Z" fill={MINT} />
          <path d="M67 65 A6 6 0 0 0 79 65 Z" fill={MINT} />
          <path d="M40 65 H54 M66 65 H80" {...STROKE} strokeWidth="3" />
        </g>
      );
    case 'reset':
      return (
        <g className="mm-eyes">
          <ellipse cx="49" cy="65" rx="4.6" ry="5.6" fill={MINT} />
          <ellipse cx="75" cy="65" rx="4.6" ry="5.6" fill={MINT} />
          <Shine cx={49} cy={65} />
          <Shine cx={75} cy={65} />
          <path d="M41 55 L53 53 M79 55 L67 53" {...STROKE} strokeWidth="2.4" opacity="0.8" />
        </g>
      );
    case 'curious':
      return (
        <g className="mm-eyes">
          <ellipse cx="47" cy="64" rx="5" ry="6.5" fill={MINT} />
          <ellipse cx="74" cy="63" rx="6.4" ry="8" fill={MINT} />
          <Shine cx={47} cy={64} />
          <Shine cx={74} cy={63} />
        </g>
      );
    default:
      return (
        <g className="mm-eyes">
          <ellipse cx="47" cy="65" rx="5" ry="6.5" fill={MINT} />
          <ellipse cx="73" cy="65" rx="5" ry="6.5" fill={MINT} />
          <Shine cx={47} cy={65} />
          <Shine cx={73} cy={65} />
        </g>
      );
  }
}

function Mouth({ state }) {
  switch (state) {
    case 'happy':
      return <path d="M52 78 Q60 88 68 78" {...STROKE} />;
    case 'in_the_zone':
      return <path d="M54 81 Q62 86 69 78" {...STROKE} />;
    case 'proud':
      return <path d="M51 77 Q60 94 69 77 Z" fill={PEACH} stroke={PEACH} strokeWidth="2" strokeLinejoin="round" />;
    case 'overloaded':
      return <path d="M51 82 Q55.5 77.5 60 82 T69 82" {...STROKE} strokeWidth="3" />;
    case 'tired':
      return <path d="M55 82 H65" {...STROKE} strokeWidth="3" />;
    case 'reset':
      return <path d="M54 82 Q60 79.5 66 82" {...STROKE} strokeWidth="3" />;
    case 'curious':
      return <ellipse cx="60" cy="82" rx="3" ry="3.4" {...STROKE} strokeWidth="2.8" />;
    default:
      return <path d="M53 79 Q60 85 67 79" {...STROKE} />;
  }
}

function Sparkle({ x, y, s = 1, delay = 0, fill = PEACH }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} aria-hidden="true">
      <path
        className="mm-sparkle"
        style={{ animationDelay: `${delay}s` }}
        d="M0 -6 L1.6 -1.6 L6 0 L1.6 1.6 L0 6 L-1.6 1.6 L-6 0 L-1.6 -1.6Z"
        fill={fill}
      />
    </g>
  );
}

function Extras({ state }) {
  switch (state) {
    case 'proud':
      return (
        <>
          <Sparkle x={14} y={30} s={1.3} />
          <Sparkle x={106} y={24} s={1.6} delay={0.4} />
          <Sparkle x={100} y={52} s={0.9} delay={0.8} fill={MINT} />
          <Sparkle x={22} y={8} s={0.8} delay={1.1} fill={MINT} />
        </>
      );
    case 'happy':
      return (
        <>
          <Sparkle x={103} y={26} s={1.2} fill={MINT} />
          <Sparkle x={15} y={36} s={0.8} delay={0.7} />
        </>
      );
    case 'in_the_zone':
      return (
        <g stroke="#B79DFF" strokeWidth="3" strokeLinecap="round" className="mm-speed" aria-hidden="true">
          <path d="M3 44 H13" />
          <path d="M0 56 H9" opacity="0.7" />
          <path d="M5 68 H12" opacity="0.5" />
          <Sparkle x={104} y={28} s={1} fill="#B79DFF" />
        </g>
      );
    case 'overloaded':
      return (
        <path
          className="mm-sweat"
          d="M98 28 C102 35 104 39 98 44 C92 39 94 35 98 28Z"
          fill="#9CCBF2"
          aria-hidden="true"
        />
      );
    case 'tired':
      return (
        <g fill="#9A93BD" fontFamily="Space Grotesk, Inter, sans-serif" fontWeight="700" aria-hidden="true">
          <text className="mm-zzz" x="90" y="34" fontSize="12">
            z
          </text>
          <text className="mm-zzz mm-zzz-2" x="99" y="22" fontSize="16">
            Z
          </text>
        </g>
      );
    case 'reset':
      return (
        <g className="mm-refresh" aria-hidden="true">
          <path d="M101 32 A10 10 0 1 1 91 22" stroke="#86B6F0" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M86.5 17.5 L94.5 21.5 L87.5 27.5Z" fill="#86B6F0" />
        </g>
      );
    case 'curious':
      return (
        <text
          className="mm-question"
          x="93"
          y="30"
          fontSize="24"
          fontWeight="700"
          fill="#A78BFA"
          fontFamily="Space Grotesk, Inter, sans-serif"
          aria-hidden="true"
        >
          ?
        </text>
      );
    default:
      return null;
  }
}

const CHEEKS = new Set(['calm', 'happy', 'proud']);

/**
 * "Pip", the MoodMate mascot: an original lilac robot-blob with a paper-plane tuft and a mint-lit face.
 * `state` is one of the eight companion states; each has its own face, extras and motion (see companion.css).
 */
export default function Mascot({ state = 'curious', size = 96, decorative = false }) {
  const uid = useId().replace(/:/g, '');
  const label = (COMPANION_STATES[state]?.label ?? 'Curious').toLowerCase();

  return (
    <svg
      className={`mascot mascot-${state}`}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : `MoodMate, the TaskPilot companion, looking ${label}`}
      aria-hidden={decorative ? 'true' : undefined}
      focusable="false"
    >
      <defs>
        <linearGradient id={`mm-body-${uid}`} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#C4B0FF" />
          <stop offset="1" stopColor="#7C5CF0" />
        </linearGradient>
      </defs>

      <ellipse className="mm-shadow" cx="60" cy="112" rx="30" ry="4.5" fill="#000" opacity="0.28" />

      <g className="mm-body">
        <ellipse className="mm-arm mm-arm-l" cx="15" cy="72" rx="7" ry="10" fill="#8B6DF0" />
        <ellipse className="mm-arm mm-arm-r" cx="105" cy="72" rx="7" ry="10" fill="#8B6DF0" />
        <ellipse cx="44" cy="106" rx="10" ry="5.5" fill="#7C5CF0" />
        <ellipse cx="76" cy="106" rx="10" ry="5.5" fill="#7C5CF0" />

        <path
          d="M60 18 C88 18 105 38 105 64 C105 92 86 107 60 107 C34 107 15 92 15 64 C15 38 32 18 60 18Z"
          fill={`url(#mm-body-${uid})`}
        />
        <ellipse cx="38" cy="33" rx="13" ry="6" fill="#fff" opacity="0.2" transform="rotate(-28 38 33)" />

        <g className="mm-tuft">
          <path d="M50 25 L76 9 L67 29 L61 23Z" fill={MINT} />
          <path d="M61 23 L76 9" stroke={FACE} strokeWidth="1.3" strokeLinecap="round" opacity="0.45" />
        </g>

        <rect x="26" y="47" width="68" height="47" rx="23" fill={FACE} />
        {CHEEKS.has(state) && (
          <>
            <circle cx="37" cy="78" r="4.2" fill={PEACH} opacity="0.5" />
            <circle cx="83" cy="78" r="4.2" fill={PEACH} opacity="0.5" />
          </>
        )}
        <Eyes state={state} />
        <Mouth state={state} />
      </g>

      <Extras state={state} />
    </svg>
  );
}
