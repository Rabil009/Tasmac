/**
 * Typed application errors, user-safe message normalization and recursive
 * context redaction for client logging/telemetry.
 */
export type AppErrorKind =
  | "validation"
  | "permission"
  | "not_found"
  | "conflict"
  | "network"
  | "auth"
  | "unknown";

export class AppError extends Error {
  readonly kind: AppErrorKind;
  constructor(
    kind: AppErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AppError";
    this.kind = kind;
  }
}

export const GENERIC_MESSAGE =
  "Something went wrong. Please try again or contact the State Administrator.";
const KIND_MESSAGE: Record<AppErrorKind, string> = {
  validation: "Some values are not valid. Check the form and try again.",
  permission:
    "You do not have permission for this action in your assigned scope.",
  not_found: "The requested record was not found or is outside your scope.",
  conflict: "This record conflicts with an existing one.",
  network:
    "The TASMAC service could not be reached. Check your connection and retry.",
  auth: "Your session has expired. Please sign in again.",
  unknown: GENERIC_MESSAGE,
};

/** Patterns that indicate raw database, driver or internal detail. */
const INTERNAL = [
  /violates|constraint|relation "|column "|syntax error|function .*\(|duplicate key|null value in/i,
  /permission denied|row-level security|JWT|PGRST|SQLSTATE|\bP0\d{3}\b|\b[0-9A-Z]{5}\b:/,
  /\bat \S+:\d+:\d+|stack|undefined is not|cannot read propert|TypeError|ReferenceError/i,
  /https?:\/\/|supabase|postgres|select .* from|insert into/i,
];

function classify(e: unknown): AppErrorKind {
  const o = (e ?? {}) as {
    code?: unknown;
    status?: unknown;
    message?: unknown;
  };
  const code = typeof o.code === "string" ? o.code : "";
  const msg = typeof o.message === "string" ? o.message : "";
  if (o.status === 0 || /failed to fetch|network|load failed/i.test(msg))
    return "network";
  if (code === "42501" || /permission denied|row-level security/i.test(msg))
    return "permission";
  if (code === "23505") return "conflict";
  if (code.startsWith("23") || code === "22023" || code === "P0001")
    return "validation";
  if (code === "PGRST116") return "not_found";
  if (o.status === 401 || /jwt expired|refresh token/i.test(msg)) return "auth";
  return "unknown";
}

/** Converts anything thrown into an AppError with a user-safe message. */
export function normalizeError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  const kind = classify(e);
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  const safe = raw && raw.length <= 220 && !INTERNAL.some((r) => r.test(raw));
  return new AppError(kind, safe ? raw : KIND_MESSAGE[kind], { cause: e });
}

/** User-facing message for any error. Never returns raw database/internal text. */
export const userMessage = (e: unknown) => normalizeError(e).message;

const SENSITIVE_KEY =
  /pass(word)?|secret|token|authorization|cookie|api[-_]?key|session|credential|jwt|bearer|email|phone|mobile|aadhaar|pan|address|full_?name|ssn/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const BEARER = /\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const KEYLIKE =
  /\b(sb_(secret|publishable)_[A-Za-z0-9_-]+|sk_[A-Za-z0-9]{16,})/g;
const PHONE = /(?<!\d)(\+?91[\s-]?)?[6-9]\d{9}(?!\d)/g;
export const REDACTED = "[REDACTED]";

export function redactString(s: string): string {
  return s
    .replace(JWT, REDACTED)
    .replace(BEARER, REDACTED)
    .replace(KEYLIKE, REDACTED)
    .replace(EMAIL, REDACTED)
    .replace(PHONE, REDACTED);
}

/** Recursively redacts sensitive keys and identifier-like values; handles cycles and depth. */
export function sanitizeContext(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value !== "object") return value;
  if (depth > 6) return "[Truncated]";
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (value instanceof Error)
    return { name: value.name, message: redactString(value.message) };
  if (Array.isArray(value))
    return value.slice(0, 50).map((v) => sanitizeContext(v, depth + 1, seen));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value))
    out[k] = SENSITIVE_KEY.test(k)
      ? REDACTED
      : sanitizeContext(v, depth + 1, seen);
  return out;
}
