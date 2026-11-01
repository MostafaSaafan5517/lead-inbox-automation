// Shared by the workflow and blueprint tests: finds strings that look like secrets.
const SECRET_PATTERNS = [
  /AIza[0-9A-Za-z_-]{30,}/, // Google API key
  /ya29\.[0-9A-Za-z_-]+/, // Google OAuth access token
  /1\/\/0[0-9A-Za-z_-]{20,}/, // Google OAuth refresh token
  /GOCSPX-[0-9A-Za-z_-]+/, // Google OAuth client secret
  /\bsk-[0-9A-Za-z]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function allStrings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (value && typeof value === "object") for (const child of Object.values(value)) allStrings(child, out);
  return out;
}

// Returns a short description of every secret-looking string in a parsed JSON value.
export function findSecretLikeStrings(value) {
  const findings = [];
  for (const text of allStrings(value)) {
    for (const pattern of SECRET_PATTERNS) if (pattern.test(text)) findings.push(`matches ${pattern}`);
    for (const token of text.match(/[A-Za-z0-9+/_=-]{40,}/g) ?? []) {
      if (!UUID.test(token)) findings.push(`long token-like string: ${token.slice(0, 12)}...`);
    }
  }
  return findings;
}
