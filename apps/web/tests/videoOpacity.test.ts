import { describe, expect, test } from "bun:test";
import { opacityAt } from "../src/landing/videoOpacity";

describe("opacityAt", () => {
  test("interpolates and clamps a fade", () => {
    expect(opacityAt(0.25, 1, 250, 500)).toBe(0.625);
    expect(opacityAt(0.25, 1, 750, 500)).toBe(1);
    expect(opacityAt(1, 0, -10, 500)).toBe(1);
  });
});
