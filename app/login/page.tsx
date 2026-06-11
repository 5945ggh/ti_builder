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
      <section className="panel">
        <div className="kicker">Admin Access</div>
        <h1>后台登录</h1>
        <p className="lead compact">输入共享管理口令后进入工作台。成员身份会在登录后选择，只用于后续创建、修改和发布归因。</p>
        <LoginForm nextPath={nextPath} />
      </section>
    </main>
  );
}
