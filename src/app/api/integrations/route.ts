import { NextResponse } from "next/server";

// 返回各可选素材/音频集成是否已配置 key，前端据此显隐对应入口，
// 未配置时不显示新功能，保持与之前一致的界面与流程。
export async function GET() {
  return NextResponse.json({
    ok: true,
    integrations: {
      pexels: Boolean(process.env.PEXELS_API_KEY),
      pixabay: Boolean(process.env.PIXABAY_API_KEY),
      jamendo: Boolean(process.env.JAMENDO_CLIENT_ID),
      freesound: Boolean(process.env.FREESOUND_API_KEY),
    },
  });
}
