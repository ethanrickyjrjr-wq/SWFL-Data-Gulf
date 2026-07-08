import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";
import { Badge } from "./badge";

const meta = {
  component: Badge,
  tags: ["ai-generated"],
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

// The component's own default parameter is variant = "secondary" — "Default"
// here means "no variant passed", which renders secondary, not the teal fill.
export const Default: Story = { args: { children: "Draft" } };
export const Filled: Story = { args: { children: "Verified", variant: "default" } };
export const Outline: Story = { args: { children: "Pending", variant: "outline" } };

// variant:"default" resolves --brand-primary → --gulf-teal → #3DC9C0
// (app/globals.css) — this is the one CssCheck story for the whole project,
// proving the shared preview actually loaded the real global stylesheet, not
// just Storybook's own CSS.
export const CssCheck: Story = {
  args: { children: "Verified", variant: "default" },
  play: async ({ canvas }) => {
    const badge = canvas.getByText("Verified");
    expect(getComputedStyle(badge).backgroundColor).toBe("rgb(61, 201, 192)");
  },
};
