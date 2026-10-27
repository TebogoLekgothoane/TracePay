import Link from "next/link";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="14" cy="14" r="12" />
      <path d="M6 17h4l3-8 3 10 2-5h4" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={className ? `brand ${className}` : "brand"} aria-label="TracePay home">
      <LogoMark />
      TRACEPAY
    </Link>
  );
}
