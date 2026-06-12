"use client";

import { useState } from "react";

type CopyableCodeBlockProps = {
  content: string;
};

export function CopyableCodeBlock({ content }: CopyableCodeBlockProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }

    window.setTimeout(() => setCopyState("idle"), 2000);
  };

  const buttonText = copyState === "copied" ? "已复制" : copyState === "failed" ? "复制失败" : "复制";

  return (
    <div className="copyable-code">
      <button className="icon-button copy-button" onClick={handleCopy} type="button">
        {buttonText}
      </button>
      <pre className="code-sample">{content}</pre>
    </div>
  );
}
