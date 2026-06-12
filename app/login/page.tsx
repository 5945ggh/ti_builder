import { LoginForm } from "./login-form";

function safeNextPath(next?: string | string[]): string {
  const value = Array.isArray(next) ? next[0] : next;

  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/admin";
  }

  return value;
}

type LoginPageProps = {
  searchParams?: Promise<{
    next?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = searchParams ? await searchParams : {};
  const nextPath = safeNextPath(params.next);

  return (
    <main className="shell narrow">
      <section className="panel" style={{ borderTop: "4px solid var(--color-primary)" }}>
        <div className="kicker">[ 0x0A_GATEWAY ]</div>
        <h1 style={{ fontSize: "var(--text-xl)" }}>后台登录</h1>
        <p className="lead compact" style={{ marginBottom: "var(--space-4)", fontSize: "var(--text-sm)" }}>
          请输入共享管理口令进入工作台。归因成员将在验证通过后选择，用于追踪后续生产修改流。
        </p>
        <LoginForm nextPath={nextPath} />
      </section>
    </main>
  );
}
