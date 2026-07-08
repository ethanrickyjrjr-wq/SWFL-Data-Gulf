import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "./card";

const meta = {
  component: Card,
  tags: ["ai-generated"],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Fort Myers, FL</CardTitle>
      </CardHeader>
      <CardContent>Real card composition — header, content, footer.</CardContent>
      <CardFooter>Sourced from the actual Card primitive, not redrawn.</CardFooter>
    </Card>
  ),
};
