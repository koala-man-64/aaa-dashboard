import React, { useState, useRef, useCallback } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import "./App.css";
import FiltersPanel from "./FiltersPanel";
// import Header from "./Header";
import Plots from "./Plots";
import MapPanel from "./MapPanel";
import PropTypes from "prop-types";
import { DataProvider } from "./DataContext";

/**
 * FilterChartPanel (controlled)
 */
function FilterChartPanel({
  filters,
  onFiltersChange,
  onUpdatePlot1,
  onUpdatePlot2,
  onDataLoaded, // bubbled up from FiltersPanel
  trendSingleSite = false,
  updateEnabled = false, // disable Update buttons until Continue
}) {
  const containerRef = useRef(null);

  // Toggle site in/out of filters.selectedSectors when a marker is clicked
  const handleMarkerClick = (siteName) => {
    const nextSelected = filters.selectedSectors.includes(siteName)
      ? filters.selectedSectors.filter((n) => n !== siteName)
      : [...filters.selectedSectors, siteName];

    onFiltersChange({ selectedSectors: nextSelected });
  };

  return (
    <div ref={containerRef} className="filter-map-panel">
      {/* FiltersPanel fetches from Azure and shares data up via onDataLoaded */}
      <FiltersPanel
        selectedSectors={filters.selectedSectors}
        onFiltersChange={onFiltersChange}
        onUpdatePlot1={onUpdatePlot1}
        onUpdatePlot2={onUpdatePlot2}
        onDataLoaded={onDataLoaded}
        trendSingleSite={trendSingleSite}
        updateEnabled={updateEnabled}
      />

      <section className="map">
        <MapPanel
          selectedSectors={filters.selectedSectors}
          onMarkerClick={handleMarkerClick}
        />
      </section>
    </div>
  );
}
FilterChartPanel.propTypes = {
  filters: PropTypes.shape({
    selectedSectors: PropTypes.arrayOf(PropTypes.string).isRequired,
    startYear: PropTypes.number,
    endYear: PropTypes.number,
    parameter: PropTypes.string,
    chartType: PropTypes.oneOf(["trend", "comparison"]),
  }).isRequired,
  onFiltersChange: PropTypes.func.isRequired,
  onUpdatePlot1: PropTypes.func.isRequired,
  onUpdatePlot2: PropTypes.func.isRequired,
  onDataLoaded: PropTypes.func,
  trendSingleSite: PropTypes.bool,
  updateEnabled: PropTypes.bool,
};

function App() {
  // Single source of truth for filters used by both sides of the layout
  const [filters, setFilters] = useState({
    selectedSectors: [],
    selectedIndustries: [], // reserved for future use
  });

  // Accept either partial updates or a full filters object
  const onFiltersChange = useCallback((partialOrFull) => {
    setFilters((prev) => ({ ...prev, ...partialOrFull }));
  }, []);

  /**
   * Handler for the "Update Plot 1" button.
   * - Accepts a `plotFilters` object from your Filter/Control panel.
   * - Ensures `trendIndex` is set when the chart type is "trend" (so the Trend plot
   *   knows which site's series to render—by default the last selected site).
   * - Updates `plotConfigs[0]` immutably.
   *
   * Notes:
   * - `useCallback` keeps the function identity stable (good for passing down as props).
   * - Empty dependency array means the closure is created once; that's fine because
   *   `setPlotConfigs` is stable across renders (from React state).
   */
  const handleUpdatePlot1 = useCallback((plotFilters) => {
    // Start with a shallow clone so we never mutate incoming props/objects.
    let cfg = { ...plotFilters };

    // If rendering a Trend chart, compute which site index to show by default.
    // We pick the *last* selected site (common UX when the user just added one).
    if (cfg.chartType === "trend") {
      // Normalize to an array to avoid runtime errors if the field is undefined or a single value.
      const sites = Array.isArray(cfg.selectedSectors) ? cfg.selectedSectors : [];
      // Use the last index if there are selected sites; otherwise default to 0.
      const idx = sites.length > 0 ? sites.length - 1 : 0;

      // Write back the computed index (without mutating the original).
      cfg = { ...cfg, trendIndex: idx };
    }


  }, []);

  /**
   * Handler for the "Update Plot 2" button.
   * - Same logic as Plot 1, but targets `plotConfigs[1]`.
   * - If only one config exists, it appends the new one; if none exist, it starts the array.
   */
  const handleUpdatePlot2 = useCallback((plotFilters) => {
    // Shallow clone to avoid mutating the caller's object.
    let cfg = { ...plotFilters };

    // For Trend charts, compute and store which site's series to render by default.
    if (cfg.chartType === "trend") {
      const sites = Array.isArray(cfg.selectedSectors) ? cfg.selectedSectors : [];
      const idx = sites.length > 0 ? sites.length - 1 : 0;
      cfg = { ...cfg, trendIndex: idx };
    }


  }, []);


  const RightSide = 
    <Plots
    />

  return (
    <DataProvider csvUrl="/df_symbols.csv">
      <Router>
        <div className="app" style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
          <Routes>
            {/* Redirect root & /home to /app; the welcome lives inside the /app layout */}
            <Route path="/*" element={<Navigate to="/" replace />} />

            <Route
              path="/"
              element={
                <div className="main" style={{ flex: 1, display: "flex", height: "100%" }}>
                  <div className="left">
                    <FilterChartPanel
                      filters={filters}
                      onFiltersChange={onFiltersChange}
                      onUpdatePlot1={handleUpdatePlot1}
                      onUpdatePlot2={handleUpdatePlot2}
                      trendSingleSite={false}
                    />
                  </div>

                  <div
                    className="right"
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      overflow: "hidden",
                    }}
                  >
                    {RightSide}
                  </div>
                </div>
              }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Routes>
        </div>
      </Router>
    </DataProvider>
  );
}

export default App;
