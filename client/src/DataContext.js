// DataContext.js
// -----------------------------------------------------------------------------
// Centralized data layer for your app.
//
// - Loads a CSV once (on mount) using fetch + PapaParse
// - Stores the parsed rows in React state
// - Exposes rows/loading/error to any child via React Context + useData()
// -----------------------------------------------------------------------------
//
// Dependencies:
//   npm install papaparse prop-types
// -----------------------------------------------------------------------------

import React, { createContext, useContext, useEffect, useState } from "react";
import Papa from "papaparse";
import PropTypes from "prop-types"; // For runtime props validation

// Create a Context object to hold our CSV data and status.
// Initial value is null so we can detect misuse (useData outside provider).
const DataContext = createContext(null);

/**
 * DataProvider
 * ------------
 * Wrap your <App /> (or a subtree) with this to:
 *   - Load the CSV once on mount
 *   - Cache the parsed rows in state
 *   - Provide rows/loading/error to all descendants via context
 *
 * Props:
 *   - csvUrl (string, optional): path to the CSV file (defaults to /data/my-data.csv)
 *   - children (ReactNode, required): React children that can consume the data via useData()
 */
export const DataProvider = ({ csvUrl = "/df_symbols.csv", children }) => {
  // rows: array of parsed CSV rows (each row is an object keyed by column name)
  const [rows, setRows] = useState([]);

  // loading: true while CSV is being fetched/parsed
  const [loading, setLoading] = useState(true);

  // error: any error encountered during fetch/parse
  const [error, setError] = useState(null);

  useEffect(() => {
    // Flag used to avoid setting state if the component unmounts mid-request
    let cancelled = false;

    // Async function to fetch and parse the CSV
    const loadCsv = async () => {
      try {
        // 1) Fetch the raw CSV text from the server
        const res = await fetch(csvUrl);
        if (!res.ok) {
          // Non-2xx HTTP response
          throw new Error(`HTTP ${res.status}`);
        }

        const text = await res.text();

        // 2) Parse CSV into an array of objects using PapaParse
        const parsed = Papa.parse(text, {
          header: true,        // First row is treated as column names
          dynamicTyping: true, // Convert numeric-like strings to numbers
          skipEmptyLines: true // Ignore blank lines
        });

        // You can inspect parsed.errors for warnings or parse issues
        if (parsed.errors.length > 0) {
          console.warn("CSV parse errors:", parsed.errors);
        }

        // 3) If the component is still mounted, update state
        if (!cancelled) {
          // parsed.data is an array of row objects
          setRows(parsed.data);
          setLoading(false);
        }
      } catch (err) {
        console.error("Error loading CSV:", err);

        // Only update state if still mounted
        if (!cancelled) {
          setError(err);
          setLoading(false);
        }
      }
    };

    // Kick off the load
    loadCsv();

    // Cleanup function runs when the component unmounts or csvUrl changes
    return () => {
      cancelled = true;
    };
  }, [csvUrl]); // Re-run if csvUrl prop changes (e.g., different dataset)

  // Value exposed to consumers via useData()
  const value = {
    rows,
    loading,
    error
  };

  // Any component wrapped by <DataProvider> can now call useData()
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

// -----------------------------------------------------------------------------
// PropTypes validation for DataProvider
// -----------------------------------------------------------------------------
DataProvider.propTypes = {
  // Optional CSV URL. If not provided, the default argument "/data/my-data.csv" is used.
  csvUrl: PropTypes.string,

  // React children that will have access to the context value.
  // node covers strings, elements, fragments, arrays, etc.
  children: PropTypes.node.isRequired
};

/**
 * useData
 * -------
 * Convenience hook to access the CSV data/context.
 *
 * Usage:
 *   const { rows, loading, error } = useData();
 *
 * Throws a helpful error if used outside of <DataProvider>.
 */
export const useData = () => {
  const ctx = useContext(DataContext);

  // If there's no provider above in the tree, ctx will be null.
  if (!ctx) {
    throw new Error("useData must be used inside a DataProvider");
  }

  return ctx;
};
