import { Container } from "reactstrap";
import type { ReactNode } from "react";
import styles from "../css/PageShell.module.css";

/**
 * The box every screen sits in.
 *
 * Each page used to set its own width, and they had drifted to six different
 * ones — 720 on settings, 900 on debts, 1100 on the planner, 1240 on
 * allocation, edge-to-edge on the rest — with four different vertical paddings
 * between them. Moving between tabs made the content step in and out, and on
 * several pages the loading state was a different width again, so the page also
 * jumped once its data arrived.
 *
 * One shell, one width, one padding. The width is deliberately uncapped: these
 * are dashboards of charts and tables, and a chart is easier to read the more
 * room it has, so the only limit is the screen. Anything that genuinely wants
 * to be narrow — a form, a column of prose — should say so with `narrow`
 * rather than inventing a number of its own.
 */
export function PageShell({ children, narrow, className }: { children: ReactNode; narrow?: boolean; className?: string }) {
  return <Container fluid className={`${styles.shell} ${narrow ? styles.narrow : ""} ${className ?? ""}`}>{children}</Container>;
}

export default PageShell;
