import Link from "next/link";

const foundationItems = [
  { title: "Next.js App Router", detail: "TypeScript · Standalone Build" },
  { title: "SQLite + Drizzle ORM", detail: "Automatic Directory & File Provisioning" },
  { title: "Secure Server Environment", detail: "Strict Server-Only Zod Variables" },
  { title: "M1-M2 Work Completed", detail: "Core Tables, AI Engine, Decoupled Scoring" },
];

export default function HomePage() {
  return (
    <main className="shell">
      <section className="panel">
        <div className="kicker">[ 0x00_ENTRY_POINT ]</div>
        <h1 className="home-title">测评生产与验证工作台</h1>
        <p className="lead home-lead">
          系统运行环境已就绪。这是一款面向内部团队的探索性测评生产与评估工作台，搭载同步选择计分与异步 AI 开放题评分引擎。
        </p>

        <div className="actions home-actions">
          <Link className="button" href="/admin">
            进入工作台
          </Link>
        </div>
      </section>

      <div className="kicker">[ SYSTEM_REGISTERS ]</div>
      <section className="grid" aria-label="系统基础架构及就绪状态">
        {foundationItems.map((item) => (
          <div className="status foundation-status" key={item.title}>
            <div className="foundation-status-heading">
              <span className="dot" aria-hidden="true" />
              <strong>{item.title}</strong>
            </div>
            <span className="foundation-status-detail">{item.detail}</span>
          </div>
        ))}
      </section>
    </main>
  );
}
