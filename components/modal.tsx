"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export function Modal({ children, title, close, drawer = false }: { children: React.ReactNode; title: string; close: () => void; drawer?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = ref.current;
    const focusable = () => [...(panel?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') ?? [])];
    focusable()[0]?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key !== "Tab") return;
      const all = focusable(), first = all[0], last = all[all.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", handler);
    return () => { document.removeEventListener("keydown", handler); document.body.style.overflow = oldOverflow; previous?.focus(); };
  }, [close]);
  return <div className={`overlay ${drawer ? "drawer-overlay" : ""}`} onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <section ref={ref} className={drawer ? "drawer" : "modal"} role="dialog" aria-modal="true" aria-label={title}>
      <header className="dialog-header"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={close}><X size={20} /></button></header>
      {children}
    </section>
  </div>;
}
