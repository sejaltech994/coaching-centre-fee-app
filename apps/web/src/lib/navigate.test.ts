import { afterEach, describe, expect, it, vi } from "vitest";
import { navigate } from "./navigate";

const original = window.location;

afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: original });
});

describe("navigate", () => {
  it("leaves the app for the given URL", () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { assign } });

    navigate("http://localhost:8787/api/v1/auth/google/start");

    expect(assign).toHaveBeenCalledWith("http://localhost:8787/api/v1/auth/google/start");
  });
});
