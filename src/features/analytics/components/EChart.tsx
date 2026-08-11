import { useEffect, useRef } from "react";
import echarts from "./echartsSetup";

type EChartsInstance = ReturnType<typeof echarts.init>;

/**
 * Thin binding between React and one ECharts instance.
 *
 * Written by hand rather than pulling in `echarts-for-react`: that wrapper
 * defers its first `setOption` until the instance emits `finished`, and an
 * instance that has never been given an option never renders — so it never
 * emits it, and the chart stays blank forever. Doing it directly is forty
 * lines, drops two dependencies, and makes resize and disposal explicit.
 */
export function EChart({ option, ariaLabel }: { option: unknown; ariaLabel?: string }) {
  const holder = useRef<HTMLDivElement>(null);
  const chart = useRef<EChartsInstance | null>(null);

  useEffect(() => {
    const element = holder.current;
    if (!element) return;

    const instance = echarts.init(element, undefined, { renderer: "svg" });
    chart.current = instance;

    // The card fixes its height in CSS but the width follows the grid, so the
    // instance has to be told whenever its box changes.
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(element);

    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    // notMerge: a theme change swaps every colour at once, and a merge would
    // leave the previous palette sitting underneath.
    chart.current?.setOption(option as Parameters<EChartsInstance["setOption"]>[0], { notMerge: true });
  }, [option]);

  return <div ref={holder} style={{ width: "100%", height: "100%" }} role="img" aria-label={ariaLabel} />;
}
