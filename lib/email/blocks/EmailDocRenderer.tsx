// lib/email/blocks/EmailDocRenderer.tsx — PURE (no "use client"). Wraps the
// block list in Html+Body+Container. Used by the render API route via
// render(EmailDocEmail({ doc })) — same proven pattern as DigestEmail.tsx.
import { Html, Head, Body, Container, Preview } from "@react-email/components";
import { BlockRenderer } from "./BlockRenderer";
import type { EmailDoc } from "../doc/types";
import { WEB_FONT_URLS } from "./styles";

export function EmailDocEmail({ doc, preview }: { doc: EmailDoc; preview?: string }) {
  const webFontUrl = WEB_FONT_URLS[doc.globalStyle.fontFamily];
  return (
    <Html lang="en">
      <Head>{webFontUrl ? <link rel="stylesheet" href={webFontUrl} /> : null}</Head>
      {preview ? <Preview>{preview}</Preview> : null}
      <Body style={{ backgroundColor: doc.globalStyle.backdropColor, margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: "600px", margin: "0 auto", backgroundColor: "#ffffff" }}>
          {doc.blocks.map((block) => (
            <BlockRenderer key={block.id} block={block} globalStyle={doc.globalStyle} />
          ))}
        </Container>
      </Body>
    </Html>
  );
}
