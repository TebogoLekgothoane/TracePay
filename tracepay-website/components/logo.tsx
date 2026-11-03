import Image from "next/image";
import Link from "next/link";

/** The TracePay mark, as used in the app: the mono icon filled with the purple-to-navy gradient. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src="/tracepay-mark.svg"
      alt=""
      width={998}
      height={802}
      unoptimized
      aria-hidden="true"
      className={className ? `brand-mark ${className}` : "brand-mark"}
    />
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
