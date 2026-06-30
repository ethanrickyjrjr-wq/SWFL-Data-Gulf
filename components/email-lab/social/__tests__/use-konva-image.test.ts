import { test, expect } from "bun:test";
import { useKonvaImage } from "@/components/email-lab/social/use-konva-image";

test("hook is exported and is a function (mount behaviour is covered by live-verify)", () => {
  expect(typeof useKonvaImage).toBe("function");
});
