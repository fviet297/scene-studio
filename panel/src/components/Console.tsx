import { useEffect, useRef } from "react";

interface Props {
  lines: { text: string; isError: boolean }[];
  onClear: () => void;
}

export const Console = ({ lines, onClear }: Props) => {
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);

  if (!lines.length) return null;

  return (
    <section className="console" aria-label="Log">
      <p data-kind="dim">
        <button type="button" className="btn sm quiet" onClick={onClear}>
          Xoá log
        </button>
      </p>
      {lines.map((line, index) => (
        <p key={index} data-kind={line.isError ? "error" : undefined}>
          {line.text}
        </p>
      ))}
      <div ref={end} />
    </section>
  );
};
