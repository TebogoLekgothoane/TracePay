import Link from "next/link";
import { Logo } from "@/components/logo";
import { NAV_LINKS, SITE } from "@/lib/content";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="foot">
          <div>
            <Logo className="text-fg" />
            <p style={{ marginTop: 16, maxWidth: "26em" }}>
              Financial intelligence that helps you examine your transactions and understand the patterns behind them.
            </p>
          </div>
          <div>
            <span className="h">Explore</span>
            <ul>
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <span className="h">Legal and contact</span>
            <ul>
              <li><Link href="/privacy">Privacy policy</Link></li>
              <li><Link href="/terms">Terms of service</Link></li>
              <li><a href={`mailto:${SITE.email}`}>{SITE.email}</a></li>
            </ul>
          </div>
        </div>
        <p className="legalline">
          TracePay provides information to help you understand your finances. It does not provide financial advice.
          Interface images use sample data and are illustrative. Bank names are used only to describe supported
          statements. © {new Date().getFullYear()} TracePay · {SITE.domain}
        </p>
      </div>
    </footer>
  );
}
