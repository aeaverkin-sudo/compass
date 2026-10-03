/** ADED pixel wordmark, orange. Fills the width it is given; height follows the 54×17 grid. */
export function AdedWordmark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/aded-word.svg"
      alt="ADED"
      width={54}
      height={17}
      draggable={false}
      className={className ?? "block h-auto w-full"}
    />
  );
}
