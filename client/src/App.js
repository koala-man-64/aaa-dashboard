import React, { useState, useRef, useCallback } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import "./App.css";
import trend_plot_icon from './trend_plot_icon.png';
import comparison_plot_icon from './comparison_plot_icon.png';
import FiltersPanel from "./FiltersPanel";
// import Header from "./Header";
import Plots from "./Plots";
import MapPanel from "./MapPanel";
import PropTypes from "prop-types";

/**
 * FilterMapPanel (controlled)
 */
function FilterMapPanel({
  filters,
  onFiltersChange,
  onUpdatePlot1,
  onUpdatePlot2,
  onDataLoaded, // bubbled up from FiltersPanel
  trendSingleSite = false,
  updateEnabled = false, // disable Update buttons until Continue
}) {
  const containerRef = useRef(null);

  // Toggle site in/out of filters.selectedSites when a marker is clicked
  const handleMarkerClick = (siteName) => {
    const nextSelected = filters.selectedSites.includes(siteName)
      ? filters.selectedSites.filter((n) => n !== siteName)
      : [...filters.selectedSites, siteName];

    onFiltersChange({ selectedSites: nextSelected });
  };

  return (
    <div ref={containerRef} className="filter-map-panel">
      {/* FiltersPanel fetches from Azure and shares data up via onDataLoaded */}
      <FiltersPanel
        selectedSites={filters.selectedSites}
        onFiltersChange={onFiltersChange}
        onUpdatePlot1={onUpdatePlot1}
        onUpdatePlot2={onUpdatePlot2}
        onDataLoaded={onDataLoaded}
        trendSingleSite={trendSingleSite}
        updateEnabled={updateEnabled}
      />

      <section className="map">
        <MapPanel
          selectedSites={filters.selectedSites}
          onMarkerClick={handleMarkerClick}
        />
      </section>
    </div>
  );
}
FilterMapPanel.propTypes = {
  filters: PropTypes.shape({
    selectedSites: PropTypes.arrayOf(PropTypes.string).isRequired,
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

/** In-app “Home” panel that lives in the RIGHT column */
function WelcomePanel({ onContinue }) {
  return (
    // Use the same shell as the plots panel so it occupies the exact same space
    <div className="plots" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <h1
          style={{
            marginTop: 0,
            marginBottom: 12,
            fontSize: 28,
            fontFamily: "Lora, Georgia, serif",
            color: "var(--color-secondary)",
          }}
        >
          Welcome to the NW Michigan Water Quality Database!
        </h1>

        <p style={{ marginBottom: 10, lineHeight: 1.5, fontSize: 'calc(1em * var(--font-scale, 1))'   }}>
This database can be used to retrieve, display, and download water quality data 
for lakes and streams in northern Michigan.  Click the markers on the map 
or use the dropdown list to identify sites that are included in the database.
          </ p>
          <p style={{ marginBottom: 10, lineHeight: 1.5, fontSize: 'calc(1em * var(--font-scale, 1))'  }}>
You can display data for the following parameters (measurements) for lakes :  Chlorophyll, Chloride, Nitrate, Secchi Depth, Total Phosphorus, and Trophic State Index and Chloride, Nitrate, Total Phosphorus, Flow Rate, and Conductivity for streams.
          </ p>
          <p style={{ marginBottom: 10, lineHeight: 1.5, fontSize: 'calc(1em * var(--font-scale, 1))'  }}>
Data can be displayed as <strong>Trend</strong> lines <img src={trend_plot_icon} /> that show how a parameter changes over time.  This allows you to determine if a parameter is increasing or decreasing.  You can compare the trend of a single parameter for two different sites or compare two different parameters for the same site.
          </ p>
          <p style={{ marginBottom: 10, lineHeight: 1.5, fontSize: 'calc(1em * var(--font-scale, 1))'  }}>
Data can also be displayed as a bar graph <img src={comparison_plot_icon} />  to <strong>Compare</strong> the overall water quality of up to 10 different sites.  This allows you to attain an overview of conditions on a more  regional basis. 
          </ p>
          <p style={{ marginBottom: 10, lineHeight: 1.5, fontSize: 'calc(1em * var(--font-scale, 1))'  }}>
Click the Continue button below to proceed to the database.  There you will be able to select one or more sites,  select the parameter, select the time interval, and choose between <strong>Trend</strong> and <strong>Comparison</strong> options.
          </ p>
          <p style={{ marginBottom: 10, lineHeight: 1.5, fontSize: 'calc(1em * var(--font-scale, 1))'  }}>
If you have questions or comments, please contact John Ransom at the Benzie County Conservation District at 231-882-4391 or email at john@benziecd.org.
          </p>
      </div>

      {/* Buttons match the Filters panel (reset-btn) */}
      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <button
          type="button"
          className="reset-btn"
          onClick={() => {
            // Simple exit behavior; adjust as needed
            window.location.href = "/";
          }}
          style={{ flex: 1, backgroundColor: "gray"}}
          title="Leave this page"
        >
          Exit
        </button>
        <div style={{flex: 2}} />
        <button
          type="button"
          className="reset-btn"
          onClick={onContinue}
          style={{ flex: 1 }}
          title="Enable plotting and show the charts panel"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
WelcomePanel.propTypes = {
  onContinue: PropTypes.func.isRequired,
};

function App() {
  // Single source of truth for filters used by both sides of the layout
  const [filters, setFilters] = useState({
    selectedSites: [],
    selectedParameters: [], // reserved for future use
    startDate: new Date(new Date().setFullYear(new Date().getFullYear() - 2)),
    endDate: new Date(),
    startYear: null,
    endYear: null,
    parameter: "",
    chartType: "trend",
  });

  // Plot configurations captured by "Update Plot 1/2"
  const [plotConfigs, setPlotConfigs] = useState([]);

  // Data shared app-wide (provided by FiltersPanel)
  const [rawData, setRawData] = useState(null);
  const [infoData, setInfoData] = useState({});
  const [loading, setLoading] = useState(true);

  // UI: show welcome on the right initially, and keep Update buttons disabled
  const [showWelcome, setShowWelcome] = useState(true);
  const [updateEnabled, setUpdateEnabled] = useState(false);

  // Accept either partial updates or a full filters object
  const onFiltersChange = useCallback((partialOrFull) => {
    setFilters((prev) => ({ ...prev, ...partialOrFull }));
  }, []);

  // Receive CSV payload from FiltersPanel
  const handleDataLoaded = useCallback(({ rawData, infoData }) => {
    setRawData(Array.isArray(rawData) ? rawData : []);
    setInfoData(infoData && typeof infoData === "object" ? infoData : {});
    setLoading(false);
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
      const sites = Array.isArray(cfg.selectedSites) ? cfg.selectedSites : [];
      // Use the last index if there are selected sites; otherwise default to 0.
      const idx = sites.length > 0 ? sites.length - 1 : 0;

      // Write back the computed index (without mutating the original).
      cfg = { ...cfg, trendIndex: idx };
    }

    // Push the new config into the first slot of `plotConfigs`.
    // This uses the functional form of setState to avoid race conditions.
    setPlotConfigs((prev) => {
      // If no configs exist yet, initialize a 2-slot array and set the first slot.
      if (prev.length === 0) return [cfg, null];

      // Otherwise, clone and replace the first item immutably.
      const next = [...prev];
      next[0] = cfg;

      // Ensure the array always has two slots.
      if (next.length === 1) next.push(null);

      return next;
    });
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
      const sites = Array.isArray(cfg.selectedSites) ? cfg.selectedSites : [];
      const idx = sites.length > 0 ? sites.length - 1 : 0;
      cfg = { ...cfg, trendIndex: idx };
    }

    // Insert/update the second slot of `plotConfigs` immutably.
    setPlotConfigs((prev) => {
      // If no configs exist yet, create a 2-slot array and set the second slot.
      if (prev.length === 0) return [null, cfg];

      // If only one exists, keep it as the first and set the second.
      if (prev.length === 1) return [prev[0], cfg];

      // Otherwise, clone and replace the second item immutably.
      const next = [...prev];
      next[1] = cfg;
      return next;
    });
  }, []);


  const RightSide = showWelcome ? (
    <WelcomePanel
      onContinue={() => {
        setShowWelcome(false);
        setUpdateEnabled(true);
      }}
    />
  ) : (
    <Plots
      plotConfigs={plotConfigs}
      setPlotConfigs={setPlotConfigs}
      rawData={rawData}
      infoData={infoData}
      loading={loading}
    />
  );

  return (
    <Router>
      <div className="app" style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        {/* <Header /> */}
        <Routes>
          {/* Redirect root & /home to /app; the welcome lives inside the /app layout */}
          <Route path="/*" element={<Navigate to="/" replace />} />

          <Route
            path="/"
            element={
              <div className="main" style={{ flex: 1, display: "flex", height: "100%" }}>
                <div className="left">
                  <FilterMapPanel
                    filters={filters}
                    onFiltersChange={onFiltersChange}
                    onUpdatePlot1={handleUpdatePlot1}
                    onUpdatePlot2={handleUpdatePlot2}
                    onDataLoaded={handleDataLoaded}
                    trendSingleSite={false}
                    updateEnabled={updateEnabled}
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
  );
}

export default App;
