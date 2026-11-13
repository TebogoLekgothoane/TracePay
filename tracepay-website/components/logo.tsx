import Image from "next/image";
import Link from "next/link";

/**
 * The TracePay mark. Two images, one per theme: the dark one has its near-black ink lightened
 * so the mark stays readable on the dark background. CSS shows whichever theme is active.
 */
export function LogoMark({ className }: { className?: string }) {
  const base = className ? `brand-mark ${className}` : "brand-mark";
  return (
    <>
      <Image
        src="/tracepay-mark.png"
        alt=""
        width={560}
        height={461}
        unoptimized
        aria-hidden="true"
        className={`${base} brand-mark-light`}
      />
      <Image
        src="/tracepay-mark-dark.png"
        alt=""
        width={560}
        height={461}
        unoptimized
        aria-hidden="true"
        className={`${base} brand-mark-dark`}
      />
    </>
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
