
// Plots.js
import React, { useMemo, useRef, useLayoutEffect, useState } from "react";
import Papa from "papaparse";
import * as d3 from "d3";
import { Chart as ReactChart } from "react-chartjs-2";
import { Chart, registerables } from "chart.js";
import {
  BoxPlotController,
  ViolinController,
  BoxAndWiskers,
  Violin,
} from "@sgratzl/chartjs-chart-boxplot";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faDownload,
  faInfoCircle,
  faLightbulb,
  faQuestionCircle,
  faTimes,
  faHashtag,
  faArrowLeft,
  faArrowRight,
} from "@fortawesome/free-solid-svg-icons";
import PropTypes from "prop-types";

// ---------------- Chart.js registration stays for non-boxplot cases -------------
Chart.register(
  ...registerables,
  BoxPlotController,
  ViolinController,
  BoxAndWiskers,
  Violin
);



Chart.defaults.font.family =
  'Lato, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const FONT_FAMILY = Chart.defaults.font.family;

// Derive the application's typographic scale from CSS custom property `--font-scale`.
// If the CSS variable is not found or cannot be parsed the scale defaults to 1 (100%).
function getFontScale() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return 1;
  }
  try {
    const rootStyle = getComputedStyle(document.documentElement);
    const raw = rootStyle.getPropertyValue('--font-scale');
    const scale = parseFloat(raw);
    return Number.isFinite(scale) ? scale : 1;
  } catch {
    return 1;
  }
}

// Use the computed font scale to adjust default font sizes used by Chart.js.
// Base font size of 12px will be multiplied by this scale. This ensures that
// charts respect the same typographic scale defined in App.css.
const __fontScale = getFontScale();
Chart.defaults.font.size = 12 * __fontScale;
const COUNT_FONT_PX = 14 * __fontScale;
const COUNT_FONT = `700 ${COUNT_FONT_PX-4}px Lato, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
const CHART_FONT = 12 * __fontScale;
Chart.defaults.color = "#37474f";

// ---------- helpers ----------
const round3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : v);

// Compute quantiles for an array of numbers.  Returns the q-th quantile (0 <= q <= 1).
// If the array is empty or not defined, returns NaN.  Based on the implementation
// used in the older plots.js to ensure consistency when computing boxplot
// statistics.  See new 7.txt for reference.
function quantile(arr, q) {
  if (!arr || arr.length === 0) return NaN;
  const pos = (arr.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (arr[base + 1] !== undefined) {
    return arr[base] + rest * (arr[base + 1] - arr[base]);
  }
  return arr[base];
}

function computeYRangeForChart(chartObj) {
  try {
    const ds = chartObj?.data?.datasets?.[0];
    if (!ds) return null;
    if (chartObj.type === "boxplot") {
      const mins = ds.data.map((d) => Number(d?.min)).filter((n) => Number.isFinite(n));
      const maxs = ds.data.map((d) => Number(d?.max)).filter((n) => Number.isFinite(n));
      if (!mins.length || !maxs.length) return null;
      return { min: Math.min(...mins), max: Math.max(...maxs) };
    } else {
      const vals = ds.data.map((v) => Number(v)).filter((n) => Number.isFinite(n));
      if (!vals.length) return null;
      return { min: 0, max: Math.max(...vals) };
    }
  } catch {
    return null;
  }
}

function wrapLabel(label, maxChars = 12) {
  if (!label) return label;
  const words = String(label).split(/\s+/);
  const lines = [];
  let line = "";
  words.forEach((w) => {
    if ((line + " " + w).trim().length <= maxChars) {
      line = (line ? line + " " : "") + w;
    } else {
      if (line) lines.push(line);
      line = w;
    }
  });
  if (line) lines.push(line);
  return lines.length ? lines : [String(label)];
}

// ---------- chart builders (unchanged logic) ----------
function buildTrendChart(rawData, cfg, palette) {
  const { parameter, selectedSites = [], startYear, endYear, trendIndex } = cfg;

  let site = null;
  if (selectedSites.length) {
    const count = selectedSites.length;
    let idx = Number.isFinite(trendIndex) ? trendIndex : count - 1;
    idx = ((idx % count) + count) % count;
    site = selectedSites[idx] || selectedSites[count - 1];
  }

  const filtered = rawData.filter((row) => {
    const rowParam = row?.Parameter ? String(row.Parameter).trim() : "";
    const rowSite = row?.Site ? String(row.Site).trim() : "";
    const yearNum = parseInt(row?.Year, 10);
    return (
      rowParam === parameter &&
      (!!site && rowSite === site) &&
      Number.isFinite(yearNum) &&
      (startYear == null || yearNum >= startYear) &&
      (endYear == null || yearNum <= endYear)
    );
  });

  const groupAvgs = {};
  const groupMins = {};
  const groupMaxs = {};
  const countByYear = {};
  filtered.forEach((row) => {
    const y = row.Year;
    const avgVal = round3(parseFloat(row.Avg));
    const minVal = round3(parseFloat(row.Min));
    const maxVal = round3(parseFloat(row.Max));
    const cnt = parseInt(row.Count, 10);

    if (Number.isFinite(avgVal)) (groupAvgs[y] ||= []).push(avgVal);
    if (Number.isFinite(minVal)) (groupMins[y] ||= []).push(minVal);
    if (Number.isFinite(maxVal)) (groupMaxs[y] ||= []).push(maxVal);
    if (Number.isFinite(cnt)) countByYear[y] = (countByYear[y] || 0) + cnt;
  });

  const years = Array.from(
    new Set([...Object.keys(groupAvgs), ...Object.keys(groupMins), ...Object.keys(groupMaxs)])
  ).sort((a, b) => +a - +b);

  const boxData = [];
  const counts = [];
  years.forEach((y) => {
    const avgs = groupAvgs[y] || [];
    if (!avgs.length) return;
    // Sort the averaged values to compute quantiles and median accurately
    const sorted = avgs.slice().sort((a, b) => a - b);
    const meanAvg = avgs.reduce((s, v) => s + v, 0) / avgs.length;
    const q1 = quantile(sorted, 0.25);
    const median = quantile(sorted, 0.5);
    const q3 = quantile(sorted, 0.75);

    const mins = groupMins[y] || [];
    const maxs = groupMaxs[y] || [];
    const minVal = mins.length ? Math.min(...mins) : meanAvg;
    const maxVal = maxs.length ? Math.max(...maxs) : meanAvg;

    boxData.push({
      min: round3(minVal),
      q1: round3(q1),
      median: round3(median),
      q3: round3(q3),
      max: round3(maxVal),
      mean: round3(meanAvg),
    });
    counts.push(countByYear[y] || 0);
  });

  const siteTitle = site ? `${parameter} Trend for ${site}` : `Trend`;
  const subtitle = parameter ? `${parameter} by year` : "";

  return {
    title: siteTitle,
    subtitle,
    type: "boxplot",
    data: {
      labels: years,
      datasets: [
        {
          label: parameter,
          data: boxData,
          backgroundColor: palette[0],
          borderColor: palette[0],
          customCounts: counts,
        },
      ],
    },
  };
}

function buildComparisonChart(rawData, cfg, palette) {
  const { parameter, selectedSites = [], startYear, endYear } = cfg;

  const subtitle = `Selected lakes (n): ${new Set(selectedSites).size}`;

  const filtered = rawData.filter((row) => {
    const rowParam = row?.Parameter ? String(row.Parameter).trim() : "";
    const rowSite = row?.Site ? String(row.Site).trim() : "";
    const yearNum = parseInt(row?.Year, 10);
    return (
      rowParam === parameter &&
      selectedSites.includes(rowSite) &&
      Number.isFinite(yearNum) &&
      (startYear == null || yearNum >= startYear) &&
      (endYear == null || yearNum <= endYear)
    );
  });

  const groups = {};
  const countsBySite = {};
  filtered.forEach((row) => {
    const site = row?.Site ? String(row.Site).trim() : "";
    const avgVal = round3(parseFloat(row.Avg));
    const cnt = parseInt(row.Count, 10);
    if (!site || !Number.isFinite(avgVal)) return;
    (groups[site] ||= []).push(avgVal);
    countsBySite[site] = (countsBySite[site] || 0) + (Number.isFinite(cnt) ? cnt : 0);
  });

  const sites = Object.keys(groups);
  const values = sites.map((s) => {
    const arr = groups[s];
    const mean = arr.reduce((sum, v) => sum + v, 0) / arr.length;
    return round3(mean);
  });
  const counts = sites.map((s) => countsBySite[s] || 0);

  // compute y padding to match the trend plot feel
  const vMin = Math.min(...values);
  const vMax = Math.max(...values);
  // const span = vMax - vMin;
  // const pad = span > 0 ? Math.max(span * 0.08, 0.5) : 1; // ~8% or at least 0.5

  return {
    title: `${parameter} Comparison by Site`,
    type: "d3bar",
    subtitle,
    // carry y padding/meta so the Chart.js options can use it
    yMeta: {
      suggestedMin: round3(vMin),
      suggestedMax: round3(vMax),
    },
    data: {
      labels: sites.map((s) => wrapLabel(s, 12)),
      datasets: [
        {
          label: parameter,
          data: values,
          backgroundColor: sites.map((_, i) => palette[i % palette.length]),
          customCounts: counts,
        },
      ],
    },
  };
}

const defaultColors = ["#37474f", "#6faecb", "#90a4ae", "#b0c4d6", "#5f7d95", "#a5b8c8", "#adb5bd"];

// ---------------- Count overlay plugin (used by both chart types) ----------------
const countPlugin = {
  id: "countPlugin",
  afterDatasetsDraw(chart) {
    const ds = chart.data?.datasets?.[0];
    if (!ds) return;
    const counts = ds.customCounts || [];
    const meta = chart.getDatasetMeta(0);
    const ctx = chart.ctx;

    const p = chart.options?.plugins?.countPlugin || {};
    // const gapAboveWhisker = Number.isFinite(p.gapAboveWhisker) ? p.gapAboveWhisker : 16;
    const baseOffset = Number.isFinite(p.offset) ? p.offset : 10;

    ctx.save();
    meta.data.forEach((el, i) => {
      const c = counts[i];
      if (c == null) return;
      const x = el.tooltipPosition ? el.tooltipPosition().x : el.x;
      const ppos = el.tooltipPosition ? el.tooltipPosition() : el;
      const textY = ppos.y - baseOffset;
      ctx.fillStyle = p.color || "#37474f";
      ctx.textAlign = "center";
      ctx.font = p.font || COUNT_FONT;
      ctx.fillText(String(c), x, textY);
    });
    ctx.restore();
  },
};
Chart.register(countPlugin);

function makeOptions(parameterLabel, chartObj) {
  const range = computeYRangeForChart(chartObj);
  let yMin, yMax;
  if (range) {
    const span = range.max - range.min;
    let pad = Number(span) * 0.16;
    if (!Number.isFinite(pad) || pad === 0) {
      pad = Math.max(Math.abs(range.max) * 0.02, 0.1);
    }
    if (chartObj.type === "boxplot") {
      yMin = Math.floor(range.min - pad);
      yMax = Math.ceil(range.max + pad * 2);
    } else {
      yMin = Math.floor(range.min);
      yMax = Math.ceil(range.max + pad * 2);
    }
    if (range.min >= 0 && yMin < 0 && span < 0.5) yMin = 0;
  }

  // const maxLabelLines = (chartObj?.data?.labels || []).reduce(
  //   (m, l) => Math.max(m, Array.isArray(l) ? l.length : 1),
  //   1
  // );
  // Pad the bottom of the chart depending on how many lines of x-axis labels there are.
  // Scale the padding values by the global font scale so that spacing grows proportionally.
  // const basePad = 14 * __fontScale;
  // const linePad = 12 * __fontScale;
  // const extraPad = 10 * __fontScale;
  // const bottomPad = basePad + (maxLabelLines - 1) * linePad + extraPad;

  const isBox = chartObj?.type === "boxplot";
  return {
    responsive: true,
    maintainAspectRatio: false,
    resizeDelay: 200,
    animation: false,
    responsiveAnimationDuration: 0,
    animations: { colors: false, x: { duration: 0 }, y: { duration: 0 } },
    interaction: { mode: "nearest", intersect: true },
    layout: { padding: { top: 12 } },
    scales: {
      y: {
        // Strict bounds for boxplot; soft bounds for bar chart to avoid the extra tick
        beginAtZero: !isBox,
        min: isBox && Number.isFinite(yMin) ? yMin : undefined,
        max: isBox && Number.isFinite(yMax) ? yMax : undefined,
        suggestedMin: !isBox && Number.isFinite(yMin) ? Math.max(0, yMin) : undefined,
        suggestedMax: !isBox && Number.isFinite(yMax) ? yMax : undefined,
        grace: !isBox ? "10%" : 0,          // add breathing room for bars instead of forcing a new tick
        ticks: {
          color: "#37474f",
          precision: 0,                     // prevent near-duplicate float ticks (e.g., 15 vs 15.0000001)
          includeBounds: true
        },
        grid: { color: "#e5e7eb", tickColor: "#e5e7eb" },
        title: { display: false, text: "" },
      },
      x: {
        offset: true,
        ticks: { color: "#37474f", maxRotation: 0, minRotation: 0, autoSkip: true, autoSkipPadding: 8, padding: 10 },
        grid: { color: "#e5e7eb", tickColor: "#e5e7eb" },
      },
    },
    plugins: {
      legend: { display: false },
      countPlugin: {
        gapAboveWhisker: 16 * __fontScale,
        offset: 10 * __fontScale,
        // color: "#37474f",
        font: COUNT_FONT, 
      },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            // For boxplot charts, show detailed statistics including quartiles and mean.
            if (ctx.chart.config.type === "boxplot") {
              const r = ctx.raw || {};
              const fmt = (v) =>
                Number.isFinite(v)
                  ? Number(v)
                      .toFixed(3)
                      .replace(/\.0+$/, "")
                      .replace(/\.([^0]*)0+$/, ".$1")
                  : "—";
              const lines = [];
              const series = ctx.dataset?.label || parameterLabel || "";
              if (series) lines.push(series);
              lines.push(`Min: ${fmt(r.min)}`);
              // In trending charts we compute quartiles; if q1/q3 are available include them.
              if (Number.isFinite(r.q1)) lines.push(`Q1 (25%): ${fmt(r.q1)}`);
              lines.push(`Median: ${fmt(r.median)}`);
              if (Number.isFinite(r.mean)) lines.push(`Mean: ${fmt(r.mean)}`);
              if (Number.isFinite(r.q3)) lines.push(`Q3 (75%): ${fmt(r.q3)}`);
              lines.push(`Max: ${fmt(r.max)}`);
              return lines;
            }
            // For non-boxplot charts (e.g. bar), show the series label and value
            const v = ctx.parsed?.y ?? ctx.parsed;
            return `${ctx.dataset?.label ?? ""}: ${v}`;
          },
        },
      },
    },
  };
}

// --------------------------- LightModal (unchanged) ----------------------------
function LightModal({ title, body, onClose }) {
  React.useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.35)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 92vw)",
          maxHeight: "80vh",
          background: "#ffffff",
          color: "#1f2937",
          borderRadius: 12,
          boxShadow: "0 10px 28px rgba(0,0,0,0.25)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid rgba(0,0,0,0.08)",
          }}
        >
          <h5 style={{ margin: 0, fontSize: 14 * CHART_FONT, fontWeight: 600, fontFamily: "Poppins, sans-serif" }}>
            {title}
          </h5>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              border: 0,
              background: "transparent",
              cursor: "pointer",
              width: 36,
              height: 36,
              display: "grid",
              placeItems: "center",
            }}
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
        <div style={{ padding: 16, overflow: "auto", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
          {body}
        </div>
      </div>
    </div>
  );
}
LightModal.propTypes = {
  title: PropTypes.string.isRequired,
  body: PropTypes.oneOfType([PropTypes.string, PropTypes.node]).isRequired,
  onClose: PropTypes.func.isRequired,
};

// ---------- D3 Boxplot with fixed-position hover tooltip ----------
function D3Boxplot({
  labels,
  series, // array of {min, q1, median, q3, max, mean?}
  color = "#37474f",
  yDomain, // {min, max} optional
  counts = [],
  yLabel = "",
}) {
  const margin = { top: 8, right: 8, bottom: 28, left: 42 };

  // Hover state for tooltip; store screen coords + stats
  const [hover, setHover] = React.useState(null);
  const hideHover = React.useCallback(() => setHover(null), []);

  // small number formatter
  const fmt = React.useCallback((v) => (
    Number.isFinite(v)
      ? Number(v).toFixed(3).replace(/\.0+$/, "").replace(/\.([^0]*)0+$/, ".$1")
      : "—"
  ), []);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg width="100%" height="100%" viewBox="0 0 800 400" preserveAspectRatio="none">
        <BoxplotInner
          labels={labels}
          series={series}
          color={color}
          counts={counts}
          yDomain={yDomain}
          yLabel={yLabel}
          margin={margin}
          width={800}
          height={400}
          // Receive DOM event + data from each box
          onHover={(e, i, s, lab) => {
            setHover({
              x: e.clientX,
              y: e.clientY,
              label: Array.isArray(lab) ? lab.join(" ") : String(lab),
              stats: s,
            });
          }}
          onLeave={hideHover}
        />
      </svg>

      {/* Fixed, top-most tooltip so it never hides behind the chart */}
      {hover && (
        <>
        <span
          role="tooltip"
          style={{
            position: "fixed",
            left: hover.x,
            top: Math.max(8, hover.y - 12),
            transform: "translate(-50%, -100%)",
            background: "rgba(31, 41, 55, 0.98)",
            color: "#fff",
            fontSize: 14 * __fontScale,
            padding: "8px 10px",
            borderRadius: 6,
            pointerEvents: "none",
            zIndex: 999999,
            boxShadow: "0 6px 18px rgba(0,0,0,.28)",
            display: "grid",
            gridTemplateColumns: "auto auto",
            columnGap: 10,
            rowGap: 2,
            whiteSpace: "nowrap",
          }}
        >
          {hover.label && (
            <strong
              style={{
                gridColumn: "1 / -1",
                marginBottom: 4,
                fontWeight: 900,
              }}
            >
              {hover.label}
            </strong>
          )}

          <span style={{ textAlign: "right", color: "#fff" }}>Max:</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(hover.stats.max)}</span>
          {Number.isFinite(hover.stats.mean) && (
            <>
              <span style={{ textAlign: "right", color: "#fff" }}>Mean:</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(hover.stats.mean)}</span>
            </>
          )}

          <span style={{ textAlign: "right", color: "#fff" }}>Min:</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(hover.stats.min)}</span>


        </span>

          <span
            style={{
              position: "fixed",
              left: hover.x,
              top: Math.max(8, hover.y - 12),
              transform: "translate(-50%, -2px)",
              width: 0,
              height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderTop: "6px solid rgba(31, 41, 55, 0.98)",
              pointerEvents: "none",
              zIndex: 999999,
            }}
          />
        </>
      )}
    </div>
  );
}
D3Boxplot.propTypes = {
  labels: PropTypes.arrayOf(
    PropTypes.oneOfType([PropTypes.string, PropTypes.number])
  ).isRequired,
  series: PropTypes.arrayOf(
    PropTypes.shape({
      min: PropTypes.number.isRequired,
      q1: PropTypes.number.isRequired,
      median: PropTypes.number.isRequired,
      q3: PropTypes.number.isRequired,
      max: PropTypes.number.isRequired,
    })
  ).isRequired,
  color: PropTypes.string,
  yDomain: PropTypes.shape({
    min: PropTypes.number.isRequired,
    max: PropTypes.number.isRequired,
  }),
  counts: PropTypes.arrayOf(
    PropTypes.oneOfType([PropTypes.number, PropTypes.oneOf([null])])
  ),
  yLabel: PropTypes.string,
};

D3Boxplot.defaultProps = {
  color: "#37474f",
  yDomain: undefined,
  counts: [],
  yLabel: "",
};


function D3Bar({ labels, values, counts = [], color = "#37474f", yDomain }) {
  // Increase margins slightly to give the bar chart a bit more breathing room
  // This mirrors the appearance of the trend plots which have extra space
  const margin = { top: 16, right: 8, bottom: 40, left: 48 };
  const [hover, setHover] = React.useState(null);
  const hideHover = React.useCallback(() => setHover(null), []);

  const fmt = React.useCallback(
    (v) => (Number.isFinite(v) ? String(Number(v).toFixed(3)).replace(/\.0+$/, "").replace(/\.([^0]*)0+$/, ".$1") : "—"),
    []
  );

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg width="100%" height="100%" viewBox="0 0 800 400" preserveAspectRatio="none">
        <D3BarInner
          labels={labels}
          values={values}
          counts={counts}
          color={color}
          yDomain={yDomain}
          margin={margin}
          width={800}
          height={400}
          onHover={(e, i, v, lab) => {
            setHover({
              x: e.clientX,
              y: e.clientY,
              label: Array.isArray(lab) ? lab.join(" ") : String(lab),
              value: v,
            });
          }}
          onLeave={hideHover}
        />
      </svg>

      {hover && (
        <>
          <span
            role="tooltip"
            style={{
              position: "fixed",
              left: hover.x,
              top: Math.max(8, hover.y - 12),
              transform: "translate(-50%, -100%)",
              background: "rgba(31, 41, 55, 0.98)",
              color: "#fff",
              fontSize: 14 * __fontScale,
              padding: "8px 10px",
              borderRadius: 6,
              pointerEvents: "none",
              zIndex: 999999,
              boxShadow: "0 6px 18px rgba(0,0,0,.28)",
              display: "inline-flex",
              flexDirection: "column",
              gap: 2,
              whiteSpace: "nowrap",
            }}
          >
            {hover.label && <strong style={{ marginBottom: 4, fontWeight: 900 }}>{hover.label}</strong>}
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(hover.value)}</span>
          </span>
          <span
            style={{
              position: "fixed",
              left: hover.x,
              top: Math.max(8, hover.y - 12),
              transform: "translate(-50%, -2px)",
              width: 0,
              height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderTop: "6px solid rgba(31, 41, 55, 0.98)",
              pointerEvents: "none",
              zIndex: 999999,
            }}
          />
        </>
      )}
    </div>
  );
}
D3Bar.propTypes = {
  labels: PropTypes.arrayOf(
    PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)])
  ).isRequired,
  values: PropTypes.arrayOf(PropTypes.number).isRequired,
  counts: PropTypes.arrayOf(PropTypes.number),
  // Allow colour to be either a single string (uniform colour) or an array of strings (one per bar)
  color: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.arrayOf(PropTypes.string),
  ]),
  yDomain: PropTypes.shape({
    min: PropTypes.number,
    max: PropTypes.number,
  }),
};

D3Bar.defaultProps = {
  counts: [],
  color: "#37474f",
  yDomain: undefined,
};

function D3BarInner({
  labels, values, counts, color, yDomain, margin, width, height, onHover, onLeave,
}) {
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  // y scale (with nice ticks and small padding like trend)
  const dataMin = 0;
  const dataMax = Math.max(...values);
  const domainMin = Number.isFinite(yDomain?.min) ? yDomain.min : dataMin;
  const domainMax = Number.isFinite(yDomain?.max) ? yDomain.max : dataMax;
  const y = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([innerH, 0]);

  // x scale
  const labelKeys = labels.map(String);
  const x = d3.scaleBand().domain(labelKeys).range([0, innerW]).padding(0.2);

  const ticks = y.ticks(Math.max(2, Math.floor(innerH / 60)));
  const barW = Math.max(8, Math.min(48, x.bandwidth()));

  // heuristic skip so we don't cram too many vertical labels
  // const maxLabels = Math.max(1, Math.floor(innerW / 50));
  // const skip = Math.ceil(labelKeys.length / maxLabels);

  return (
    <g transform={`translate(${margin.left},${margin.top})`}>
      {/* gridlines + y ticks */}
      {ticks.map((t) => {
        const py = y(t);
        return (
          <g key={`t-${t}`} transform={`translate(0,${py})`} shapeRendering="crispEdges">
            <line x1={0} x2={innerW} stroke="#e5e7eb" strokeWidth={0.75} />
            <text
              x={-10}
              y={3}
              textAnchor="end"
              fontSize={14 * __fontScale}
              fill="#37474f"
              fontFamily={FONT_FAMILY}
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {t}
            </text>
          </g>
        );
      })}

      {/* bars + counts + vertical labels inside bars */}
      {values.map((v, i) => {
        const lab = labelKeys[i];
        const xBand = x(lab) ?? 0;
        const x0 = xBand + (x.bandwidth() - barW) / 2;
        const h = Math.max(0, innerH - y(v));
        const top = y(v);
        const cx = x0 + barW / 2;

        // Determine bar fill
        const fillColor = Array.isArray(color) ? color[i % color.length] : color;

        // Label text (preserve original array->string behavior)
        const labelText = Array.isArray(labels[i]) ? labels[i].join(" ") : labels[i];

        return (
          <g
            key={`bar-${i}`}
            onMouseEnter={(e) => onHover && onHover(e, i, v, labels[i])}
            onMouseMove={(e) => onHover && onHover(e, i, v, labels[i])}
            onMouseLeave={onLeave}
          >
            <rect
              x={x0}
              y={top}
              width={barW}
              height={h}
              fill={fillColor}
              opacity={0.9}
              shapeRendering="crispEdges"
            />

            {/* count above bar */}
            {Number.isFinite(counts?.[i]) && (
              <text
                x={cx}
                y={top - 10 * __fontScale}
                textAnchor="middle"
                fontSize={14 * __fontScale}
                fontWeight="700"
                fill="#37474f"
                fontFamily={FONT_FAMILY}
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {counts[i]}
              </text>
            )}

            {/* vertical x-axis label INSIDE the bar (skip to reduce clutter) */}
            {/* {i % skip === 0 && h > 10 && ( */}
            { h > 10 && (
              <text
                x={cx} 
                y={top + h / 2}
                transform={`rotate(-90, ${cx}, ${top + h / 2})`}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={14 * __fontScale}
                fontFamily={FONT_FAMILY}
                fill="#ffffff"
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {labelText}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
D3BarInner.defaultProps = {
  counts: [],
  yDomain: undefined,
  onHover: undefined,
  onLeave: undefined,
};
D3BarInner.propTypes = {
  labels: PropTypes.arrayOf(
    PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)])
  ).isRequired,
  values: PropTypes.arrayOf(PropTypes.number).isRequired,
  counts: PropTypes.arrayOf(PropTypes.number),
  color: PropTypes.string.isRequired,
  yDomain: PropTypes.shape({
    min: PropTypes.number,
    max: PropTypes.number,
  }),
  margin: PropTypes.shape({
    top: PropTypes.number.isRequired,
    right: PropTypes.number.isRequired,
    bottom: PropTypes.number.isRequired,
    left: PropTypes.number.isRequired,
  }).isRequired,
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  onHover: PropTypes.func,
  onLeave: PropTypes.func,
};
// Inner SVG — now emits hover events for each box group
function BoxplotInner({
  labels, series, color, counts, yDomain, yLabel, margin, width, height,
  onHover, onLeave,   // NEW
}) {
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  // Y scale
  const dataMin = d3.min(series, (d) => d.min);
  const dataMax = d3.max(series, (d) => d.max);
  const domainMin = yDomain?.min ?? dataMin ?? 0;
  const domainMax = yDomain?.max ?? dataMax ?? 1;
  const y = d3.scaleLinear().domain([domainMin, domainMax]).nice().range([innerH, 0]);

  // X scale (bands)
  const labelKeys = labels.map(String);
  const x = d3.scaleBand().domain(labelKeys).range([0, innerW]).padding(0.15);

  const xLabelStep = 2; // show every other label
  const bw = Math.max(8, Math.min(40, x.bandwidth() * 0.6));
  const ticks = y.ticks(Math.max(2, Math.floor(innerH / 60)));
  // Points for the median-connecting line
  const points = series
    .map((d, i) => {
      const lab = labelKeys[i];
      const x0 = (x(lab) ?? 0) + (x.bandwidth() - Math.max(8, Math.min(40, x.bandwidth() * 0.6))) / 2;
      const cx = x0 + Math.max(8, Math.min(40, x.bandwidth() * 0.6)) / 2;
      return Number.isFinite(d?.median) ? [cx, y(d.median)] : null;
    })
    .filter(Boolean);

  return (
    <g transform={`translate(${margin.left},${margin.top})`}>
      {/* gridlines + y ticks */}
      {ticks.map((t) => {
        const py = y(t);
        return (
          <g key={`t-${t}`} transform={`translate(0,${py})`} shapeRendering="crispEdges">
            <line x1={0} x2={innerW} stroke="#e5e7eb" strokeWidth={0.75} />
            <text
              x={-10}
              y={3}
              textAnchor="end"
              fontSize={14 * __fontScale}
              fill="#37474f"
              fontFamily={FONT_FAMILY}
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {t}
            </text>
          </g>
        );
      })}

      {/* X labels */}
      {labelKeys.map((lab, i) => {
        if (i % xLabelStep !== 0) return null;
        const cx = (x(lab) ?? 0) + x.bandwidth() / 2;
        return (
          <text
            key={`x-${i}`}
            x={cx}
            y={innerH + 18 * __fontScale}
            textAnchor="middle"
            fontSize={14 * __fontScale}
            fill="#37474f"
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {Array.isArray(labels[i]) ? labels[i].join(" ") : labels[i]}
          </text>
        );
      })}

      {/* y-axis title */}
      {yLabel ? (
        <text
          transform={`translate(-34, ${innerH / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize={14 * __fontScale}
          fill="#37474f"
        >
          {/* {yLabel} */}
        </text>
      ) : null}

      {/* Boxes */}
      {series.map((d, i) => {
        const lab = labelKeys[i];
        const x0 = (x(lab) ?? 0) + (x.bandwidth() - bw) / 2;
        const cx = x0 + bw / 2;

        const yMin = y(d.min);
        const yQ1 = y(d.q1);
        const yMed = y(d.median);
        const yQ3 = y(d.q3);
        const yMax = y(d.max);

        return (
          <g
            key={`box-${i}`}
            onMouseEnter={(e) => onHover && onHover(e, i, d, labels[i])}
            onMouseMove={(e) => onHover && onHover(e, i, d, labels[i])}
            onMouseLeave={onLeave}
          >
            {/* whisker */}
            <line x1={cx} x2={cx} y1={yMin} y2={yMax} stroke={color} strokeWidth={1.5} />

            {/* box */}
            <rect
              x={x0}
              width={bw}
              y={Math.min(yQ1, yQ3)}
              height={Math.abs(yQ1 - yQ3)}
              stroke={color}
              fill="#ffffff"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />

            {/* median dot */}
            <circle cx={cx} cy={yMed} r={4} fill={color} />

            {/* counts */}
            {Number.isFinite(counts[i]) ? (
              <text
                x={cx}
                y={yMax - 14 * __fontScale}
                textAnchor="middle"
                fontSize={14 * __fontScale}
                fontWeight="700"
                fill="#37474f"
              >
                {counts[i]}
              </text>
            ) : null}
          </g>
        );
      })}
        {points.length > 1 && (
          <path
            d={`M ${points.map(([px, py]) => `${px},${py}`).join(" L ")}`}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.9}
          />
        )}
    </g>
  );
}

/** Custom validator to ensure labels.length === series.length and counts (if provided) aligns */
const lengthsMatch = (props, propName, componentName) => {
  const labels = props.labels || [];
  const series = props.series || [];
  if (labels.length !== series.length) {
    return new Error(
      `${componentName}: 'labels' (len ${labels.length}) must have same length as 'series' (len ${series.length}).`
    );
  }
  if (Array.isArray(props.counts) && props.counts.length && props.counts.length !== series.length) {
    return new Error(
      `${componentName}: 'counts' (len ${props.counts.length}) must match length of 'series' (len ${series.length}).`
    );
  }
  return null;
};

const labelItemType = PropTypes.oneOfType([
  PropTypes.string,
  PropTypes.number,
  PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.string, PropTypes.number])), // supports grouped labels
]);

// Simple, dependency-free tooltip wrapper for small icon buttons
// Simple, dependency-free tooltip wrapper for small icon buttons
function IconWithTooltip({ icon, label, onClick, disabled = false, style = {}, active = false }) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ x: 0, y: 0, w: 0 });
  const btnRef = React.useRef(null);

  const recalc = React.useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top, w: r.width });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    recalc();
    const onScroll = () => recalc();
    const onResize = () => recalc();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize, true);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize, true);
    };
  }, [open, recalc]);

  return (
    <span
      ref={btnRef}
      role="button"
      aria-label={label}
      title={label} // native fallback
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={disabled ? -1 : 0}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 22,
        height: 22,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : active ? 1 : 0.9,
        ...style,
      }}
    >
      <FontAwesomeIcon icon={icon} />
      {open && !disabled && (
        <>

          {/* arrow */}
          <span
            style={{
              position: "fixed",
              left: pos.x,
              top: Math.max(8, pos.y - 12),
              transform: "translate(-50%, -2px)",
              width: 0,
              height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderTop: "6px solid rgba(31, 41, 55, 0.98)",
              pointerEvents: "none",
              zIndex: 999999,
            }}
          />
        </>
      )}
    </span>
  );
}

IconWithTooltip.propTypes = {
  icon: PropTypes.oneOfType([
    PropTypes.object,   // FontAwesome icon definition
    PropTypes.array,    // some FA packs export as arrays
    PropTypes.string,   // fallback, just in case
  ]).isRequired,
  label: PropTypes.string.isRequired,
  onClick: PropTypes.func,
  disabled: PropTypes.bool,
  style: PropTypes.object,
  active: PropTypes.bool,
};

IconWithTooltip.defaultProps = {
  onClick: undefined,
  disabled: false,
  style: {},
  active: false,
};

BoxplotInner.propTypes = {
  labels: PropTypes.arrayOf(labelItemType).isRequired,
  series: PropTypes.arrayOf(
    PropTypes.shape({
      min: PropTypes.number.isRequired,
      q1: PropTypes.number.isRequired,
      median: PropTypes.number.isRequired,
      q3: PropTypes.number.isRequired,
      max: PropTypes.number.isRequired,
    })
  ).isRequired,
  color: PropTypes.string.isRequired,
  counts: PropTypes.arrayOf(
    PropTypes.oneOfType([PropTypes.number, PropTypes.oneOf([null])])
  ),
  yDomain: PropTypes.shape({
    min: PropTypes.number.isRequired,
    max: PropTypes.number.isRequired,
  }),
  yLabel: PropTypes.string,
  margin: PropTypes.shape({
    top: PropTypes.number.isRequired,
    right: PropTypes.number.isRequired,
    bottom: PropTypes.number.isRequired,
    left: PropTypes.number.isRequired,
  }).isRequired,
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  onHover: PropTypes.func,
  onLeave: PropTypes.func,
  // cross-field checks
  lengthsMatch,
};

BoxplotInner.defaultProps = {
  counts: [],
  yDomain: undefined,
  yLabel: "",
};

// --------------------------- Chart panel ---------------------------------------
function ChartPanel({ chartObj, cfg, slotLabel, options, icons, notice, nav }) {
  const containerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [showCounts, setShowCounts] = useState(false);

  useLayoutEffect(() => {
    let raf1, raf2;
    const el = containerRef.current;
    setReady(false);
    const ensureReady = () => {
      const inDoc = el && el.ownerDocument && el.ownerDocument.body.contains(el);
      const hasBox = el && el.clientWidth > 0 && el.clientHeight > 0;
      if (inDoc && hasBox) {
        setReady(true);
      } else {
        raf2 = requestAnimationFrame(ensureReady);
      }
    };
    raf1 = requestAnimationFrame(ensureReady);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [cfg?.parameter, cfg?.chartType, chartObj?.type, chartObj?.data?.labels?.length]);

  const chartData = useMemo(() => {
    if (!chartObj) return null;
    const isBoxplot =
      chartObj.type === "boxplot" || chartObj?.data?.datasets?.some((d) => d.type === "boxplot");
    const datasets = chartObj.data.datasets.map((ds) => {
      const counts = ds.customCounts || [];
      return {
        ...ds,
        customCounts: showCounts ? counts : counts.map(() => null),
      };
    });
    return { ...chartObj.data, datasets, isBoxplot };
  }, [chartObj, showCounts]);

  if (!cfg) {
    return (
      <div className="plot-panel">
        <div className="plot-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4
            style={{
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flexGrow: 1,
              flexShrink: 1,
              minWidth: 0,
            }}
          >
            {chartObj?.title ? `${slotLabel} — ${chartObj.title}` : `${slotLabel}`}
          </h4>
          <div className="plot-icons" style={{ opacity: 0.4 }} />
        </div>
        <div className="plot-content">
          <div className="no-plot-message">Click “Update {slotLabel}” to populate this plot.</div>
        </div>
      </div>
    );
  }
  if (!chartObj || !chartObj.data?.labels?.length) {
    return (
      <div className="plot-panel">
        <div className="plot-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4
            style={{
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flexGrow: 1,
              flexShrink: 1,
              minWidth: 0,
            }}
          >
            {slotLabel}: {cfg.parameter}
          </h4>
          {icons}
        </div>
        {notice && <div className="plot-notice">{notice}</div>}
        <div className="plot-content">
          <div className="no-plot-message">No data for the current filters.</div>
        </div>
      </div>
    );
  }

  const chartKey = `${chartObj.type}-${cfg.parameter}-${cfg.chartType}-${chartObj.data.labels.length}-${showCounts}`;

  // Build the header title string. If the combined slot label and chart title is very long
  // we truncate it to avoid crowding the icons. The actual text is still available via
  // the `title` attribute for accessibility and tooltips.
  const buildHeaderTitle = () => {
    let baseTitle;
    if (chartObj?.title) {
      baseTitle = `${slotLabel} — ${chartObj.title}`;
    } else {
      baseTitle = `${slotLabel}${cfg?.parameter ? `: ${cfg.parameter}` : ""}`;
    }
    // If the title is overly long (over 80 characters), truncate and append an ellipsis.
    const maxLen = 80;
    return baseTitle.length > maxLen ? baseTitle.slice(0, maxLen - 1) + '…' : baseTitle;
  };
  const headerTitle = buildHeaderTitle();

  // Build a padded y-domain for the D3 plot using the same helper used by options.
  // Add a bit of breathing room on top and bottom of the data. We pad by 10% of the
  // data span (with a minimum of 1 unit) to avoid crowding the boxes against the
  // edges of the chart.
  const range = computeYRangeForChart(chartObj);
  const yDomain = range
    ? (() => {
        const span = range.max - range.min;
        let pad = span * 0.1;
        // Ensure a minimum padding in case span is very small or zero
        if (!Number.isFinite(pad) || pad === 0) {
          pad = 1;
        }
        return { min: range.min - pad, max: range.max + pad };
      })()
    : undefined;

  return (
    <div className="plot-panel">
      {/* Header: title, icons, nav and count toggle */}
      <div
        className="plot-header"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}
      >
        <h4
          style={{
            margin: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flexGrow: 1,
            flexShrink: 1,
            minWidth: 0,
          }}
          title={chartObj?.title ? `${slotLabel} — ${chartObj.title}` : `${slotLabel}${cfg?.parameter ? `: ${cfg.parameter}` : ""}`}
        >
          {headerTitle}
        </h4>
        {/* Icons container: use icons prop passed from parent.  Also include nav arrows and counts toggle. */}
        <div className="plot-icons" style={{ display: "flex", gap: 12, alignItems: "center", opacity: 0.9 }}>
          {/* Parent icons (download, info, lightbulb, question) */}
          {icons}
          {/* Navigation arrows for trend charts if multiple sites */}
          {nav && nav.hasMultipleSites ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <IconWithTooltip icon={faArrowLeft} label="Previous site" onClick={nav.prev} />
              <IconWithTooltip icon={faArrowRight} label="Next site" onClick={nav.next} />
            </span>
          ) : null}

          <IconWithTooltip
            icon={faHashtag}
            label={showCounts ? "Hide counts" : "Show counts"}
            onClick={() => setShowCounts((prev) => !prev)}
            active={showCounts}
          />
        </div>
      </div>
      {notice && <div className="plot-notice">{notice}</div>}
      <div className="plot-content" ref={containerRef} style={{ position: "relative", flex: 1 }}>
        {!ready ? (
          <div style={{ height: "100%" }} />
        ) : chartObj.type === "boxplot" ? (
          <D3Boxplot
            key={chartKey}
            labels={chartObj.data.labels}
            series={chartData.datasets[0].data}
            counts={chartData.datasets[0].customCounts || []}
            color={chartData.datasets[0].borderColor || "#37474f"}
            yDomain={yDomain}
            yLabel={cfg?.parameter || ""}
          />
        ) : chartObj.type === "d3bar" ? (
          <D3Bar
            key={chartKey}
            labels={chartObj.data.labels}
            values={chartData.datasets[0].data}
            counts={chartData.datasets[0].customCounts || []}
            // Pass the entire colour palette array so the bar chart can colour each bar individually
            color={chartData.datasets[0].backgroundColor || "#37474f"}
            yDomain={
              (() => {
                const r = computeYRangeForChart(chartObj);
                if (!r) return undefined;
                const span = r.max - r.min;
                const pad = !Number.isFinite(span) || span === 0 ? 1 : span * 0.1;
                return { min: Math.max(0, r.min - pad), max: r.max + pad };
              })()
            }
          />
        ) : (
           <ReactChart
             key={chartKey}
             datasetIdKey={`${cfg.parameter}-${chartObj.type}`}
             type={chartObj.type}
             data={chartData}
             options={options}
             updateMode="none"
             style={{ width: "100%", height: "100%" }}
           />
        )}
      </div>
    </div>
  );
}

ChartPanel.propTypes = {
  title: PropTypes.string,
  chartObj: PropTypes.object,
  cfg: PropTypes.object,
  slotLabel: PropTypes.string,
  options: PropTypes.object,
  icons: PropTypes.node,
  notice: PropTypes.node,
  nav: PropTypes.shape({
    prev: PropTypes.func,
    next: PropTypes.func,
    hasMultipleSites: PropTypes.bool,
  }),
};

// --------------------------- main Plots (unchanged) ----------------------------
function Plots({ plotConfigs = [], setPlotConfigs, rawData = [], infoData = {}, loading = false }) {
  const cfg1 = plotConfigs[0];
  const cfg2 = plotConfigs[1];

  const chart1 = useMemo(() => {
    if (!rawData || !cfg1) return null;
    return cfg1.chartType === "trend"
      ? buildTrendChart(rawData, cfg1, defaultColors)
      : buildComparisonChart(rawData, cfg1, defaultColors);
  }, [rawData, cfg1]);
  const chart2 = useMemo(() => {
    if (!rawData || !cfg2) return null;
    return cfg2.chartType === "trend"
      ? buildTrendChart(rawData, cfg2, defaultColors)
      : buildComparisonChart(rawData, cfg2, defaultColors);
  }, [rawData, cfg2]);

  const options1 = useMemo(() => makeOptions(cfg1?.parameter, chart1), [cfg1?.parameter, chart1]);
  const options2 = useMemo(() => makeOptions(cfg2?.parameter, chart2), [cfg2?.parameter, chart2]);

  const [modal, setModal] = useState(null);

  const handlePrevSite = (slot) => {
    if (typeof setPlotConfigs !== "function") return;
    setPlotConfigs((prev) => {
      const next = [...prev];
      const cfg = next[slot];
      if (!cfg) return prev;
      const sites = Array.isArray(cfg.selectedSites) ? cfg.selectedSites : [];
      if (sites.length === 0) return prev;
      const count = sites.length;
      let idx = Number.isFinite(cfg.trendIndex) ? cfg.trendIndex : count - 1;
      idx = ((idx - 1) % count + count) % count;
      next[slot] = { ...cfg, trendIndex: idx };
      return next;
    });
  };
  const handleNextSite = (slot) => {
    if (typeof setPlotConfigs !== "function") return;
    setPlotConfigs((prev) => {
      const next = [...prev];
      const cfg = next[slot];
      if (!cfg) return prev;
      const sites = Array.isArray(cfg.selectedSites) ? cfg.selectedSites : [];
      if (sites.length === 0) return prev;
      const count = sites.length;
      let idx = Number.isFinite(cfg.trendIndex) ? cfg.trendIndex : count - 1;
      idx = (idx + 1) % count;
      next[slot] = { ...cfg, trendIndex: idx };
      return next;
    });
  };

  const getNoticeFor = () => null;

  const handleDownload = (cfg) => {
    if (!rawData || !cfg) return;
    const { parameter, chartType, selectedSites = [], startYear, endYear } = cfg;
    const rows = rawData.filter((row) => {
      const rowParam = row?.Parameter ? String(row.Parameter).trim() : "";
      const rowSite = row?.Site ? String(row.Site).trim() : "";
      const yearNum = parseInt(row?.Year, 10);
      return (
        rowParam === parameter &&
        selectedSites.includes(rowSite) &&
        Number.isFinite(yearNum) &&
        (startYear == null || yearNum >= startYear) &&
        (endYear == null || yearNum <= endYear)
      );
    });
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${parameter}_${chartType}_data.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const infoFor = (param, field, fallback) => {
    const row = param && infoData[param];
    return (row && row[field]) || fallback;
  };

  if (loading || !rawData || rawData.length === 0) {
    return (
      <section className="plots">
        <div className="plots-container">
          <p>Loading data…</p>
        </div>
      </section>
    );
  }

const iconsFor = (cfg) => (
  <div className="plot-icons" style={{ display: "flex", gap: 12 }}>
    <IconWithTooltip
      icon={faDownload}
      label="Download raw data"
      onClick={() => handleDownload(cfg)}
    />
    <IconWithTooltip
      icon={faInfoCircle}
      label="Contact information"
      onClick={() =>
        setModal({
          title: "Contact Information",
          body: infoFor(cfg?.parameter, "ContactInfo", "No contact information available."),
        })
      }
    />
    <IconWithTooltip
      icon={faLightbulb}
      label="Lake association information"
      onClick={() =>
        setModal({
          title: "Lake Association Information",
          body: infoFor(cfg?.parameter, "AssociationInfo", "No association information available."),
        })
      }
    />
    <IconWithTooltip
      icon={faQuestionCircle}
      label="Parameter information"
      onClick={() =>
        setModal({
          title: "Parameter Information",
          body: infoFor(cfg?.parameter, "ParameterInfo", "No parameter information available."),
        })
      }
    />
  </div>
);


  const navFor = (cfg, slot) => {
    if (!cfg || cfg.chartType !== "trend") return null;
    const sites = Array.isArray(cfg.selectedSites) ? cfg.selectedSites : [];
    if (sites.length === 0) return null;
    return {
      prev: () => handlePrevSite(slot),
      next: () => handleNextSite(slot),
      hasMultipleSites: sites.length > 1,
    };
  };

  return (
    <div className="plots-container" style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      <ChartPanel
        title={chart1?.title}
        chartObj={chart1}
        cfg={cfg1}
        slotLabel="Plot 1"
        options={options1}
        icons={iconsFor(cfg1)}
        notice={getNoticeFor(cfg1, 0)}
        nav={navFor(cfg1, 0)}
      />
      <ChartPanel
        title={chart2?.title}
        chartObj={chart2}
        cfg={cfg2}
        slotLabel="Plot 2"
        options={options2}
        icons={iconsFor(cfg2)}
        notice={getNoticeFor(cfg2, 1)}
        nav={navFor(cfg2, 1)}
      />
      {modal && <LightModal title={modal.title} body={modal.body} onClose={() => setModal(null)} />}
    </div>
  );
}
Plots.propTypes = {
  plotConfigs: PropTypes.arrayOf(
    PropTypes.shape({
      selectedSites: PropTypes.arrayOf(PropTypes.string).isRequired,
      parameter: PropTypes.string.isRequired,
      chartType: PropTypes.oneOf(["trend", "comparison"]).isRequired,
      startYear: PropTypes.number.isRequired,
      endYear: PropTypes.number.isRequired,
      trendIndex: PropTypes.number,
    })
  ).isRequired,
  setPlotConfigs: PropTypes.func.isRequired,
  rawData: PropTypes.arrayOf(PropTypes.object),
  infoData: PropTypes.object,
  loading: PropTypes.bool,
};

export default Plots;
