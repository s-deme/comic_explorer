import { API_VERSION, type RequestContext } from "../../../types/api";
import type { Generation, RequestId } from "../../../types/domain";

let requestSequence = 0;

export function context(generation: number): RequestContext {
  requestSequence += 1;
  return {
    apiVersion: API_VERSION,
    requestId: `ui-${requestSequence}` as RequestId,
    generation: generation as Generation,
  };
}
