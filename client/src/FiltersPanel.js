// /client/src/FiltersPanel.js
import React, { useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import SearchableMultiSelect from "./SearchableMultiselect.jsx";
import PropTypes from "prop-types";

/**
 * Azure Blob Storage constants
 */
const STORAGE_ACCOUNT = "nwmiwsstorageaccount";
const CONTAINER_NAME = "nwmiws";
const SAS_TOKEN =
  "sv=2024-11-04&ss=bfqt&srt=sco&sp=rwdlacupiytfx&se=2055-03-28T11:52:57Z&st=2025-03-28T03:52:57Z&spr=https&sig=3%2Fe9jY4M%2F0yFHftpJmTsuVvlPwpn7B4zQ9ey0bwnQ2w%3D";

/**
 * FiltersPanel
 * - Manages local UI state for filters
 * - Notifies parent via onFiltersChange from user actions
 * - Fetches CSV(s) from Azure and shares parsed data up via onDataLoaded
 */
function FiltersPanel({
  selectedSites = [],
  onFiltersChange = () => {},
  onUpdatePlot1 = () => {},
  onUpdatePlot2 = () => {},
  onDataLoaded = () => {}, // lift data up
  /**
   * Whether the Update Plot buttons should be enabled.  When false
   * the buttons are disabled and a helpful tooltip is shown on hover
   * instructing the user to click Continue on the home panel first.
   */
  updateEnabled = true,
}) {
  // Options loaded from CSV
  const [sites, setSites] = useState([]);
  const [parameters, setParameters] = useState([]);
  const [availableYears, setAvailableYears] = useState([]);

  // Local UI state
  const [filters, setFilters] = useState({
    selectedSites: [],
    parameter: "",
    startYear: null,
    endYear: null,
    chartType: "trend",
  });

  // Guard to ensure CSV-based year initialization runs once
  const didInitYearsRef = useRef(false);

  // Keep latest onDataLoaded without depending on function identity in effects
  const onDataLoadedRef = useRef(onDataLoaded);
  useEffect(() => {
    onDataLoadedRef.current = onDataLoaded;
  }, [onDataLoaded]);

  /**
   * Keep local selectedSites in sync with parent prop (no parent updates here).
   */
  useEffect(() => {
    if (!Array.isArray(selectedSites)) return;
    setFilters((prev) => {
      const sameLength = prev.selectedSites.length === selectedSites.length;
      const sameOrder =
        sameLength && prev.selectedSites.every((v, i) => v === selectedSites[i]);
      return sameOrder ? prev : { ...prev, selectedSites };
    });
  }, [selectedSites]);

  /**
   * Fetch CSV(s) once from Azure, populate options, initialize years, and
   * bubble up the parsed data to App via onDataLoaded.
   */
  useEffect(() => {
    const dataUrl = `https://${STORAGE_ACCOUNT}.blob.core.windows.net/${CONTAINER_NAME}/NWMIWS_Site_Data_testing_varied.csv?${SAS_TOKEN}`;
    const infoUrl = `https://${STORAGE_ACCOUNT}.blob.core.windows.net/${CONTAINER_NAME}/info.csv?${SAS_TOKEN}`;

    let cancelled = false;

    async function fetchText(url) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res.text();
    }

    (async () => {
      try {
        const [dataCsvText, infoCsvText] = await Promise.all([
          fetchText(dataUrl),
          fetchText(infoUrl).catch(() => ""),
        ]);

        // Parse main data
        let dataRows = [];
        Papa.parse(dataCsvText, {
          header: true,
          skipEmptyLines: true,
          complete: ({ data }) => (dataRows = data),
        });

        // Parse info CSV (optional)
        let infoRows = [];
        if (infoCsvText) {
          Papa.parse(infoCsvText, {
            header: true,
            skipEmptyLines: true,
            complete: ({ data }) => (infoRows = data),
          });
        }

        if (cancelled) return;

        // Build info map keyed by Parameter
        const infoMap = {};
        for (const r of infoRows || []) {
          const key = r?.Parameter ? String(r.Parameter).trim() : "";
          if (key) infoMap[key] = r;
        }

        // Build options
        const allSites = dataRows.map((r) => r.Site).filter(Boolean);
        const allParameters = dataRows.map((r) => r.Parameter).filter(Boolean);
        const uniqueSites = [...new Set(allSites)].sort((a, b) => a.localeCompare(b));
        const uniqueParameters = [...new Set(allParameters)].sort((a, b) => a.localeCompare(b));

        // Years
        const yearsNum = dataRows
          .map((row) => parseInt(row.Year, 10))
          .filter((y) => Number.isFinite(y));
        const uniqueYears = [...new Set(yearsNum)].sort((a, b) => a - b);
        const min = uniqueYears[0];
        const max = uniqueYears[uniqueYears.length - 1];

        setSites(uniqueSites);
        setParameters(uniqueParameters);
        setAvailableYears(uniqueYears);

        // Initialize local + parent years once
        if (!didInitYearsRef.current && uniqueYears.length) {
          didInitYearsRef.current = true;
          setFilters((prev) => ({
            ...prev,
            startYear: prev.startYear ?? min,
            endYear: prev.endYear ?? max,
          }));
          onFiltersChange({ startYear: min, endYear: max });
        }

        // Bubble up parsed data for Plots/App-wide state (via ref)
        onDataLoadedRef.current?.({ rawData: dataRows, infoData: infoMap });
      } catch (err) {
        console.error("Error loading CSV(s) from Azure:", err);
        onDataLoadedRef.current?.({ rawData: [], infoData: {} });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []); // run once

  // ---------------- Handlers (user-initiated; safe to notify parent) ----------------
  const handleSitesChange = (updated) => {
    setFilters((prev) => ({ ...prev, selectedSites: updated }));
    onFiltersChange({ selectedSites: updated });
  };

  const handleStartYearChange = (e) => {
    const newStart = parseInt(e.target.value, 10);
    if (!Number.isFinite(newStart)) return;
    const currentEnd = filters.endYear;
    const nextEnd = currentEnd != null && newStart <= currentEnd ? currentEnd : newStart;
    setFilters((prev) => ({ ...prev, startYear: newStart, endYear: nextEnd }));
    onFiltersChange({ startYear: newStart, endYear: nextEnd });
  };

  const handleEndYearChange = (e) => {
    const rawEnd = parseInt(e.target.value, 10);
    if (!Number.isFinite(rawEnd)) return;
    const start = filters.startYear;
    const nextEnd = start != null ? Math.max(rawEnd, start) : rawEnd;
    setFilters((prev) => ({ ...prev, endYear: nextEnd }));
    onFiltersChange({ startYear: start ?? nextEnd, endYear: nextEnd });
  };

  const handleParameterChange = (e) => {
    const parameter = e.target.value;
    setFilters((prev) => ({ ...prev, parameter }));
    onFiltersChange({ parameter });
  };

  const handleChartTypeChange = (e) => {
    const chartType = e.target.value;
    setFilters((prev) => ({ ...prev, chartType }));
    onFiltersChange({ chartType });
  };

  const disabledHint = "Click Continue in the welcome panel to enable plotting.";

  return (
    <div className="filters" style={{ overflowY: "auto" }}>
      {/* Sites (multi-select) - always visible */}
      <div className="filter-group site-group">
        <SearchableMultiSelect
          label="Sites"
          options={sites}
          selected={filters.selectedSites}
          onChange={handleSitesChange}
          placeholder="Search sites…"
          maxPanelHeight={320}
          className="w-full"
        />
      </div>

      {/* Render other filter controls only when updateEnabled is true. */}
      {updateEnabled && (
        <>
          {/* Start Year */}
          <div className="filter-group">
            <div className="filter-dropdown">
              <label className="sms-label">Start Year</label>
              <select
                value={filters.startYear ?? ""}
                onChange={handleStartYearChange}
                className="year-select"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* End Year */}
          <div className="filter-group">
            <div className="filter-dropdown">
              <label className="sms-label">End Year</label>
              <select
                value={filters.endYear ?? ""}
                onChange={handleEndYearChange}
                className="year-select"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Parameter */}
          <div className="filter-group">
            <div className="filter-dropdown">
              <label className="sms-label">Parameter</label>
              <select
                value={filters.parameter}
                onChange={handleParameterChange}
                className="year-select"
              >
                <option value="" disabled>
                  Select parameter…
                </option>
                {parameters.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Chart Type */}
          <div className="filter-group">
            <div className="filter-dropdown">
              <label className="sms-label">Chart Type</label>
              <select
                value={filters.chartType}
                onChange={handleChartTypeChange}
                className="year-select"
              >
                <option value="trend">Trend</option>
                <option value="comparison">Comparison</option>
              </select>
            </div>
          </div>

          {/* Actions — stacked vertically to save horizontal space */}
          <div className="filter-group filter-buttons">
            <button
              type="button"
              className="reset-btn"
              onClick={() => onUpdatePlot1(filters)}
              disabled={!updateEnabled}
              title={!updateEnabled ? disabledHint : "Update the left plot with current filters"}
            >
              Update Plot 1
            </button>

            <button
              type="button"
              className="reset-btn"
              onClick={() => onUpdatePlot2(filters)}
              disabled={!updateEnabled}
              title={!updateEnabled ? disabledHint : "Update the right plot with current filters"}
            >
              Update Plot 2
            </button>
          </div>
        </>
      )}
    </div>
  );
}
FiltersPanel.propTypes = {
  selectedSites: PropTypes.arrayOf(PropTypes.string).isRequired,
  onFiltersChange: PropTypes.func.isRequired,
  onUpdatePlot1: PropTypes.func.isRequired,
  onUpdatePlot2: PropTypes.func.isRequired,
  onDataLoaded: PropTypes.func, // lifted data
  /** Whether the Update Plot buttons should be enabled */
  updateEnabled: PropTypes.bool,
};

export default FiltersPanel;
