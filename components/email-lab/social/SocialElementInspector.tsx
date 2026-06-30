"use client";
// components/email-lab/social/SocialElementInspector.tsx
//
// The "Now editing" panel for a selected canvas element — the social sibling of the
// email BlockInspector. Edits text/value/label/cta + font size, color, alignment, and
// (for image/logo) the photo URL. A different data model than EmailBlock, so not a byte
// copy. Rendered on a white card by the shell (text-gray-900).
import type { SocialElement } from "@/lib/social/design/types";

type Patch = Partial<Record<string, unknown>>;

const LABEL: Record<SocialElement["type"], string> = {
  text: "Text",
  stat: "Stat",
  cta: "Button + link",
  image: "Image",
  logo: "Logo",
  chart: "Chart",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-wide text-gray-500">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-900 focus:border-gulf-teal focus:outline-none focus:ring-1 focus:ring-gulf-teal";

export function SocialElementInspector({
  element,
  onChange,
  onDelete,
  onClose,
}: {
  element: SocialElement;
  onChange: (next: SocialElement) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  // cast: we only ever override fields the element type actually owns.
  const set = (patch: Patch) => onChange({ ...element, ...patch } as SocialElement);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-800">{LABEL[element.type]}</span>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-700">
          ✕
        </button>
      </div>

      {element.type === "text" && (
        <>
          <Field label="Text">
            <textarea
              value={element.text}
              onChange={(e) => set({ text: e.target.value })}
              rows={3}
              className={`${inputCls} resize-none`}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Font size">
              <input
                type="number"
                value={element.fontSize}
                onChange={(e) => set({ fontSize: Number(e.target.value) || element.fontSize })}
                className={inputCls}
              />
            </Field>
            <Field label="Color">
              <input
                type="color"
                value={element.fill}
                onChange={(e) => set({ fill: e.target.value })}
                className="h-8 w-full rounded border border-gray-300"
              />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {(["left", "center", "right"] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => set({ align: a })}
                  className={`rounded border px-2 py-1 text-[11px] ${
                    (element.align ?? "left") === a
                      ? "border-gulf-teal text-gulf-teal"
                      : "border-gray-300 text-gray-500"
                  }`}
                >
                  {a[0].toUpperCase()}
                </button>
              ))}
            </div>
            <button
              onClick={() => set({ fontStyle: element.fontStyle === "bold" ? "normal" : "bold" })}
              className={`rounded border px-2 py-1 text-[11px] font-bold ${
                element.fontStyle === "bold"
                  ? "border-gulf-teal text-gulf-teal"
                  : "border-gray-300 text-gray-500"
              }`}
            >
              B
            </button>
          </div>
        </>
      )}

      {element.type === "stat" && (
        <>
          <Field label="Value">
            <input
              value={element.value}
              onChange={(e) => set({ value: e.target.value })}
              placeholder="$412K"
              className={inputCls}
            />
          </Field>
          <Field label="Label">
            <input
              value={element.label}
              onChange={(e) => set({ label: e.target.value })}
              className={inputCls}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Value color">
              <input
                type="color"
                value={element.accent}
                onChange={(e) => set({ accent: e.target.value })}
                className="h-8 w-full rounded border border-gray-300"
              />
            </Field>
            <Field label="Label color">
              <input
                type="color"
                value={element.fill}
                onChange={(e) => set({ fill: e.target.value })}
                className="h-8 w-full rounded border border-gray-300"
              />
            </Field>
          </div>
        </>
      )}

      {element.type === "cta" && (
        <>
          <Field label="Button text">
            <input
              value={element.text}
              onChange={(e) => set({ text: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Link URL">
            <input
              value={element.url}
              onChange={(e) => set({ url: e.target.value })}
              placeholder="https://…"
              className={inputCls}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Button color">
              <input
                type="color"
                value={element.fill}
                onChange={(e) => set({ fill: e.target.value })}
                className="h-8 w-full rounded border border-gray-300"
              />
            </Field>
            <Field label="Text color">
              <input
                type="color"
                value={element.textFill}
                onChange={(e) => set({ textFill: e.target.value })}
                className="h-8 w-full rounded border border-gray-300"
              />
            </Field>
          </div>
        </>
      )}

      {(element.type === "image" || element.type === "logo") && (
        <Field label="Photo URL">
          <input
            value={element.src}
            onChange={(e) => set({ src: e.target.value })}
            placeholder="Paste a URL, or use Photos below"
            className={inputCls}
          />
        </Field>
      )}

      {element.type === "chart" && (
        <p className="text-[11px] text-gray-500">Charts on the canvas are coming soon.</p>
      )}

      <button
        onClick={onDelete}
        className="w-full rounded border border-red-300 px-2 py-1 text-[11px] text-red-500 hover:bg-red-50"
      >
        Delete element
      </button>
    </div>
  );
}
