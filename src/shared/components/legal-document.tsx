import type { ReactNode } from "react";

function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-medium">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("_") && part.endsWith("_")) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return <span key={index}>{part}</span>;
  });
}

/** Renders the legal markdown we actually ship: headings, paragraphs, bold, italics, lists. */
export function LegalDocument({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let list: string[] = [];

  const flushList = () => {
    if (list.length === 0) return;
    const items = list;
    list = [];
    blocks.push(
      <ul key={`list-${blocks.length}`} className="mt-3 list-disc space-y-2 pl-5 t-body">
        {items.map((item) => (
          <li key={item}>{inline(item)}</li>
        ))}
      </ul>,
    );
  };

  for (const line of lines) {
    if (line.startsWith("- ")) {
      list.push(line.slice(2));
      continue;
    }
    flushList();
    if (line.trim() === "") continue;
    if (line.startsWith("# ")) {
      blocks.push(
        <h1 key={`h1-${blocks.length}`} className="t-name">
          {inline(line.slice(2))}
        </h1>,
      );
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push(
        <h2 key={`h2-${blocks.length}`} className="mt-8 t-body">
          {inline(line.slice(3))}
        </h2>,
      );
      continue;
    }
    blocks.push(
      <p key={`p-${blocks.length}`} className="mt-3 t-body">
        {inline(line)}
      </p>,
    );
  }
  flushList();

  return <article className="max-w-md pb-8">{blocks}</article>;
}
