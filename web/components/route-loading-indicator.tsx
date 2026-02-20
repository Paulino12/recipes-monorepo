"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Lightweight route-progress indicator.
 * Starts on internal link clicks and clears when pathname/search params change.
 */
export function RouteLoadingIndicator() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const search = searchParams.toString();
  const currentHref = search ? `${pathname}?${search}` : pathname;
  const isLoading = pendingHref !== null && pendingHref !== currentHref;

  useEffect(() => {
    let fallbackTimer: number | null = null;

    function onDocumentClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }

      const nextUrl = new URL(href, window.location.href);
      if (nextUrl.origin !== window.location.origin) return;

      const current = `${window.location.pathname}${window.location.search}`;
      const next = `${nextUrl.pathname}${nextUrl.search}`;
      if (current === next) return;

      setPendingHref(next);
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      fallbackTimer = window.setTimeout(() => {
        setPendingHref((value) => (value === next ? null : value));
      }, 2500);
    }

    document.addEventListener("click", onDocumentClick, true);
    return () => {
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      document.removeEventListener("click", onDocumentClick, true);
    };
  }, []);

  useEffect(() => {
    if (!pendingHref || pendingHref !== currentHref) return;
    const timer = window.setTimeout(() => setPendingHref(null), 0);
    return () => window.clearTimeout(timer);
  }, [pendingHref, currentHref]);

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden transition-opacity duration-150 print:hidden",
        isLoading ? "opacity-100" : "opacity-0",
      )}
    >
      <span className="route-progress-bar block h-full w-2/5 rounded-full bg-primary" />
    </div>
  );
}
