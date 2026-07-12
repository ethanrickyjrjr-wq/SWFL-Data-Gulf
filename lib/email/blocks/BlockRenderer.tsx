// lib/email/blocks/BlockRenderer.tsx — PURE. Switch on block.type → component.
// Shared by the canvas DOM view AND the server render() export. No "use client".
import type { EmailBlock, EmailGlobalStyle } from "../doc/types";
import type { EditCommit, EditScope } from "./editable-text";
import { HeaderBlock } from "./HeaderBlock";
import { HeroBlock } from "./HeroBlock";
import { StatsBlock } from "./StatsBlock";
import { SignalBlock } from "./SignalBlock";
import { TextBlock } from "./TextBlock";
import { ImageBlock } from "./ImageBlock";
import { ListingBlock } from "./ListingBlock";
import { MultiColumnBlock } from "./MultiColumnBlock";
import { ListBlock } from "./ListBlock";
import { MetricCardBlock } from "./MetricCardBlock";
import { AgentCardBlock } from "./AgentCardBlock";
import { AgentHeroBlock } from "./AgentHeroBlock";
import { SocialIconsBlock } from "./SocialIconsBlock";
import { ButtonBlock } from "./ButtonBlock";
import { DividerBlock } from "./DividerBlock";
import { FooterBlock } from "./FooterBlock";
import { SourcesBlock } from "./SourcesBlock";

export function BlockRenderer({
  block,
  globalStyle,
  colPx,
  emailRender,
  edit,
}: {
  block: EmailBlock;
  globalStyle: EmailGlobalStyle;
  /** Rendered column width in px when the block sits in a multi-column grid row
   *  (compile-grid passes it) — lets width-sensitive blocks pick a narrow layout. */
  colPx?: number;
  /** True on the sendable-HTML paths (EmailDocRenderer, compile-grid) — canvas-only
   *  affordances (empty-state placeholders) must not reach a recipient. */
  emailRender?: boolean;
  /** Canvas-editing hook (GridCanvas passes it; server callers never do).
   *  Present → adopted components render their text via EditableText. */
  edit?: { commit: EditCommit };
}) {
  const scope: EditScope | undefined = edit
    ? { blockId: block.id, commit: edit.commit }
    : undefined;
  switch (block.type) {
    case "header":
      return <HeaderBlock props={block.props} globalStyle={globalStyle} />;
    case "hero":
      return <HeroBlock props={block.props} globalStyle={globalStyle} />;
    case "stats":
      return <StatsBlock props={block.props} globalStyle={globalStyle} colPx={colPx} />;
    case "signal":
      return <SignalBlock props={block.props} globalStyle={globalStyle} />;
    case "text":
      return <TextBlock props={block.props} globalStyle={globalStyle} scope={scope} />;
    case "image":
      return <ImageBlock props={block.props} globalStyle={globalStyle} />;
    case "listing":
      return <ListingBlock props={block.props} globalStyle={globalStyle} />;
    case "multi-column":
      return <MultiColumnBlock props={block.props} globalStyle={globalStyle} />;
    case "list":
      return <ListBlock props={block.props} globalStyle={globalStyle} />;
    case "metric-card":
      return <MetricCardBlock props={block.props} globalStyle={globalStyle} />;
    case "agent-card":
      return <AgentCardBlock props={block.props} globalStyle={globalStyle} />;
    case "agent-hero":
      return <AgentHeroBlock props={block.props} globalStyle={globalStyle} />;
    case "social-icons":
      return (
        <SocialIconsBlock props={block.props} globalStyle={globalStyle} emailRender={emailRender} />
      );
    case "button":
      return <ButtonBlock props={block.props} globalStyle={globalStyle} />;
    case "divider":
      return <DividerBlock props={block.props} globalStyle={globalStyle} />;
    case "footer":
      return <FooterBlock props={block.props} globalStyle={globalStyle} />;
    case "sources":
      return <SourcesBlock props={block.props} globalStyle={globalStyle} />;
    default:
      return null;
  }
}
