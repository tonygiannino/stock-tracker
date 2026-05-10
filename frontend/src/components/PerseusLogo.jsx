export default function PerseusLogo({ size = 32 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Badge background */}
      <rect width="32" height="32" rx="8" fill="#6366f1" />

      {/* Perseus constellation — simplified star map */}
      {/* Connecting lines first so stars render on top */}
      <line x1="16" y1="6"  x2="22" y2="11" stroke="white" strokeWidth="0.9" opacity="0.35" />
      <line x1="22" y1="11" x2="16" y2="17" stroke="white" strokeWidth="0.9" opacity="0.35" />
      <line x1="16" y1="17" x2="10" y2="13" stroke="white" strokeWidth="0.9" opacity="0.35" />
      <line x1="10" y1="13" x2="8"  y2="19" stroke="white" strokeWidth="0.9" opacity="0.35" />
      <line x1="16" y1="17" x2="20" y2="24" stroke="white" strokeWidth="0.9" opacity="0.35" />
      <line x1="16" y1="17" x2="11" y2="24" stroke="white" strokeWidth="0.9" opacity="0.35" />

      {/* Stars — varying sizes for depth */}
      <circle cx="16" cy="6"  r="2"   fill="white" />               {/* Mirfak (α) — brightest */}
      <circle cx="22" cy="11" r="1.5" fill="white" opacity="0.95" />{/* Algol (β) */}
      <circle cx="10" cy="13" r="1.4" fill="white" opacity="0.9"  />
      <circle cx="16" cy="17" r="1.8" fill="white" />               {/* central node */}
      <circle cx="8"  cy="19" r="1.1" fill="white" opacity="0.75" />
      <circle cx="20" cy="24" r="1.3" fill="white" opacity="0.85" />
      <circle cx="11" cy="24" r="1.1" fill="white" opacity="0.75" />
    </svg>
  );
}
