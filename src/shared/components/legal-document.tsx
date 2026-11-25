import { cloneElement, isValidElement, type ReactNode } from "react";

function marks(text: string, key: string): ReactNode {
  if (text.startsWith("**") && text.endsWith("**")) {
    return (
      <strong key={key} className="font-medium">
        {text.slice(2, -2)}
      </strong>
    );
  }
  if (text.startsWith("_") && text.endsWith("_")) {
    return <em key={key}>{text.slice(1, -1)}</em>;
  }
  return <span key={key}>{text}</span>;
}

function inline(text: string, phrase?: string, phraseNode?: ReactNode): ReactNode[] {
  const marked = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
  return marked.flatMap((part, index) => {
    if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("_") && part.endsWith("_"))) {
      return [marks(part, `m-${index}`)];
    }
    if (!phrase || !phraseNode || !part.includes(phrase)) return [marks(part, `t-${index}`)];
    const [before, after] = part.split(phrase);
    const keyed = isValidElement(phraseNode) ? cloneElement(phraseNode, { key: `p-${index}` }) : phraseNode;
    return [before ? <span key={`b-${index}`}>{before}</span> : null, keyed, after ? <span key={`a-${index}`}>{after}</span> : null].filter(
      (node) => node !== null,
    );
  });
}

/** Renders the legal markdown we actually ship: headings, paragraphs, bold, italics, lists. */
export function LegalDocument({
  source,
  phrase,
  phraseNode,
}: {
  source: string;
  phrase?: string;
  phraseNode?: ReactNode;
}) {
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
          <li key={item}>{inline(item, phrase, phraseNode)}</li>
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
          {inline(line.slice(2), phrase, phraseNode)}
        </h1>,
      );
      continue;
    }
    if (line.startsWith("## ")) {
      const heading = line.slice(3);
      blocks.push(
        <h2
          key={`h2-${blocks.length}`}
          id={heading === "4. Saved contacts and people without an account" ? "not-a-user" : undefined}
          className="mt-8 t-body"
        >
          {inline(heading, phrase, phraseNode)}
        </h2>,
      );
      continue;
    }
    blocks.push(
      <p key={`p-${blocks.length}`} className="mt-3 t-body">
        {inline(line, phrase, phraseNode)}
      </p>,
    );
  }
  flushList();

  return <article className="max-w-md pb-8">{blocks}</article>;
}
