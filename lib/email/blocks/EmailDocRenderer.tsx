// lib/email/blocks/EmailDocRenderer.tsx — PURE (no "use client"). Wraps the
// block list in Html+Body+Container. Used by the render API route via
// render(EmailDocEmail({ doc })).
import { Html, Head, Body, Container, Preview } from "@react-email/components";
import { BlockRenderer } from "./BlockRenderer";
import type { EmailDoc } from "../doc/types";
import { emailHeadChildren, msoFontPin } from "./email-head";

export function EmailDocEmail({ doc, preview }: { doc: EmailDoc; preview?: string }) {
  return (
    <Html lang="en">
      <Head>{emailHeadChildren(doc)}</Head>
      {preview ? <Preview>{preview}</Preview> : null}
      <Body style={{ backgroundColor: doc.globalStyle.backdropColor, margin: 0, padding: 0 }}>
        {msoFontPin(doc)}
        <Container style={{ maxWidth: "600px", margin: "0 auto", backgroundColor: "#ffffff" }}>
          {doc.blocks.map((block) => (
            <BlockRenderer key={block.id} block={block} globalStyle={doc.globalStyle} emailRender />
          ))}
        </Container>
      </Body>
    </Html>
  );
}
