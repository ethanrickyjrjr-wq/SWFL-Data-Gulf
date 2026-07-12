import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Text } from "@react-email/components";
import { EditableText, escapeHtml, readEditedText, type EditScope } from "./editable-text";

const S = { fontSize: "16px", margin: 0 } as const;
const scope: EditScope = { blockId: "b1", commit: () => {} };

describe("escapeHtml", () => {
  it("escapes the five specials and nothing else", () => {
    expect(escapeHtml(`<b>&"'x`)).toBe("&lt;b&gt;&amp;&quot;&#39;x");
    expect(escapeHtml("plain 3 bd · 2 ba\nline2")).toBe("plain 3 bd · 2 ba\nline2");
  });
});

describe("EditableText — server parity (no scope)", () => {
  it("as={Text}: byte-identical to the raw component", () => {
    const ours = renderToStaticMarkup(<EditableText as={Text} style={S} value="Hi" path="body" />);
    const raw = renderToStaticMarkup(<Text style={S}>Hi</Text>);
    expect(ours).toBe(raw);
  });

  it("as omitted: the bare string, no wrapper", () => {
    const html = renderToStaticMarkup(
      <td>
        <EditableText value="Row text" path="items.0.text" />
      </td>,
    );
    expect(html).toBe("<td>Row text</td>");
  });

  it("className passes through (display-font nodes)", () => {
    const ours = renderToStaticMarkup(
      <EditableText as={Text} className="df" style={S} value="$485K" path="value" />,
    );
    const raw = renderToStaticMarkup(
      <Text className="df" style={S}>
        $485K
      </Text>,
    );
    expect(ours).toBe(raw);
  });
});

describe("EditableText — canvas mode (scope present)", () => {
  it("renders contentEditable with the path attr and escaped content", () => {
    const html = renderToStaticMarkup(
      <EditableText
        as={Text}
        style={S}
        value={`<i>&`}
        path="body"
        scope={scope}
        placeholder="Add text…"
      />,
    );
    // react-email's Text re-emits the prop camelCased; HTML attribute names are
    // case-insensitive, so both spellings are editable in the browser.
    expect(html.toLowerCase()).toContain('contenteditable="true"');
    expect(html).toContain('data-edit-path="body"');
    expect(html).toContain('data-placeholder="Add text…"');
    expect(html).toContain("&lt;i&gt;&amp;");
  });

  it("as omitted becomes an editable span", () => {
    const html = renderToStaticMarkup(
      <EditableText value="34" path="stats.0.value" scope={scope} />,
    );
    expect(html).toStartWith("<span");
    expect(html).toContain('data-edit-path="stats.0.value"');
  });
});

describe("readEditedText", () => {
  it("normalizes NBSP and trims trailing newlines", () => {
    const el = { innerText: "a b\n\n" } as unknown as HTMLElement;
    expect(readEditedText(el)).toBe("a b");
  });
});
