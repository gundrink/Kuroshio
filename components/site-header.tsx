import Link from "next/link";
import { HeaderMarks } from "@/components/header-marks";
import { SectionNav } from "@/components/section-nav";
import { publicEnv } from "@/lib/env";

type Panel = "swap" | "send" | "receive" | "book" | "bands";

export function SiteHeader({
  current,
  panel,
  swapHref = "/app?panel=swap",
}: {
  current: "home" | "app" | "connect";
  panel?: Panel;
  swapHref?: string;
}) {
  const inApp = current === "app" || current === "connect";
  const locked = swapHref === "/connect";
  const hrefFor = (name: Panel) => (locked ? "/connect" : `/app?panel=${name}`);

  return (
    <header className="site-header">
      <div className="brand-cluster">
        <Link href="/" className="wordmark" aria-label="Pool Ninja">
          <img className="brand-lockup" src="/poolninja-textheader.png" alt="Pool Ninja" width={1024} height={341} />
        </Link>
        <HeaderMarks xUrl={publicEnv.xUrl} ca={publicEnv.ca} />
      </div>
      <nav className="site-nav">
        {current === "home" ? (
          <>
            <SectionNav />
            <Link className="launch-link" href="/connect">
              Open book
            </Link>
          </>
        ) : null}
        {inApp ? (
          <>
            <Link href={hrefFor("swap")} aria-current={current === "app" && panel === "swap" ? "page" : undefined}>
              Swap
            </Link>
            <Link href={hrefFor("send")} aria-current={panel === "send" ? "page" : undefined}>
              Send
            </Link>
            <Link href={hrefFor("receive")} aria-current={panel === "receive" ? "page" : undefined}>
              Receive
            </Link>
            <Link href="/app?panel=book" aria-current={panel === "book" ? "page" : undefined}>
              Book
            </Link>
            <Link href="/app?panel=bands" aria-current={panel === "bands" ? "page" : undefined}>
              Bands
            </Link>
          </>
        ) : null}
      </nav>
    </header>
  );
}
