// The preview never calls Claude. This stands in for the SDK so the API code bundles.
class APIError extends Error {}
export default class Anthropic {
  static APIError = APIError;
  static RateLimitError = class extends APIError {};
  static AuthenticationError = class extends APIError {};
  static PermissionDeniedError = class extends APIError {};
  static BadRequestError = class extends APIError {};
  static APIConnectionError = class extends APIError {};
  static APIUserAbortError = class extends APIError {};
  constructor() {
    throw new Error("The preview has no Claude connection.");
  }
}
