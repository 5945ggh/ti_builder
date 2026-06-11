import Link from "next/link";

const foundationItems = [
  "Next.js App Router + TypeScript",
  "SQLite + Drizzle ORM 连接占位",
  "服务端环境变量校验",
  "后续任务按 handovers 逐项接入登录、表结构和问卷流程",
];

export default function HomePage() {
  return (
    <main className="shell">
      <section className="panel">
        <div className="kicker">内部工具</div>
        <h1>测评生产与验证工作台</h1>
        <p className="lead">
          基础工程已就绪。当前页面作为工作台入口和空状态，等待 M1 任务接入成员、问卷、发布和作答数据。
        </p>
        <div className="actions">
          <Link className="button" href="/admin">
            进入工作台
          </Link>
        </div>
      </section>

      <section className="grid" aria-label="工程基础状态">
        {foundationItems.map((item) => (
          <div className="status" key={item}>
            <span className="dot" aria-hidden="true" />
            <span>{item}</span>
          </div>
        ))}
      </section>
    </main>
  );
}
