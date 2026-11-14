export default function StoreHeroIllustration({ className = 'w-28 h-24 sm:w-36 sm:h-28' }) {
  return (
    <svg
      viewBox="0 0 220 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} shrink-0 select-none drop-shadow-[0_8px_18px_rgba(0,0,0,0.35)] transition-transform duration-300 hover:scale-105`}
      aria-hidden="true"
    >
      <defs>
        {/* Soft backlight behind store */}
        <radialGradient id="storeBackGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.45" />
          <stop offset="60%" stopColor="#c084fc" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
        </radialGradient>

        {/* Building wall gradient */}
        <linearGradient id="wallGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>

        {/* Shop Window Glass */}
        <linearGradient id="glassGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="50%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>

        {/* Awning red stripe */}
        <linearGradient id="redStripe" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ff5733" />
          <stop offset="100%" stopColor="#c0392b" />
        </linearGradient>

        {/* Awning white stripe */}
        <linearGradient id="whiteStripe" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>

        {/* Plant leaf gradient */}
        <linearGradient id="leafGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>

        {/* Door glass gradient */}
        <linearGradient id="doorGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>

      {/* Backlight warm halo */}
      <circle cx="110" cy="95" r="85" fill="url(#storeBackGlow)" />

      {/* Soft ground shadow */}
      <ellipse cx="110" cy="165" rx="88" ry="9" fill="#000000" fillOpacity="0.32" />

      {/* Building Body */}
      <rect x="30" y="65" width="160" height="95" rx="10" fill="url(#wallGrad)" />
      {/* Foundation Base */}
      <rect x="25" y="155" width="170" height="7" rx="3" fill="#cbd5e1" />

      {/* Large Shop Window (Left) */}
      <g>
        <rect x="42" y="85" width="65" height="55" rx="6" fill="#1e293b" />
        <rect x="44" y="87" width="61" height="51" rx="4" fill="url(#glassGrad)" />
        {/* Window shelf */}
        <rect x="48" y="112" width="53" height="4" rx="2" fill="#ffffff" fillOpacity="0.75" />
        {/* Product items on shelf */}
        <rect x="52" y="100" width="10" height="12" rx="2" fill="#fbbf24" />
        <rect x="66" y="97" width="8" height="15" rx="2" fill="#f43f5e" />
        <rect x="78" y="102" width="10" height="10" rx="2" fill="#10b981" />
        {/* Glass reflection streaks */}
        <path d="M47 88L70 88L55 137L47 137Z" fill="#ffffff" fillOpacity="0.35" />
        <path d="M74 88L84 88L70 137L62 137Z" fill="#ffffff" fillOpacity="0.18" />
      </g>

      {/* Shop Entrance Door (Right) */}
      <g>
        <rect x="120" y="82" width="52" height="74" rx="5" fill="#334155" />
        <rect x="123" y="85" width="46" height="68" rx="3" fill="url(#doorGrad)" fillOpacity="0.88" />
        {/* Door Window Glass */}
        <rect x="127" y="90" width="38" height="32" rx="3" fill="#93c5fd" fillOpacity="0.65" />
        {/* Door Glass Reflection */}
        <path d="M130 92L145 92L135 120L130 120Z" fill="#ffffff" fillOpacity="0.4" />
        {/* Golden Door Handle */}
        <circle cx="131" cy="126" r="3" fill="#fbbf24" />
        <rect x="130" y="123" width="2" height="6" rx="1" fill="#d97706" />
      </g>

      {/* Potted Plant Outside Store (Far Left) */}
      <g>
        {/* Terracotta Pot */}
        <path d="M12 145L15 162H27L30 145H12Z" fill="#ea580c" />
        <rect x="10" y="142" width="22" height="4" rx="2" fill="#c2410c" />
        {/* Green Foliage */}
        <circle cx="16" cy="136" r="8" fill="url(#leafGrad)" />
        <circle cx="26" cy="134" r="9" fill="url(#leafGrad)" />
        <circle cx="21" cy="124" r="10" fill="#34d399" />
        <circle cx="21" cy="126" r="7" fill="url(#leafGrad)" />
      </g>

      {/* 3D Striped Awning Canopy */}
      {/* Awning Drop Shadow onto building */}
      <path d="M16 68L204 68L194 77L26 77Z" fill="#000000" fillOpacity="0.25" />

      {/* Awning Slanted Top Roof */}
      <g>
        {/* Left ear 3D edge */}
        <path d="M18 64L32 38L32 40L18 68Z" fill="#991b1b" />
        {/* Right ear 3D edge */}
        <path d="M202 64L188 38L188 40L202 68Z" fill="#7f1d1d" />

        {/* Awning Stripes (Alternating Red and White) */}
        <path d="M18 64L32 38L52 38L39 64Z" fill="url(#redStripe)" />
        <path d="M39 64L52 38L72 38L61 64Z" fill="url(#whiteStripe)" />
        <path d="M61 64L72 38L92 38L83 64Z" fill="url(#redStripe)" />
        <path d="M83 64L92 38L112 38L105 64Z" fill="url(#whiteStripe)" />
        <path d="M105 64L112 38L132 38L127 64Z" fill="url(#redStripe)" />
        <path d="M127 64L132 38L152 38L149 64Z" fill="url(#whiteStripe)" />
        <path d="M149 64L152 38L172 38L171 64Z" fill="url(#redStripe)" />
        <path d="M171 64L172 38L188 38L193 64Z" fill="url(#whiteStripe)" />
        <path d="M193 64L188 38L192 38L202 64Z" fill="url(#redStripe)" />

        {/* Awning Scalloped Bottom Valence */}
        <path d="M18 64H39C39 69 18 69 18 64Z" fill="#b91c1c" />
        <path d="M39 64H61C61 69 39 69 39 64Z" fill="#cbd5e1" />
        <path d="M61 64H83C83 69 61 69 61 64Z" fill="#b91c1c" />
        <path d="M83 64H105C105 69 83 69 83 64Z" fill="#cbd5e1" />
        <path d="M105 64H127C127 69 105 69 105 64Z" fill="#b91c1c" />
        <path d="M127 64H149C149 69 127 69 127 64Z" fill="#cbd5e1" />
        <path d="M149 64H171C171 69 149 69 149 64Z" fill="#b91c1c" />
        <path d="M171 64H193C193 69 171 69 171 64Z" fill="#cbd5e1" />
        <path d="M193 64H202C202 69 193 69 193 64Z" fill="#b91c1c" />
      </g>

      {/* Floating Sparkle Stars */}
      <g>
        <path d="M198 25L201 16L204 25L213 28L204 31L201 40L198 31L189 28Z" fill="#fde047" opacity="0.95" />
        <path d="M25 45L27 38L29 45L36 47L29 49L27 56L25 49L18 47Z" fill="#fde047" opacity="0.85" />
        <circle cx="210" cy="50" r="2.5" fill="#ffffff" opacity="0.75" />
        <circle cx="22" cy="78" r="2" fill="#ffffff" opacity="0.65" />
      </g>
    </svg>
  );
}
