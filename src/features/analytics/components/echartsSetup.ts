import * as echarts from "echarts/core";
import { BoxplotChart, SankeyChart, ScatterChart, SunburstChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";

// Only what these three charts actually draw is registered. Importing the
// `echarts` barrel instead would pull every chart type in the library into the
// bundle for no extra capability here.
//
// SVG rather than canvas: the rest of the page is recharts (SVG), so this keeps
// one rendering model, stays crisp on high-DPI screens, and prints. Canvas only
// wins past tens of thousands of points, which no personal ledger reaches.
echarts.use([SankeyChart, SunburstChart, BoxplotChart, ScatterChart, GridComponent, TooltipComponent, SVGRenderer]);

export default echarts;
