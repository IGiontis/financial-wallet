import type { ReactNode } from "react";
import { Table } from "reactstrap";
import styles from "./css/Dashboard.module.css";

export interface DetailsColumn<R> {
  key: string;
  label: string;
  cell: (row: R) => ReactNode;
  /** A figure: right-aligned, in tabular digits. */
  numeric?: boolean;
  /** Coloured by sign — green above zero, red below. */
  tone?: (row: R) => number | undefined;
  /** Worth having, not worth a phone's width: shown from `sm` up. */
  secondary?: boolean;
  /** The cell in the total row at the foot, if there is one. */
  foot?: ReactNode;
}

const toneColor = (n: number | undefined) => (n === undefined || n === 0 ? undefined : n > 0 ? "var(--color-income)" : "var(--color-expense)");

/**
 * The figures behind a chart, as columns: what every card's sheet ends on.
 *
 * The first column names the row and is its header. A foot row appears when
 * any column gives a `foot`, labelled by `footLabel`.
 */
export function DetailsTable<R>({ rows, rowKey, columns, footLabel }: { rows: R[]; rowKey: (row: R) => string; columns: DetailsColumn<R>[]; footLabel?: string }) {
  const [head, ...rest] = columns;
  const align = (column: DetailsColumn<R>) => `${column.numeric ? "text-end" : ""} ${column.secondary ? "d-none d-sm-table-cell" : ""}`;
  const hasFoot = rest.some((column) => column.foot !== undefined);

  return (
    <Table size="sm" hover responsive borderless className={`${styles.ledgerTable} mb-0`}>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key} scope="col" className={align(column)}>
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)}>
            <th scope="row" className={`fw-semibold ${styles.ledgerName}`}>
              {head.cell(row)}
            </th>
            {rest.map((column) => (
              <td key={column.key} className={align(column)} style={{ color: toneColor(column.tone?.(row)) }}>
                {column.cell(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {hasFoot && (
        <tfoot>
          <tr className={styles.ledgerFootFirst}>
            <th scope="row">{footLabel}</th>
            {rest.map((column) => (
              <td key={column.key} className={`${align(column)} fw-semibold`}>
                {column.foot}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </Table>
  );
}

/**
 * The sheet behind a card: the chart at a size it can be read, the words the
 * card leaves out, and the figures as a table.
 */
export function ChartDetails({ note, chart, legend, extra, tableTitle, table }: { note?: ReactNode; chart?: ReactNode; legend?: ReactNode; extra?: ReactNode; tableTitle?: string; table?: ReactNode }) {
  return (
    <div className="d-flex flex-column gap-3">
      {note && <p className={`${styles.ledgerNote} mb-0`}>{note}</p>}
      {chart && <div className={styles.detailsChart}>{chart}</div>}
      {legend}
      {extra}
      {table && (
        <section>
          {tableTitle && <h4 className={styles.ledgerHeading}>{tableTitle}</h4>}
          {table}
        </section>
      )}
    </div>
  );
}
