import Link from "next/link";
import { getAiConfigStatus } from "@/lib/ai/client";
import { getServerEnv } from "@/lib/env";
import { AiSelfTestPanel } from "./ai-self-test-panel";

export default function AdminSettingsPage() {
  const config = getAiConfigStatus(getServerEnv());

  return (
    <main className="workspace">
      <header className="topbar">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>系统设置</h1>
        </div>
        <div className="topbar-actions">
          <Link className="button ghost" href="/admin">
            返回后台
          </Link>
        </div>
      </header>

      <AiSelfTestPanel config={config} />
    </main>
  );
}
