"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "./Icons";
import { clearSession, useSession } from "@/lib/auth";

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { session } = useSession();

  const link = (href, label) => (
    <Link href={href} className="nav-link" aria-current={pathname === href ? "page" : undefined}>
      {label}
    </Link>
  );

  return (
    <header className="nav">
      <nav className="nav-inner" aria-label="Main">
        <Link href="/" className="brand" aria-label="Construction RAG home">
          <Logo />
          <span className="brand-name">Construction RAG</span>
        </Link>
        <div className="nav-links">
          {link("/chat", "Assistant")}
          {link("/materials", "Materials")}
          {link("/designs", "Designs")}
          {link("/documents", "Documents")}
          {session ? (
            <button
              type="button"
              className="nav-button"
              onClick={() => {
                clearSession();
                router.push("/");
              }}
            >
              Sign out
            </button>
          ) : (
            link("/login", "Sign in")
          )}
        </div>
      </nav>
    </header>
  );
}
