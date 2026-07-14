"use client";

import { useEffect, useRef, useState } from "react";

/** An email rendered at its true 600px width, iframe auto-sized to its content. */
export function EmailFrame({ html, src }: { html?: string; src?: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState(900);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const d = el.contentDocument;
      if (!d?.body) return;
      const next = Math.max(d.body.scrollHeight, d.documentElement.scrollHeight);
      if (next > 40) setH(next);
    };
    el.addEventListener("load", measure);
    const t = setInterval(measure, 400);
    const stop = setTimeout(() => clearInterval(t), 6000);
    return () => {
      el.removeEventListener("load", measure);
      clearInterval(t);
      clearTimeout(stop);
    };
  }, [html, src]);

  return (
    <iframe
      ref={ref}
      srcDoc={html}
      src={src}
      title="email preview"
      style={{ width: 700, height: h, border: 0, display: "block", background: "#fff" }}
    />
  );
}
