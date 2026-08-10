// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ErrorCode } from "../../types/domain";
import { presentError, presentUnexpectedError } from "./presentation";

describe("error presentation", () => {
  it("maps every API code to a fixed user-facing classification", () => {
    const cases: [ErrorCode, string][] = [
      [
        "INVALID_REQUEST",
        "対応していません。対応する画像、ZIP、CBZ、EPUBを選んでください。",
      ],
      [
        "INVALID_PATH",
        "対応していません。対応する画像、ZIP、CBZ、EPUBを選んでください。",
      ],
      [
        "OUTSIDE_LIBRARY_ROOT",
        "対応していません。ライブラリルート内の対象を選んでください。",
      ],
      [
        "NOT_FOUND",
        "見つかりません。対象が移動または削除された可能性があります。",
      ],
      [
        "ACCESS_DENIED",
        "アクセスできません。権限または他のアプリによる使用状況を確認してください。",
      ],
      [
        "UNSUPPORTED_FORMAT",
        "対応していません。対応する画像、ZIP、CBZ、EPUBを選んでください。",
      ],
      [
        "CORRUPT_IMAGE",
        "データが破損しています。ファイルを読み込めません。",
      ],
      [
        "CORRUPT_ARCHIVE",
        "データが破損しています。ファイルを読み込めません。",
      ],
      [
        "ENCRYPTED_ARCHIVE",
        "暗号化されています。暗号化された書庫は開けません。",
      ],
      [
        "RESOURCE_LIMIT",
        "一時的に使用できません。しばらくしてから再試行してください。",
      ],
      [
        "CANCELLED",
        "一時的に使用できません。しばらくしてから再試行してください。",
      ],
      [
        "INTERNAL",
        "一時的に使用できません。しばらくしてから再試行してください。",
      ],
    ];

    for (const [code, expected] of cases) {
      const message = presentError({ code });
      expect(message).toBe(expected);
      expect(message).not.toMatch(/Error|stack|os error|\\\\\?\\/i);
    }
  });

  it("does not expose thrown exception text", () => {
    expect(presentUnexpectedError()).not.toContain("secret stack");
  });
});
