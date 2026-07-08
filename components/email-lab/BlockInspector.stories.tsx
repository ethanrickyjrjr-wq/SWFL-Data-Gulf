import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { BlockInspector } from "./BlockInspector";
import type { EmailBlock } from "@/lib/email/doc/types";

const HERO_BLOCK: EmailBlock = {
  id: "hero1",
  type: "hero",
  props: {
    kicker: "FENCE 4 — LEGAL PAIRING",
    value: "Fort Myers, FL",
    label: "display: PLAYFAIR_SERIF",
    prose: "Real EmailBlock shape — same type used by the actual grid canvas.",
  },
};

const meta = {
  component: BlockInspector,
  // AI-only chat path (onBlockAi) not exercised — smoke-render only.
  tags: ["ai-generated"],
  args: {
    block: HERO_BLOCK,
    onChange: fn(),
    onDelete: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof BlockInspector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HeroBlock: Story = {};
