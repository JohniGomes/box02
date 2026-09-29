"use client";

import { useState } from "react";

export function CopyLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("");

  function getUrl() {
    if (url) return url;
    const computed = `${window.location.origin}/orcamento/${token}`;
    setUrl(computed);
    return computed;
  }

  async function handleCopy() {
    const link = getUrl();
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard pode falhar em contexto não seguro — o link ainda aparece na tela
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-xl border border-border bg-background px-4 py-3 text-xs text-muted break-all">
        {url || `/orcamento/${token}`}
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className="h-11 rounded-xl border border-border text-sm font-medium active:scale-[0.98]"
      >
        {copied ? "Link copiado!" : "Copiar link"}
      </button>
    </div>
  );
}
