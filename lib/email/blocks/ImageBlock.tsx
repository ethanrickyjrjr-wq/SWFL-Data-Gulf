// lib/email/blocks/ImageBlock.tsx — PURE. Full-width photo + caption, with optional text overlay.
import { Img, Link, Section, Text } from "@react-email/components";
import type { EmailGlobalStyle, ImageProps } from "../doc/types";
import { fontStack, MUTED, CARD_BG, BORDER } from "./styles";

export function ImageBlock({
  props,
  globalStyle,
}: {
  props: ImageProps;
  globalStyle: EmailGlobalStyle;
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
          backgroundColor: props.url ? undefined : "#111827",
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
          {props.overlayTitle ? (
            <Text
              style={{
                fontFamily: font,
                fontSize: "30px",
                fontWeight: "700",
                color: textColor,
                margin: "0 0 12px",
                lineHeight: "1.2",
              }}
            >
              {props.overlayTitle}
            </Text>
          ) : null}
          {props.overlayBody ? (
            <Text
              style={{
                fontFamily: font,
                fontSize: "16px",
                color: textColor,
                margin: 0,
                lineHeight: "1.5",
              }}
            >
              {props.overlayBody}
            </Text>
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

  const imgEl = props.url ? (
    <Img
      src={props.url}
      alt={props.alt ?? ""}
      style={{ width: "100%", maxWidth: "600px", display: "block", margin: 0 }}
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
      {props.caption ? (
        <Text
          style={{
            fontFamily: font,
            fontSize: "12px",
            color: MUTED,
            textAlign: "center",
            margin: "8px 0",
            padding: "0 24px",
          }}
        >
          {props.caption}
        </Text>
      ) : null}
    </Section>
  );
}
