export default function Logo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="tp-logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#C4B0FF" />
          <stop offset="1" stopColor="#7C5CF0" />
        </linearGradient>
      </defs>
      <path d="M4 15.5 28 5l-7.5 22-4.8-9z" fill="url(#tp-logo-g)" />
      <path d="M15.6 18 28 5" stroke="#201A30" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}
