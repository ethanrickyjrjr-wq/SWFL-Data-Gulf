// lib/email/blocks/FooterBlock.tsx — PURE. Company + address + contact + socials + unsubscribe.
import { Section, Text, Link, Hr } from "@react-email/components";
import type { EmailGlobalStyle, FooterProps } from "../doc/types";
import { PLATFORMS, platformMeta } from "../social/platforms";
import { SocialIcon } from "@/components/email-lab/social-icons";
import { fontStack, SECTION_PAD, MUTED, BORDER } from "./styles";
import { text, space } from "./scale";
import { legibleInk } from "./on-dark";
import { EditableText, type EditScope } from "./editable-text";

export function FooterBlock({
  props,
  globalStyle,
  scope,
}: {
  props: FooterProps;
  globalStyle: EmailGlobalStyle;
  scope?: EditScope;
}) {
  const font = fontStack(globalStyle.fontFamily);
  const hasContact = props.phone || props.email || props.websiteUrl;
  // Link ink picked once for the fixed footer bg (matches the Section fill below).
  const linkInk = legibleInk(globalStyle.accentColor, "#F9FAFB", 4.5);

  // Footer renders the 3 registry-mapped socials (IG/FB/LI) ordered by socialOrder
  // (registry default when unset), keeping those with a URL — same root the
  // standalone social-icons block uses. Footer is always icon+text.
  const order = props.socialOrder ?? PLATFORMS.filter((m) => m.footerPropKey).map((m) => m.type);
  const footerSocials = order
    .map((type) => {
      const meta = platformMeta(type);
      const url = meta.footerPropKey ? props[meta.footerPropKey] : undefined;
      return url && url.trim() ? { type, label: meta.label, url } : null;
    })
    .filter(
      (x): x is { type: (typeof PLATFORMS)[number]["type"]; label: string; url: string } =>
        x !== null,
    );

  return (
    <Section style={{ backgroundColor: "#F9FAFB", padding: SECTION_PAD }}>
      <Hr style={{ borderColor: BORDER, margin: space(0, 0, 16) }} />

      {/* Company + address */}
      {props.companyName || props.address || scope ? (
        <Text
          style={{
            fontFamily: font,
            ...text("caption"),
            color: MUTED,
            margin: space(0, 0, 8),
          }}
        >
          <EditableText
            value={props.companyName ?? ""}
            path="companyName"
            scope={scope}
            placeholder="Company"
          />
          {props.address || scope ? (
            <>
              <br />
              <EditableText
                value={props.address ?? ""}
                path="address"
                scope={scope}
                placeholder="Postal address (CAN-SPAM)"
              />
            </>
          ) : null}
        </Text>
      ) : null}

      {/* Contact line — phone · email · website. Phone types in place; email and
          website are link plumbing (inspector-owned), shown as static remainder
          on the canvas; the server branch keeps today's joined string verbatim. */}
      {hasContact || scope ? (
        <Text
          style={{
            fontFamily: font,
            ...text("caption"),
            color: MUTED,
            margin: space(0, 0, 8),
          }}
        >
          {scope ? (
            <>
              <EditableText
                value={props.phone ?? ""}
                path="phone"
                scope={scope}
                placeholder="Phone"
              />
              {[props.email, props.websiteUrl ? props.websiteUrl.replace(/^https?:\/\//, "") : null]
                .filter(Boolean)
                .map((s) => ` · ${s}`)
                .join("")}
            </>
          ) : (
            [
              props.phone,
              props.email,
              props.websiteUrl ? props.websiteUrl.replace(/^https?:\/\//, "") : null,
            ]
              .filter(Boolean)
              .join(" · ")
          )}
        </Text>
      ) : null}

      {/* Social links — icon + text, ordered by socialOrder */}
      {footerSocials.length ? (
        <Text style={{ fontFamily: font, ...text("caption"), margin: space(0, 0, 8) }}>
          {footerSocials.map((soc, i) => (
            <Link
              key={`${soc.type}-${i}`}
              href={soc.url}
              style={{
                color: linkInk,
                marginRight: "12px",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <SocialIcon type={soc.type} size={14} color={linkInk} label={soc.label} />
              {soc.label}
            </Link>
          ))}
        </Text>
      ) : null}

      {/* Unsubscribe — always rendered when set; legally required */}
      <Text style={{ fontFamily: font, ...text("mono"), color: MUTED, margin: space(8, 0, 0) }}>
        {props.unsubscribeUrl ? (
          <Link href={props.unsubscribeUrl} style={{ color: MUTED, textDecoration: "underline" }}>
            Unsubscribe
          </Link>
        ) : (
          <span style={{ opacity: 0.5 }}>
            Unsubscribe link required — add URL in footer settings
          </span>
        )}
      </Text>
    </Section>
  );
}
