export const ADMIN_SESSION_COOKIE = "ti_admin_session";

export type AdminSession = {
  authenticated: boolean;
  selectedMemberId?: string;
};

type SessionPayload = AdminSession & {
  issuedAt: number;
};

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export const adminSessionCookieOptions = {
  httpOnly: true,
  maxAge: SESSION_MAX_AGE_SECONDS,
  path: "/",
  sameSite: "lax" as const,
};

function base64UrlEncode(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(input: string): string {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

async function getSigningKey(): Promise<CryptoKey | null> {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < 32) {
    return null;
  }

  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign", "verify"],
  );
}

async function signPayload(encodedPayload: string): Promise<string | null> {
  const key = await getSigningKey();

  if (!key) {
    return null;
  }

  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encodedPayload));

  return base64UrlEncode(new Uint8Array(signature));
}

async function verifySignature(encodedPayload: string, encodedSignature: string): Promise<boolean> {
  const expectedSignature = await signPayload(encodedPayload);

  return expectedSignature === encodedSignature;
}

export async function encodeAdminSession(session: AdminSession): Promise<string | null> {
  const payload: SessionPayload = {
    authenticated: session.authenticated,
    issuedAt: Date.now(),
    selectedMemberId: session.selectedMemberId,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await signPayload(encodedPayload);

  if (!signature) {
    return null;
  }

  return `${encodedPayload}.${signature}`;
}

export async function decodeAdminSession(cookieValue?: string): Promise<AdminSession | null> {
  if (!cookieValue) {
    return null;
  }

  const [encodedPayload, encodedSignature] = cookieValue.split(".");

  if (!encodedPayload || !encodedSignature) {
    return null;
  }

  const isValid = await verifySignature(encodedPayload, encodedSignature);

  if (!isValid) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as Partial<SessionPayload>;
    const issuedAt = typeof payload.issuedAt === "number" ? payload.issuedAt : 0;
    const isExpired = Date.now() - issuedAt > SESSION_MAX_AGE_SECONDS * 1000;

    if (payload.authenticated !== true || isExpired) {
      return null;
    }

    return {
      authenticated: true,
      selectedMemberId: typeof payload.selectedMemberId === "string" ? payload.selectedMemberId : undefined,
    };
  } catch {
    return null;
  }
}
