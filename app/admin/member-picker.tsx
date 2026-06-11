"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Member = {
  id: string;
  name: string;
  role: string;
};

type MemberPickerProps = {
  members: Member[];
  selectedMemberId?: string;
};

export function MemberPicker({ members, selectedMemberId }: MemberPickerProps) {
  const router = useRouter();
  const [memberId, setMemberId] = useState(selectedMemberId ?? "");
  const [memberName, setMemberName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  async function saveSelection() {
    if (!memberId) {
      setStatus("请选择成员。");
      return;
    }

    setStatus(null);
    setIsSaving(true);

    const response = await fetch("/api/admin/session/member", {
      body: JSON.stringify({ memberId }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    setIsSaving(false);

    if (!response.ok) {
      setStatus("成员选择失败，请刷新后重试。");
      return;
    }

    setStatus("已保存当前操作者。");
    router.refresh();
  }

  async function createAndSelectMember() {
    const trimmedName = memberName.trim();

    if (!trimmedName) {
      setStatus("请输入成员名称。");
      return;
    }

    setStatus(null);
    setIsCreating(true);

    const response = await fetch("/api/admin/session/member", {
      body: JSON.stringify({ name: trimmedName }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });

    setIsCreating(false);

    if (!response.ok) {
      setStatus("成员创建失败，请检查名称后重试。");
      return;
    }

    const result = (await response.json()) as { created?: boolean; selectedMember?: Member };

    setMemberName("");
    setMemberId(result.selectedMember?.id ?? "");
    setStatus(result.created ? "已新增并选中当前操作者。" : "该成员已存在，已直接选中。");
    router.refresh();
  }

  return (
    <div className="member-picker">
      <label className="field inline">
        <span>当前操作者</span>
        <select disabled={members.length === 0} onChange={(event) => setMemberId(event.target.value)} value={memberId}>
          <option value="">未选择</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name} ({member.role})
            </option>
          ))}
        </select>
      </label>
      <button className="button secondary" disabled={members.length === 0 || isSaving} onClick={saveSelection} type="button">
        {isSaving ? "保存中..." : "保存选择"}
      </button>
      <div className="member-create-row">
        <label className="field inline">
          <span>新增成员</span>
          <input
            maxLength={80}
            onChange={(event) => setMemberName(event.target.value)}
            placeholder="输入用于归因的姓名"
            value={memberName}
          />
        </label>
        <button className="button secondary" disabled={isCreating} onClick={createAndSelectMember} type="button">
          {isCreating ? "添加中..." : "添加并选中"}
        </button>
      </div>
      {status ? <span className="inline-status">{status}</span> : null}
    </div>
  );
}
