import { describe, expect, it } from "vitest";
import type { ErrorCode } from "../../types/domain";
import { presentError, presentUnexpectedError } from "./presentation";

describe("error presentation", () => {
  it("maps every API code to a fixed user-facing classification", () => {
    const codes: ErrorCode[] = [
      "INVALID_REQUEST", "INVALID_PATH", "OUTSIDE_LIBRARY_ROOT", "NOT_FOUND",
      "ACCESS_DENIED", "UNSUPPORTED_FORMAT", "CORRUPT_IMAGE", "CORRUPT_ARCHIVE",
      "ENCRYPTED_ARCHIVE", "RESOURCE_LIMIT", "CANCELLED", "INTERNAL",
    ];

    for (const code of codes) {
      const message = presentError({ code });
      expect(message).not.toMatch(/Error|stack|os error|\\\\\?\\/i);
      expect(message).toMatch(
        /アクセスできません|見つかりません|対応していません|データが破損しています|暗号化されています|一時的に使用できません/,
      );
    }
  });

  it("does not expose thrown exception text", () => {
    expect(presentUnexpectedError()).not.toContain("secret stack");
  });
});
