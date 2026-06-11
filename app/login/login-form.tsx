"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type LoginFormProps = {
  nextPath: string;
};

export function LoginForm({ nextPath }: LoginFormProps) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/auth/login", {
      body: JSON.stringify({ password }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(
        body?.error === "admin_password_not_configured"
          ? "后台口令尚未配置，请先设置 ADMIN_ACCESS_PASSWORD。"
          : body?.error === "session_secret_not_configured"
            ? "会话密钥尚未配置，请先设置 SESSION_SECRET。"
            : "管理口令不正确。",
      );
      setPassword("");
      return;
    }

    router.replace(nextPath);
    router.refresh();
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <label className="field">
        <span>管理口令</span>
        <input
          autoComplete="current-password"
          autoFocus
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </label>

      {error ? <p className="form-error">{error}</p> : null}

      <button className="button" disabled={isSubmitting} type="submit">
        {isSubmitting ? "验证中..." : "登录"}
      </button>
    </form>
  );
}
