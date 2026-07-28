import { describe, expect, it } from "vitest";
import {
  API_VERSION,
  CONTRACT_LIMITS,
  isCurrentResponse,
  type ApiResponse,
  type RequestContext,
} from "./api";
import type { Generation, RequestId } from "./domain";

const requestId = "request-1" as RequestId;
const generation = 7 as Generation;

describe("UI/backend contract", () => {
  it("pins the API version and resource limits", () => {
    const context: RequestContext = {
      apiVersion: API_VERSION,
      requestId,
      generation,
    };

    expect(context.apiVersion).toBe(1);
    expect(CONTRACT_LIMITS).toEqual({
      channelItems: 512,
      imageBytes: 268_435_456,
      imagePixels: 120_000_000,
      archiveEntries: 100_000,
      archiveEntryBytes: 536_870_912,
      archiveTotalBytes: 8_589_934_592,
    });
  });

  it("rejects a result from an obsolete navigation generation", () => {
    const response: ApiResponse<string> = {
      status: "ok",
      requestId,
      generation,
      data: "old folder",
    };

    expect(isCurrentResponse(response, generation)).toBe(true);
    expect(isCurrentResponse(response, 8 as Generation)).toBe(false);
  });

  it("models cancellation separately from failure", () => {
    const response: ApiResponse<never> = {
      status: "cancelled",
      requestId,
      generation,
    };

    expect(response.status).toBe("cancelled");
    expect("error" in response).toBe(false);
  });
});
