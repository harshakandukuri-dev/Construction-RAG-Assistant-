import { Icon } from "./Icons";
import { QUALITY_LEVEL, cap, fileUrl, VERDICT } from "@/lib/format";

export function Quality({ value }) {
  const level = QUALITY_LEVEL[value] || 0;
  return (
    <span className="quality" title={`${cap(value)} grade`}>
      <span className="quality-dots" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <i key={n} data-on={n <= level} />
        ))}
      </span>
      {cap(value)}
    </span>
  );
}

export function Meter({ label, value }) {
  return (
    <div className="meter">
      <span>{label}</span>
      <span className="meter-bars" role="img" aria-label={`${value} out of 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <i key={n} data-on={n <= value} />
        ))}
      </span>
    </div>
  );
}

const MARK = { pass: "check", warn: "alert", fail: "close" };

export function FitResult({ fit }) {
  const mark = fit.verdict === "fits" ? "pass" : fit.verdict === "partly" ? "warn" : "fail";
  return (
    <div>
      <div className="fit-head" data-verdict={fit.verdict}>
        <span className="fit-mark" data-status={mark}>
          <Icon name={MARK[mark]} size={14} stroke={3} />
        </span>
        <div>
          <div className="fit-title">{VERDICT[fit.verdict]}</div>
          <div className="fit-sub">
            {fit.checks.filter((c) => c.status === "pass").length} of {fit.checks.length} checks passed
          </div>
        </div>
      </div>
      <ul className="fit-list">
        {fit.checks.map((c) => (
          <li key={c.id} className="fit-item">
            <span className="fit-mark" data-status={c.status}>
              <Icon name={MARK[c.status]} size={14} stroke={3} />
            </span>
            <div>
              <strong>{c.title}</strong>
              <span>{c.detail}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FitChip({ fit }) {
  if (!fit) return null;
  const mark = fit.verdict === "fits" ? "pass" : fit.verdict === "partly" ? "warn" : "fail";
  return (
    <span className="fit-chip" data-verdict={fit.verdict}>
      <span className="fit-mark" data-status={mark} style={{ width: 16, height: 16, margin: 0 }}>
        <Icon name={MARK[mark]} size={10} stroke={3.4} />
      </span>
      {VERDICT[fit.verdict]}
    </span>
  );
}

// Photo if there is one, otherwise the material's colour.
export function Thumb({ material, className }) {
  const image = material?.images?.[0];
  return (
    <div className={className} style={{ "--swatch": material?.swatch }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {image && <img src={fileUrl(image.url)} alt="" loading="lazy" />}
    </div>
  );
}
