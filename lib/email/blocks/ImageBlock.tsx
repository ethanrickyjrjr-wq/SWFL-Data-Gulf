// lib/email/blocks/ImageBlock.tsx — PURE. Full-width photo + caption, with optional text overlay.
import { Img, Link, Section, Text } from "@react-email/components";
import type { EmailGlobalStyle, ImageProps } from "../doc/types";
import { fontStack, MUTED, CARD_BG, BORDER } from "./styles";
import { EditableText, type EditScope } from "./editable-text";

export function ImageBlock({
  props,
  globalStyle,
  scope,
}: {
  props: ImageProps;
  globalStyle: EmailGlobalStyle;
  scope?: EditScope;
}) {
  const font = fontStack(globalStyle.fontFamily);
  const hasOverlay = Boolean(props.overlayTitle || props.overlayBody);

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
            padding: "60px 40px",
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
                fontSize: "30px",
                fontWeight: "700",
                color: textColor,
                margin: "0 0 12px",
                lineHeight: "1.2",
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
                fontSize: "16px",
                color: textColor,
                margin: 0,
                lineHeight: "1.5",
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

  const imgEl = props.url ? (
    <Img
      src={props.url}
      alt={props.alt ?? ""}
      style={{
        width: "100%",
        maxWidth: "600px",
        display: "block",
        margin: 0,
        ...photoRatioStyle,
      }}
    />
  ) : (
    <Section
      style={{
        padding: "48px 24px",
        textAlign: "center",
        backgroundColor: "#F3F4F6",
        border: `1px dashed ${BORDER}`,
      }}
    >
      <Text style={{ fontFamily: font, fontSize: "13px", color: MUTED, margin: 0 }}>Image</Text>
    </Section>
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
            fontSize: "12px",
            color: MUTED,
            textAlign: "center",
            margin: "8px 0",
            padding: "0 24px",
          }}
        />
      ) : null}
    </Section>
  );
}
