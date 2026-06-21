import { NextResponse } from "next/server";
import { createSession, SESSION_COOKIE, verifyPassword } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json();
  if (!(await verifyPassword(String(body.password ?? "")))) {
    return NextResponse.json({ ok: false, error: "密码错误" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSession(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return response;
}
