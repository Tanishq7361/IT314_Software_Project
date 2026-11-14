import { SiteHeader, NavLink } from "../Brand";
import type { ReactNode } from "react";

/** Shared shell for the public (no-login) informational pages. */
export function PublicPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <SiteHeader subtitle="Gujarat Emergency Portal" maxWidth="max-w-4xl">
        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Public pages">
          <NavLink href="/">Map</NavLink>
          <NavLink href="/about" hideBelow="sm">About</NavLink>
          <NavLink href="/how-to" hideBelow="sm">How to use</NavLink>
          <NavLink href="/safety" hideBelow="sm">Safety</NavLink>
        </nav>
      </SiteHeader>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-slate-600">{intro}</p>
        <div className="mt-8 space-y-8">{children}</div>
      </main>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-lg font-semibold text-slate-900">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed">{children}</div>
    </section>
  );
}
