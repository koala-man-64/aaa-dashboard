// /client/src/FiltersPanel.js
import React, { useEffect, useRef, useState, useMemo } from "react";
import SearchableMultiSelect from "./SearchableMultiselect.jsx";
import PropTypes from "prop-types";
import { useData } from "./DataContext";

/**
 * FiltersPanel
 * - Manages local UI state for filters
 * - Notifies parent via onFiltersChange from user actions
 * - Uses shared CSV rows from DataContext
 */
function FiltersPanel({
  selectedIndustries = [],
  onFiltersChange = () => {},
  onDataLoaded = () => {},
}) {
  // Pull the shared CSV rows from context.
  // Each row is expected to have at least:
  // Symbol, Name, Description, Sector, Industry, Industry_2,
  // Optionable, Country, URL
  const { rows: dataRows = [], loading, error } = useData();

  // Local UI state
  const [filters, setFilters] = useState({
    selectedSymbols: [],
    selectedSectors: [],
    selectedIndustries: [],
    parameter: "",
    startYear: null,
    endYear: null,
    chartType: "trend",
  });

  // ---------------------------------------------------------------------------
  // Domain values derived from df_symbols
  // ---------------------------------------------------------------------------

  // One record per Symbol with all the "dimension" columns attached.
  // const symbolRecords = useMemo(() => {
  //   if (!dataRows || dataRows.length === 0) return [];

  //   const bySymbol = new Map();

  //   dataRows.forEach((row) => {
  //     if (!row) return;

  //     const symbol = row.Symbol ?? row.symbol;
  //     if (!symbol) return;

  //     const key = String(symbol).trim();
  //     if (!key) return;

  //     if (!bySymbol.has(key)) {
  //       bySymbol.set(key, {
  //         Symbol: key,
  //         Name: row.Name ?? "",
  //         Description: row.Description ?? "",
  //         Sector: row.Sector ?? "",
  //         Industry: row.Industry ?? "",
  //         Industry_2: row.Industry_2 ?? "",
  //         Optionable: row.Optionable ?? "",
  //         Country: row.Country ?? "",
  //         URL: row.URL ?? "",
  //       });
  //     }
  //   });

  //   return Array.from(bySymbol.values()).sort((a, b) =>
  //     a.Symbol.localeCompare(b.Symbol, undefined, { sensitivity: "base" })
  //   );
  // }, [dataRows]);

  const sectorValues = useMemo(() => {
    if (!dataRows || dataRows.length === 0) return [];
    const set = new Set();
    dataRows.forEach((row) => {
      const v = row && row.Sector;
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        set.add(String(v).trim());
      }
    });
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  }, [dataRows]);

  const industryValues = useMemo(() => {
    if (!dataRows || dataRows.length === 0) return [];
    const set = new Set();
    dataRows.forEach((row) => {
      const v = row && row.Industry;
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        set.add(String(v).trim());
      }
    });
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  }, [dataRows]);


  // const optionableValues = useMemo(() => {
  //   if (!dataRows || dataRows.length === 0) return [];
  //   const set = new Set();
  //   dataRows.forEach((row) => {
  //     const v = row && row.Optionable;
  //     if (v !== undefined && v !== null && String(v).trim() !== "") {
  //       set.add(String(v).trim());
  //     }
  //   });
  //   return Array.from(set).sort((a, b) =>
  //     a.localeCompare(b, undefined, { sensitivity: "base" })
  //   );
  // }, [dataRows]);

  // Inform parent when data loads (if needed)
  const onDataLoadedRef = useRef(onDataLoaded);
  useEffect(() => {
    onDataLoadedRef.current = onDataLoaded;
  }, [onDataLoaded]);

  useEffect(() => {
    if (!loading && !error && Array.isArray(dataRows)) {
      onDataLoadedRef.current(dataRows);
    }
  }, [dataRows, loading, error]);

  /**
   * Keep local selectedIndustries in sync with parent prop (no parent updates here).
   */
  useEffect(() => {
    if (!Array.isArray(selectedIndustries)) return;
    setFilters((prev) => {
      const sameLength =
        prev.selectedIndustries.length === selectedIndustries.length;
      const sameOrder =
        sameLength &&
        prev.selectedIndustries.every((v, i) => v === selectedIndustries[i]);
      return sameOrder ? prev : { ...prev, selectedIndustries };
    });
  }, [selectedIndustries]);

  // ---------------- Handlers (user-initiated; safe to notify parent) ----------------
  const handleIndustryChange = (updated) => {
    setFilters((prev) => ({ ...prev, selectedIndustries: updated }));
    onFiltersChange({ selectedIndustries: updated });
  };

  const handleSectorsChange = (updated) => {
    setFilters((prev) => ({ ...prev, selectedSectors: updated }));
    onFiltersChange({ selectedSectors: updated });
  };

  return (
    <div className="filters" style={{ overflowY: "auto" }}>
      {/* Now driven from context-derived values instead of hitting dataUrl */}
      <div className="filter-group site-group">
        <SearchableMultiSelect
          label="Sector"
          values={sectorValues}
          selected={filters.selectedSectors}
          onChange={handleSectorsChange}
          placeholder="Search sectors..."
          maxPanelHeight={320}
          className="w-full"
        />
      </div>

      <div className="filter-group site-group">
        <SearchableMultiSelect
          label="Industry"
          values={industryValues}
          selected={filters.selectedIndustries}
          onChange={handleIndustryChange}
          placeholder="Search industries..."
          maxPanelHeight={320}
          className="w-full"
        />
      </div>
    </div>
  );
}

FiltersPanel.propTypes = {
  selectedIndustries: PropTypes.arrayOf(PropTypes.string),
  onFiltersChange: PropTypes.func.isRequired,
  onUpdatePlot1: PropTypes.func.isRequired,
  onUpdatePlot2: PropTypes.func.isRequired,
  onDataLoaded: PropTypes.func, // lifted data
  /** Whether the Update Plot buttons should be enabled */
  updateEnabled: PropTypes.bool,
};

export default FiltersPanel;
