// The two languages' flags, cut to a circle — on the top bar's language button
// and the sign-in pages' «Ελληνικά | English». `size` as react-icons take it, so
// either can stand where an icon goes.

/** Greece: nine stripes and the cross, cut to a circle. */
export function GreekFlag({ size = 22 }: { size?: number | string }) {
  return (
    <svg viewBox="0 0 18 18" width={size} height={size} aria-hidden>
      <defs>
        <clipPath id="flag-circle-gr">
          <circle cx="9" cy="9" r="9" />
        </clipPath>
      </defs>
      <g clipPath="url(#flag-circle-gr)">
        <rect width="18" height="18" fill="#0D5EAF" />
        {[1, 3, 5, 7].map((i) => (
          <rect key={i} y={i * 2} width="18" height="2" fill="#fff" />
        ))}
        <rect width="10" height="10" fill="#0D5EAF" />
        <rect x="4" width="2" height="10" fill="#fff" />
        <rect y="4" width="10" height="2" fill="#fff" />
      </g>
      <circle cx="9" cy="9" r="8.5" fill="none" stroke="rgba(0,0,0,0.15)" />
    </svg>
  );
}

/** The United Kingdom: the union flag, cut to a circle. */
export function BritishFlag({ size = 22 }: { size?: number | string }) {
  return (
    <svg viewBox="0 0 18 18" width={size} height={size} aria-hidden>
      <defs>
        <clipPath id="flag-circle-uk">
          <circle cx="9" cy="9" r="9" />
        </clipPath>
      </defs>
      <g clipPath="url(#flag-circle-uk)">
        <rect width="18" height="18" fill="#012169" />
        <path d="M0 0 18 18M18 0 0 18" stroke="#fff" strokeWidth="3.6" />
        <path d="M0 0 18 18M18 0 0 18" stroke="#C8102E" strokeWidth="1.4" />
        <path d="M9 0v18M0 9h18" stroke="#fff" strokeWidth="5" />
        <path d="M9 0v18M0 9h18" stroke="#C8102E" strokeWidth="3" />
      </g>
      <circle cx="9" cy="9" r="8.5" fill="none" stroke="rgba(0,0,0,0.15)" />
    </svg>
  );
}
