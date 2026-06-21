import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";

export const SESSION_COOKIE = "sparkreel_session";

function secret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET ?? "development-only-change-me");
}

export function authConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD_HASH);
}

export async function verifyPassword(password: string) {
  if (process.env.ADMIN_PASSWORD_HASH) return bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
  if (process.env.ADMIN_PASSWORD) return password === process.env.ADMIN_PASSWORD;
  return true;
}

export async function createSession() {
  return new SignJWT({ role: "owner" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
}

export async function verifySession(token?: string) {
  if (!authConfigured()) return true;
  if (!token) return false;
  try {
    await jwtVerify(token, secret());
    return true;
  } catch {
    return false;
  }
}
