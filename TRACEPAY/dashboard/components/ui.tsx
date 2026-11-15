import type { ReactNode } from "react";

export function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      <p>{note}</p>
    </div>
  );
}

export function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="sub">{sub}</div>
    </div>
  );
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="row">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

export function Panel({
  span,
  title,
  hint,
  children,
}: {
  span: 4 | 6 | 8 | 12;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className={`panel span-${span}`}>
      <h3>{title}</h3>
      <div className="hint">{hint}</div>
      {children}
    </div>
  );
}

export function Chart({ tall, children }: { tall?: boolean; children: ReactNode }) {
  return <div className={tall ? "chart tall" : "chart"}>{children}</div>;
}

export interface Column {
  label: string;
  num?: boolean;
  wrap?: boolean;
}

/** A plain table. Each row is an array of cells, one per column. */
export function DataTable({
  columns,
  rows,
  empty,
  onRow,
}: {
  columns: Column[];
  rows: ReactNode[][];
  empty: string;
  onRow?: (index: number) => void;
}) {
  if (!rows.length) return <div className="empty">{empty}</div>;
  return (
    <table>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.label} className={c.num ? "num" : undefined}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells, i) => (
          <tr
            key={i}
            className={onRow ? "clickable" : undefined}
            tabIndex={onRow ? 0 : undefined}
            onClick={onRow ? () => onRow(i) : undefined}
            onKeyDown={
              onRow
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onRow(i);
                    }
                  }
                : undefined
            }
          >
            {cells.map((cell, j) => (
              <td key={j} className={columns[j].num ? "num" : columns[j].wrap ? "wrap-text" : undefined}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
