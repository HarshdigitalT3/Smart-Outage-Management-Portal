type EnvSpec = Record<string, { required?: boolean }>;

export class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvValidationError";
  }
}

// PUBLIC_INTERFACE
export function validateEnv(
  env: NodeJS.ProcessEnv,
  spec: EnvSpec
): Record<string, string> {
  /**
   * Validates required environment variables and returns a narrowed string map.
   * Throws EnvValidationError if any required var is missing/empty.
   */
  const out: Record<string, string> = {};
  const missing: string[] = [];

  for (const [key, rules] of Object.entries(spec)) {
    const raw = env[key];
    const isMissing = raw === undefined || raw === null || String(raw).trim() === "";
    if (rules.required && isMissing) missing.push(key);
    if (!isMissing) out[key] = String(raw);
  }

  if (missing.length) {
    throw new EnvValidationError(`Missing required environment variables: ${missing.join(", ")}`);
  }
  return out;
}
