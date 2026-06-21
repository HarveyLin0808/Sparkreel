import { NextResponse } from "next/server";
import { getProviders } from "@/lib/providers/llm";

export async function GET() {
  return NextResponse.json({
    ok: true,
    providers: getProviders().map(({ id, name, enabled }) => ({ id, name, enabled })),
  });
}

export async function POST(request: Request) {
  const { id } = await request.json();
  const provider = getProviders().find((item) => item.id === id);
  if (!provider) return NextResponse.json({ ok: false, error: "模型不存在" }, { status: 404 });
  return NextResponse.json({ ok: true, result: await provider.testConnection() });
}
