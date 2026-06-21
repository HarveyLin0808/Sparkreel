"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await response.json();
    if (!response.ok) return setError(data.error ?? "登录失败");
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-mark">D</div>
        <p className="eyebrow">PERSONAL CREATOR OS</p>
        <h1>回到你的创作台</h1>
        <p className="muted">单用户空间，仅保存你的创作项目与素材。</p>
        <label>
          管理密码
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button className="primary wide" type="submit">进入工作台</button>
      </form>
    </main>
  );
}
