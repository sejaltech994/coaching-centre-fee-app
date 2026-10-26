import { describe, expect, it } from "vitest";
import { delay } from "./motion";

describe("delay", () => {
  it("sets the --delay custom property read by the rise and pop animations", () => {
    expect(delay(340)).toEqual({ "--delay": "340ms" });
  });
});
