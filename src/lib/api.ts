import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function apiError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ ok: false, error: error.issues[0]?.message ?? "输入校验失败" }, { status: 400 });
  }
  console.error("API error", error instanceof Error ? error.message : "unknown");
  return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "服务器处理失败" }, { status: 500 });
}
