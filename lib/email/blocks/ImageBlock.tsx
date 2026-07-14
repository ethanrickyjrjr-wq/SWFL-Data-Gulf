// lib/email/blocks/ImageBlock.tsx — PURE. Full-width photo + caption, with optional text overlay.
import { Img, Link, Section, Text } from "@react-email/components";
import type { EmailGlobalStyle, ImageProps } from "../doc/types";
import { fontStack, MUTED, CARD_BG, BORDER } from "./styles";
import { text, pad, space, CARD_PAD } from "./scale";
import { EditableText, type EditScope } from "./editable-text";
import { ImageSlot } from "./OpenSlot";

export function ImageBlock({
  props,
  globalStyle,
  emailRender,
  scope,
}: {
  props: ImageProps;
  globalStyle: EmailGlobalStyle;
  /** True on the sendable-HTML paths — an image we never sourced is an OPEN SLOT on
   *  the canvas (file picker + paste-a-link) and DOES NOT EXIST in the email. The
   *  gray "Image" box used to ship to real recipients. */
  emailRender?: boolean;
  scope?: EditScope;
}) {
  const font = fontStack(globalStyle.fontFamily);
  const hasOverlay = Boolean(props.overlayTitle || props.overlayBody);

  // Nothing to show: no picture AND no overlay text. (An overlay with no url is a
  // DELIBERATE colored panel — it carries content, so it ships.) A caption alone is
  // not content: a caption under nothing is a naked label.
  if (!props.url && !hasOverlay) {
    if (emailRender) return null;
    const isChart = props.kind === "chart";
    // The label IS the instruction: the alt text says what belongs here.
    const instruction = isChart
      ? (props.alt ?? "Chart")
      : props.alt
        ? `Add the photo — ${props.alt}`
        : "Add a photo";
    return (
      <Section
        style={{ backgroundColor: props.sectionBg ?? CARD_BG, borderBottom: `1px solid ${BORDER}` }}
      >
        <ImageSlot instruction={instruction} font={font} scope={scope} isChart={isChart} />
      </Section>
    );
  }

  if (hasOverlay) {
    const overlayBg = props.overlayBg ?? "rgba(0,0,0,0.45)";
    const textColor = props.overlayTextColor ?? "#ffffff";
    const align = props.overlayAlign ?? "center";
    const inner = (
      <Section
        style={{
          backgroundImage: props.url ? `url(${props.url})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          // Unfilled overlay slot: a neutral mid-gray placeholder, not a near-black
          // rectangle that reads as a second dark section band when a template also
          // uses a dark band block nearby (the magazine-issue "two black boxes" bug).
          backgroundColor: props.url ? undefined : "#9CA3AF",
          borderBottom: `1px solid ${BORDER}`,
        }}
      >
        <Section
          style={{
            backgroundColor: overlayBg,
            padding: pad(64, 48),
            textAlign: align,
          }}
        >
          {props.overlayTitle || scope ? (
            <EditableText
              as={Text}
              value={props.overlayTitle ?? ""}
              path="overlayTitle"
              scope={scope}
              placeholder="Headline"
              style={{
                fontFamily: font,
                ...text("h2"),
                fontWeight: "700",
                color: textColor,
                margin: space(0, 0, 12),
              }}
            />
          ) : null}
          {props.overlayBody || scope ? (
            <EditableText
              as={Text}
              value={props.overlayBody ?? ""}
              path="overlayBody"
              scope={scope}
              multiline
              placeholder="Supporting text"
              style={{
                fontFamily: font,
                ...text("body"),
                color: textColor,
                margin: 0,
              }}
            />
          ) : null}
        </Section>
      </Section>
    );
    return props.linkUrl ? (
      <Link href={props.linkUrl} style={{ display: "block" }}>
        {inner}
      </Link>
    ) : (
      inner
    );
  }

  // Fence 3 (2026-07-08 fence spec) — a listing photo displays center-cropped to
  // a blessed aspect ratio (the photo-size variety axis, block-contract.ts). The
  // ratio is user-choosable in the canvas; absent → 3:2 (the MLS standard), so
  // every existing doc renders identically. Progressive enhancement: ~41%
  // email-client support per caniemail, Outlook desktop falls back to today's
  // unconstrained render (never worse), matching lib/brand/fonts.ts's webfont policy.
  // A photo crops to 3:2 by default; a ratio set in the canvas picker crops any
  // image (kind or not). No kind and no ratio → today's unconstrained render.
  const wantsRatio = props.kind === "photo" || props.ratio != null;
  const photoRatioStyle = wantsRatio
    ? { aspectRatio: (props.ratio ?? "3:2").replace(":", " / "), objectFit: "cover" as const }
    : {};

  // Past the empty-slot guard above, a non-overlay image ALWAYS has a url — the old
  // "Image" placeholder box (which shipped to recipients) is gone with it.
  const imgEl = (
    <Img
      src={props.url ?? ""}
      alt={props.alt ?? ""}
      style={{
        width: "100%",
        maxWidth: "600px",
        display: "block",
        margin: 0,
        ...photoRatioStyle,
      }}
    />
  );
  return (
    <Section
      style={{ backgroundColor: props.sectionBg ?? CARD_BG, borderBottom: `1px solid ${BORDER}` }}
    >
      {props.linkUrl ? (
        <Link href={props.linkUrl} style={{ display: "block" }}>
          {imgEl}
        </Link>
      ) : (
        imgEl
      )}
      {props.caption || scope ? (
        <EditableText
          as={Text}
          value={props.caption ?? ""}
          path="caption"
          scope={scope}
          placeholder="Caption"
          style={{
            fontFamily: font,
            ...text("caption"),
            color: MUTED,
            textAlign: "center",
            margin: space(8, 0),
            padding: pad(0, CARD_PAD),
          }}
        />
      ) : null}
    </Section>
  );
}
