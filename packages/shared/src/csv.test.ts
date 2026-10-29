import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "./csv";

describe("parseCsv", () => {
  it("reads rows and fields, trimming the line endings Excel and Sheets write", () => {
    expect(parseCsv("a,b\r\nc,d\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("handles quoted fields: commas, quotes and line breaks inside", () => {
    expect(parseCsv('"Rao, Diya","She said ""hi""","two\nlines"\n')).toEqual([["Rao, Diya", 'She said "hi"', "two\nlines"]]);
  });

  it("drops Excel's byte-order mark and blank lines", () => {
    expect(parseCsv("﻿name\n\nAarav\n  \n")).toEqual([["name"], ["Aarav"]]);
  });

  it("keeps empty fields", () => {
    expect(parseCsv("a,,c")).toEqual([["a", "", "c"]]);
  });
});

describe("toCsv", () => {
  it("quotes only what needs quoting", () => {
    expect(toCsv([["Name", "Note"], ["Rao, Diya", 'say "hi"'], ["Aarav", "fine"]])).toBe('Name,Note\r\n"Rao, Diya","say ""hi"""\r\nAarav,fine\r\n');
  });
});
