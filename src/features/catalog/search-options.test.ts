import { describe, expect, it } from "vitest";
import {
  defaultSearchOptions,
  toSearchRequestOptions,
} from "./search-options";

describe("search options", () => {
  it("maps kind, fixed-location, and size options to the backend request", () => {
    const options = defaultSearchOptions(Date.UTC(2026, 7, 11));
    options.includeSubfolders = false;
    options.includeFolders = false;
    options.includeFiles = true;
    options.fixedLocation = "Series/Current";
    options.sizeEnabled = true;
    options.sizeKiB = 512;
    options.sizeComparison = "atLeast";

    expect(toSearchRequestOptions(options)).toEqual({
      includeSubfolders: false,
      includeFolders: false,
      includeFiles: true,
      fixedLocation: "Series/Current",
      minSizeBytes: 512 * 1024,
    });
  });

  it("creates inclusive date bounds for a selected calendar date or period", () => {
    const options = defaultSearchOptions(Date.UTC(2026, 7, 11));
    options.dateEnabled = true;
    options.dateMode = "calendarDate";
    options.dateComparison = "before";
    options.dateStart = "2026-08-10";

    expect(toSearchRequestOptions(options)).toMatchObject({
      modifiedBeforeMs: Date.UTC(2026, 7, 10, 23, 59, 59, 999),
    });

    options.dateComparison = "between";
    options.dateEnd = "2026-08-08";
    expect(toSearchRequestOptions(options)).toMatchObject({
      modifiedAfterMs: Date.UTC(2026, 7, 8),
      modifiedBeforeMs: Date.UTC(2026, 7, 10, 23, 59, 59, 999),
    });
  });
});
