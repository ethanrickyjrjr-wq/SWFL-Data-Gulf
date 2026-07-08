import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { MediaPanel } from "./MediaPanel";

const meta = {
  component: MediaPanel,
  tags: ["ai-generated"],
} satisfies Meta<typeof MediaPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { onApply: fn() } };
