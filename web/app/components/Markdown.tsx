"use client";

import { useMemo } from "react";
import { marked } from "marked";

marked.setOptions({
  breaks: true,
  gfm: true,
});

interface MarkdownProps {
  content: string;
  className?: string;
}

export default function Markdown({ content, className }: MarkdownProps) {
  const html = useMemo(
    () => marked.parse(content, { async: false }) as string,
    [content],
  );

  return (
    <div
      className={`markdown-body ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
