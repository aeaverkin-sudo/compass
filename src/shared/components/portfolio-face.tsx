export type PortfolioFaceData = {
  id: string;
  name: string;
  title: string;
  photoAttachmentId: string | null;
};

function PortfolioPhoto({ src }: { src: string | null }) {
  if (!src) return <span aria-hidden className="size-[40px] shrink-0 bg-[#f3f3f3]" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className="size-[40px] shrink-0 object-cover" />;
}

/** One of my portfolios in a choice: photo, name, position. The chosen one is in ink. */
export function PortfolioFace({ portfolio, selected }: { portfolio: PortfolioFaceData; selected: boolean }) {
  return (
    <>
      <PortfolioPhoto src={portfolio.photoAttachmentId ? `/f/${portfolio.photoAttachmentId}` : null} />
      <span className="min-w-0 flex-1">
        <span className={`block truncate t-body ${selected ? "text-[var(--ink)]" : "text-[var(--grey)]"}`}>
          {portfolio.name.replace(/\s*\n\s*/g, " ") || "Untitled"}
        </span>
        {portfolio.title ? <span className="mt-1 block truncate t-meta text-[var(--grey)]">{portfolio.title}</span> : null}
      </span>
    </>
  );
}
