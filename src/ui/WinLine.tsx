import "./WinLine.css";

function cn(...parts: Array<string | undefined | false | null>) {
  return parts.filter(Boolean).join(" ");
}

type WinLineProps = {
  percent: number;
  yPx: number;
  className?: string;
  style?: React.CSSProperties;
  "aria-label"?: string;
};

export default function WinLine({
  percent,
  yPx,
  className,
  style,
  ...aria
}: WinLineProps) {
  const clamped = Math.max(0, Math.min(100, percent));

  // Merge incoming style prop but ensure we always include the translateY
  // computed from the engine yPx. If the caller provided a transform, append
  // our translate so we don't overwrite their transform (e.g. filter/blur
  // styles are preserved and transform is combined).
  const styleRecord = style as React.CSSProperties & Record<string, unknown>;
  const incomingTransform =
    (style && typeof styleRecord.transform === "string"
      ? styleRecord.transform
      : "") || "";
  const translate = `translateY(${yPx}px)`;
  const mergedStyle: React.CSSProperties = {
    ...(style || {}),
    transform: `${
      incomingTransform ? incomingTransform + " " : ""
    }${translate}`,
  };

  return (
    <div
      className={cn("winline", className)}
      style={mergedStyle}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      {...aria}
      data-testid="win-line"
    >
      <div className="winline__badge">Clear above to win!</div>
      <div className="winline__bar" style={{ width: `${clamped}%` }} />
    </div>
  );
}
