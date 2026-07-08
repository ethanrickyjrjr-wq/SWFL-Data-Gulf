import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";
import { AddBlockPanel } from "./AddBlockPanel";

const meta = {
  component: AddBlockPanel,
  tags: ["ai-generated"],
} satisfies Meta<typeof AddBlockPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

// Smoke check — proves onAdd actually fires with the real BlockType, not just
// that the button rendered.
export const Default: Story = {
  args: { onAdd: fn(), onClose: fn() },
  play: async ({ canvas, userEvent, args }) => {
    await userEvent.click(canvas.getByText("Text"));
    await expect(args.onAdd).toHaveBeenCalledWith("text");
  },
};

export const WithoutClose: Story = { args: { onAdd: fn() } };
