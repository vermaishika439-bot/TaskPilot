import { useId } from 'react';
import { COMPANION_STATES } from '../utils/companionContent.js';

/**
 * MoodMate — an original SVG mascot: a rounded lilac "co-pilot" with a mint signal antenna.
 * One base body, eight expressions. Motion is CSS-only and disabled for reduced-motion users
 * (see companion.css). Pass `decorative` when the surrounding text already names the state.
 */

const INK = '#1b1330';

function Eye({ cx, cy, dx = 0, dy = 0 }) {
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx="8" ry="9.5" fill={INK} />
      <circle cx={cx - 2.6 + dx} cy={cy - 3.2 + dy} r="3" fill="#fff" />
      <circle cx={cx + 2.8 + dx} cy={cy + 3 + dy} r="1.4" fill="#fff" opacity="0.85" />
    </g>
  );
}

const stroke = { fill: 'none', stroke: INK, strokeWidth: 3.4, strokeLinecap: 'round', strokeLinejoin: 'round' };

function Face({ state }) {
  switch (state) {
    case 'curious':
      return (
        <>
          <g className="mm-eyes">
            <Eye cx={45} cy={62} dx={1} dy={-1} />
            <Eye cx={75} cy={62} dx={1} dy={-1} />
          </g>
          <path d="M37 47 Q45 43 53 46" {...stroke} strokeWidth="2.6" />
          <path d="M67 42 Q75 37 83 44" {...stroke} strokeWidth="2.6" />
          <ellipse cx="60" cy="82" rx="3.4" ry="4" fill={INK} />
        </>
      );
    case 'calm':
      return (
        <>
          <g className="mm-eyes">
            <path d="M37 63 Q45 70 53 63" {...stroke} />
            <path d="M67 63 Q75 70 83 63" {...stroke} />
          </g>
          <path d="M51 78 Q60 85 69 78" {...stroke} strokeWidth="3" />
        </>
      );
    case 'happy':
      return (
        <>
          <g className="mm-eyes">
            <path d="M37 65 Q45 54 53 65" {...stroke} />
            <path d="M67 65 Q75 54 83 65" {...stroke} />
          </g>
          <path d="M49 76 Q60 94 71 76 Z" fill={INK} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          <ellipse cx="60" cy="85" rx="5.5" ry="3.4" fill="#F2B8A2" />
        </>
      );
    case 'in_the_zone':
      return (
        <>
          <g className="mm-eyes">
            <ellipse cx="45" cy="63" rx="8" ry="6.2" fill={INK} />
            <ellipse cx="75" cy="63" rx="8" ry="6.2" fill={INK} />
            <circle cx="45" cy="63" r="2.6" fill="#83E6C0" />
            <circle cx="75" cy="63" r="2.6" fill="#83E6C0" />
          </g>
          <path d="M36 52 L54 57" {...stroke} strokeWidth="3" />
          <path d="M84 52 L66 57" {...stroke} strokeWidth="3" />
          <path d="M52 79 Q61 85 70 76" {...stroke} strokeWidth="3" />
        </>
      );
    case 'proud':
      return (
        <g transform="translate(0 -2)">
          <g className="mm-eyes">
            <path d="M37 65 Q45 54 53 65" {...stroke} />
            <path d="M67 65 Q75 54 83 65" {...stroke} />
          </g>
          <path d="M50 76 Q60 90 70 76" {...stroke} strokeWidth="3.2" />
        </g>
      );
    case 'overloaded':
      return (
        <>
          <g className="mm-eyes">
            <circle cx="45" cy="62" r="9.5" fill="#fff" stroke={INK} strokeWidth="2.6" />
            <circle cx="75" cy="62" r="9.5" fill="#fff" stroke={INK} strokeWidth="2.6" />
            <circle cx="46" cy="63" r="3" fill={INK} />
            <circle cx="74" cy="63" r="3" fill={INK} />
          </g>
          <path d="M37 47 Q45 51 53 47" {...stroke} strokeWidth="2.4" />
          <path d="M67 47 Q75 51 83 47" {...stroke} strokeWidth="2.4" />
          <path d="M50 82 Q54 77 58 82 T66 82 T70 80" {...stroke} strokeWidth="2.8" />
        </>
      );
    case 'tired':
      return (
        <>
          <g className="mm-eyes">
            <path d="M37 63 A8 8 0 0 0 53 63 Z" fill={INK} />
            <path d="M37 63 H53" {...stroke} strokeWidth="2.8" />
            <path d="M67 63 A8 8 0 0 0 83 63 Z" fill={INK} />
            <path d="M67 63 H83" {...stroke} strokeWidth="2.8" />
          </g>
          <path d="M53 80 Q60 77 67 80" {...stroke} strokeWidth="2.8" />
        </>
      );
    case 'reset':
    default:
      return (
        <>
          <g className="mm-eyes">
            <Eye cx={45} cy={62} dx={1.4} dy={-1.2} />
            <Eye cx={75} cy={62} dx={1.4} dy={-1.2} />
          </g>
          <path d="M52 77 Q60 83 68 77" {...stroke} strokeWidth="3" />
        </>
      );
  }
}

function Extras({ state }) {
  switch (state) {
    case 'in_the_zone':
      return (
        <g className="mm-extra mm-speed" aria-hidden="true">
          <path d="M6 58 H20" stroke="#83E6C0" strokeWidth="3" strokeLinecap="round" />
          <path d="M2 72 H16" stroke="#83E6C0" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
          <path d="M114 58 H100" stroke="#83E6C0" strokeWidth="3" strokeLinecap="round" />
          <path d="M118 72 H104" stroke="#83E6C0" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
        </g>
      );
    case 'proud':
      return (
        <>
          <g aria-hidden="true">
            <circle cx="60" cy="101" r="6" fill="#83E6C0" stroke="#201A30" strokeWidth="1.5" />
            <path d="M57 107 L55 117 L60 114 L65 117 L63 107" fill="#A78BFA" />
          </g>
          <g className="mm-confetti" aria-hidden="true">
            <rect className="c1" x="14" y="30" width="5" height="5" rx="1" fill="#83E6C0" />
            <rect className="c2" x="100" y="26" width="5" height="5" rx="1" fill="#F2B8A2" />
            <circle className="c3" cx="24" cy="14" r="2.6" fill="#A78BFA" />
            <circle className="c4" cx="96" cy="12" r="2.6" fill="#83E6C0" />
            <rect className="c5" x="108" y="48" width="4" height="4" rx="1" fill="#A78BFA" />
            <rect className="c6" x="6" y="50" width="4" height="4" rx="1" fill="#F2B8A2" />
          </g>
        </>
      );
    case 'overloaded':
      return (
        <g aria-hidden="true">
          <path className="mm-drop" d="M96 40 Q101 48 96 52 Q91 48 96 40Z" fill="#A8E4F5" />
          <path className="mm-stress" d="M22 36 l-6 -5 M20 44 l-8 -1 M98 30 l5 -5" stroke="#F2B8A2" strokeWidth="2.6" strokeLinecap="round" />
        </g>
      );
    case 'tired':
      return (
        <g className="mm-zzz" aria-hidden="true" fill="#AAA2BE" fontFamily="Space Grotesk, Inter, sans-serif" fontWeight="700">
          <text className="z1" x="92" y="34" fontSize="13">z</text>
          <text className="z2" x="101" y="22" fontSize="10">z</text>
        </g>
      );
    case 'reset':
      return (
        <g className="mm-orbit" aria-hidden="true">
          <path d="M80 6 A14 14 0 1 1 66 -2" fill="none" stroke="#83E6C0" strokeWidth="2.6" strokeLinecap="round" transform="translate(-4 10)" />
          <path d="M60 1 l7 -1 l-3 7z" fill="#83E6C0" transform="translate(-4 10)" />
        </g>
      );
    case 'happy':
      return (
        <g className="mm-sparkles" aria-hidden="true" fill="#F2B8A2">
          <path className="s1" d="M20 30 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" />
          <path className="s2" d="M100 36 l1.5 3.5 3.5 1.5 -3.5 1.5 -1.5 3.5 -1.5 -3.5 -3.5 -1.5 3.5 -1.5z" fill="#83E6C0" />
        </g>
      );
    default:
      return null;
  }
}

export default function MoodMateMascot({ state = 'curious', size = 96, decorative = false, className = '' }) {
  const uid = useId().replace(/:/g, '');
  const known = COMPANION_STATES[state] ? state : 'curious';
  const label = `MoodMate mascot looking ${COMPANION_STATES[known].label.toLowerCase()}`;

  const a11y = decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label };

  return (
    <svg
      className={`mm mm-${known} ${className}`.trim()}
      width={size}
      height={(size * 132) / 120}
      viewBox="0 0 120 132"
      focusable="false"
      {...a11y}
    >
      <defs>
        <linearGradient id={`${uid}-body`} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#D2C2FF" />
          <stop offset="0.55" stopColor="#A78BFA" />
          <stop offset="1" stopColor="#7C5CF0" />
        </linearGradient>
        <radialGradient id={`${uid}-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#83E6C0" stopOpacity="0.55" />
          <stop offset="1" stopColor="#83E6C0" stopOpacity="0" />
        </radialGradient>
      </defs>

      {known === 'in_the_zone' && <circle className="mm-aura" cx="60" cy="68" r="58" fill={`url(#${uid}-glow)`} />}

      <ellipse className="mm-shadow" cx="60" cy="125" rx="26" ry="4.5" fill="#000" opacity="0.28" />

      <g className="mm-float">
        <g className="mm-pose" transform="translate(0 8)">
          {/* antenna */}
          <g className="mm-antenna">
            <path d="M60 24 Q59 14 65 9" fill="none" stroke="#C4B0FF" strokeWidth="3.4" strokeLinecap="round" />
            <circle className="mm-orb" cx="66" cy="8" r="5" fill="#83E6C0" />
            <circle cx="64.4" cy="6.4" r="1.6" fill="#fff" opacity="0.8" />
          </g>

          {/* arms */}
          <ellipse className="mm-arm mm-arm-l" cx="15" cy="74" rx="7" ry="10" fill={`url(#${uid}-body)`} />
          <ellipse className="mm-arm mm-arm-r" cx="105" cy="74" rx="7" ry="10" fill={`url(#${uid}-body)`} />

          {/* feet */}
          <ellipse cx="44" cy="108" rx="11" ry="6" fill="#7C5CF0" />
          <ellipse cx="76" cy="108" rx="11" ry="6" fill="#7C5CF0" />

          {/* body */}
          <path
            d="M60 22 C90 22 106 42 106 68 C106 94 88 108 60 108 C32 108 14 94 14 68 C14 42 30 22 60 22Z"
            fill={`url(#${uid}-body)`}
          />
          <path d="M30 40 Q38 28 52 27" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="4" strokeLinecap="round" />

          {/* belly badge: the TaskPilot paper-plane */}
          <path d="M52 96 L72 88 L66 104 L63 98z" fill="#fff" fillOpacity="0.28" />

          {/* cheeks */}
          <ellipse cx="30" cy="78" rx="6.5" ry="4.2" fill="#F2B8A2" opacity="0.75" />
          <ellipse cx="90" cy="78" rx="6.5" ry="4.2" fill="#F2B8A2" opacity="0.75" />

          <Face state={known} />
          <Extras state={known} />
        </g>
      </g>
    </svg>
  );
}
