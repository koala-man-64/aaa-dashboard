import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
} from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";

/**
 * SearchableMultiSelect
 *
 * A dropdown component that:
 * - Shows a button with a summary of the current selection.
 * - When opened, renders a floating panel (via portal) positioned near the button.
 * - Allows searching through options.
 * - Supports single or multi-select behavior.
 * - Provides All / Clear actions.
 * - Can optionally preload options by calling a backend endpoint (e.g. Azure Function).
 * - NEW: Can be driven entirely by an in-memory `values` list (bypassing dataUrl).
 */
export default function SearchableMultiSelect({
  values = null,          // NEW: explicit list of values to display (takes precedence when provided)
  options = [],           // Initial list of selectable option strings (fallback if values not provided)
  selected = [],          // Currently selected option strings
  onChange,               // Callback invoked with updated selection array
  placeholder = "Search…",// Placeholder text for search input
  label = "",             // Label shown above the control
  maxPanelHeight = 280,   // Maximum height (in px) for the dropdown panel
  className = "",
  multiSelect = true,     // When false, behaves like a single-select
  dataUrl = null,         // OPTIONAL: URL to fetch options from (e.g. "http://localhost:7071/api/GetSymbols")
}) {
  // Whether the dropdown panel is open or closed
  const [open, setOpen] = useState(false);

  // Current search text
  const [query, setQuery] = useState("");

  // Index of the option currently hovered/keyboard-focused in the filtered list
  const [hoverIdx, setHoverIdx] = useState(-1);

  // Loading + error state for remote options
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Internal state that actually holds the options we render.
  // Priority:
  //   1) values (if provided)
  //   2) options prop
  //   3) dataUrl-fetched values
  const [effectiveOptions, setEffectiveOptions] = useState(
    values || options
  );

  // Keep effectiveOptions in sync when the `values` or `options` props change.
  // If `values` is provided, it always wins and disables dataUrl fetching.
  useEffect(() => {
    if (Array.isArray(values) && values.length > 0) {
      setEffectiveOptions(values);
      return;
    }

    // If no values, but no dataUrl either, fall back to options prop
    if (!dataUrl) {
      setEffectiveOptions(options || []);
    }
  }, [values, options, dataUrl]);

  /**
   * Fetch options from backend if `dataUrl` is provided
   * AND we are not being driven by `values`.
   *
   * Assumptions:
   * - The backend is reachable from the browser (CORS/proxy handled elsewhere).
   * - It returns JSON in one of these shapes:
   *   - ["AAPL", "MSFT", ...]  (array of strings)
   *   - [{ "Symbol": "AAPL" }, { "Symbol": "MSFT" }, ...]
   *   - { symbols: ["AAPL", "MSFT", ...] }
   */
  useEffect(() => {
    // If a `values` array is provided, ignore remote fetching entirely.
    if (!dataUrl || (Array.isArray(values) && values.length > 0)) return;

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    const load = async () => {
      try {
        const res = await fetch(dataUrl);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();

        if (cancelled) return;

        let fetchedValues = [];

        const buildLabel = (item) => {
          if (label === "Tickers") {
            const symbol =
              item.Symbol ??
              item.symbol ??
              item.Value ??
              item.value ??
              null;
            return symbol != null ? String(symbol) : null;
          } else if (label === "Industry") {
            const industry = item.Industry ?? item.industry ?? null;
            return industry != null ? String(industry) : null;
          } else if (label === "Sector") {
            const sector = item.Sector ?? item.sector ?? null;
            return sector != null ? String(sector) : null;
          }
          return null;
        };

        if (Array.isArray(data)) {
          if (data.length > 0 && typeof data[0] === "object") {
            fetchedValues = data
              .map((item) => buildLabel(item))
              .filter(Boolean);
          } else {
            fetchedValues = data.map((v) => String(v));
          }
        } else if (data && Array.isArray(data.symbols)) {
          if (data.symbols.length > 0 && typeof data.symbols[0] === "object") {
            fetchedValues = data.symbols
              .map((item) => buildLabel(item))
              .filter(Boolean);
          } else {
            fetchedValues = data.symbols.map((v) => String(v));
          }
        }

        // Remove duplicates first
        const uniqueValues = Array.from(new Set(fetchedValues));

        // Sort alphabetically, case-insensitive
        uniqueValues.sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: "base" })
        );

        setEffectiveOptions(uniqueValues);
      } catch (err) {
        console.error("Failed to load options from", dataUrl, err);
        if (!cancelled) {
          setLoadError(err.message || "Failed to load symbols");
          setEffectiveOptions([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [dataUrl, label, values]);

  // START: state for controlling the floating panel's CSS position/size
  // Initialized off-screen so the first paint doesn't show anything.
  const [panelStyle, setPanelStyle] = useState({
    position: "fixed",
    top: -9999,
    left: -9999,
    width: 0,
    maxHeight: maxPanelHeight,
    zIndex: 10000,
  });
  // END

  // Root wrapper for the component
  const rootRef = useRef(null);

  // Reference to the toggle button (used for positioning the panel)
  const toggleRef = useRef(null);

  // Reference to the floating panel DOM node
  const panelRef = useRef(null);

  // Close the dropdown when clicking outside of the component/panel
  useEffect(() => {
    const onDocClick = (e) => {
      // If the click is outside both the root and the panel, close the dropdown
      if (
        !rootRef.current?.contains(e.target) &&
        !panelRef.current?.contains(e.target)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocClick);

    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Memoized filtered options based on query + effectiveOptions
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return effectiveOptions;
    return effectiveOptions.filter((o) =>
      String(o).toLowerCase().includes(q)
    );
  }, [effectiveOptions, query]);

  /**
   * toggleOption
   *
   * Adds or removes an option from the selection.
   * - In multi-select mode: toggles presence in the selected array.
   * - In single-select mode: either sets that single option or clears selection.
   */
  const toggleOption = (opt) => {
    let next;

    if (multiSelect) {
      // Multi-select: if already selected, remove it; otherwise, add it.
      next = selected.includes(opt)
        ? selected.filter((s) => s !== opt)
        : [...selected, opt];
    } else {
      // Single-select: clicking the same value clears; otherwise, set single value.
      next = selected.length === 1 && selected[0] === opt ? [] : [opt];
    }

    onChange?.(next);
  };

  const selectAll = () =>
    onChange?.(Array.from(new Set([...selected, ...filtered])));

  const clearAll = () => onChange?.([]);

  const computePlacement = () => {
    if (!toggleRef.current) return;

    const r = toggleRef.current.getBoundingClientRect();
    const pad = 8;

    const width = Math.min(r.width, window.innerWidth - pad * 2);
    const left = Math.max(
      pad,
      Math.min(r.left, window.innerWidth - width - pad)
    );
    const maxH = Math.min(maxPanelHeight, window.innerHeight - pad * 2);
    const top = Math.min(r.top, window.innerHeight - pad);

    setPanelStyle({
      position: "fixed",
      top,
      left,
      width,
      maxHeight: maxH,
      zIndex: 10000,
    });
  };

  const onToggleClick = () => {
    if (!open) {
      computePlacement();
      setOpen(true);
      requestAnimationFrame(() => computePlacement());
    } else {
      setOpen(false);
    }
  };

  const onKeyDown = (e) => {
    if (
      !open &&
      (e.key === "Enter" || e.key === " " || e.key === "ArrowDown")
    ) {
      e.preventDefault();
      computePlacement();
      setOpen(true);
      requestAnimationFrame(() => computePlacement());
      setHoverIdx(0);
      return;
    }

    if (!open) return;

    if (e.key === "Escape") {
      setOpen(false);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHoverIdx((i) => Math.min(i + 1, filtered.length - 1));
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHoverIdx((i) => Math.max(i - 1, 0));
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[hoverIdx];
      if (opt != null) toggleOption(opt);
    }
  };

  useLayoutEffect(() => {
    if (!open) return;

    const place = () => computePlacement();
    place();

    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);

    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, maxPanelHeight]);

  const summary = (() => {
    if (loading && !effectiveOptions.length) return `Loading ${label}…`;
    if (selected.length === 0) return `Select ${label}`;
    if (selected.length === 1) return selected[0];

    const first = selected[0];
    const others = selected.length - 1;
    const suffix = others === 1 ? "other" : "others";
    return `${first} + ${others} ${suffix}`;
  })();

  const panel = open
    ? createPortal(
        <div
          ref={panelRef}
          className="sms-panel sms-panel-overlay"
          style={panelStyle}
          role="dialog"
          aria-label={`${label} picker`}
        >
          <div className="sms-controls">
            <input
              autoFocus
              className="sms-search"
              type="text"
              placeholder={placeholder}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHoverIdx(0);
              }}
              disabled={loading && !effectiveOptions.length}
            />

            <div
              className="sms-actions"
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                justifyContent: "flex-start",
              }}
            >
              <button
                type="button"
                className="sms-action"
                onClick={selectAll}
                title="Select all"
                disabled={!filtered.length}
              >
                All
              </button>
              <button
                type="button"
                className="sms-action"
                onClick={clearAll}
                title="Clear selection"
                disabled={!selected.length}
              >
                Clear
              </button>
            </div>
          </div>

          {loading && (
            <div className="sms-status sms-status-loading">
              Loading {label}…
            </div>
          )}
          {loadError && (
            <div className="sms-status sms-status-error">
              Failed to load {label}: {loadError}
            </div>
          )}

          <div className="sms-list" role="listbox" aria-multiselectable>
            {!loading && filtered.length === 0 && (
              <div className="sms-empty">No matches</div>
            )}

            {filtered.map((opt, idx) => {
              const active = selected.includes(opt);

              return (
                <div
                  key={opt}
                  role="option"
                  aria-selected={active}
                  className={`sms-option ${active ? "active" : ""} ${
                    idx === hoverIdx ? "hover" : ""
                  }`}
                  onMouseEnter={() => setHoverIdx(idx)}
                  onClick={() => toggleOption(opt)}
                  title={opt}
                >
                  <input type="checkbox" readOnly checked={active} />
                  <span className="sms-option-label">{opt}</span>
                </div>
              );
            })}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div
      ref={rootRef}
      className={`sms-root ${className}`}
      onKeyDown={onKeyDown}
    >
      <label className="sms-label">{label}</label>

      <button
        ref={toggleRef}
        type="button"
        className={`sms-toggle ${open ? "open" : ""}`}
        onClick={onToggleClick}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span
          className={`sms-summary ${selected.length ? "has-value" : ""}`}
        >
          {summary}
        </span>
        <span className="sms-caret" aria-hidden />
      </button>

      {panel}
    </div>
  );
}

SearchableMultiSelect.propTypes = {
  values: PropTypes.arrayOf(PropTypes.string),   // NEW: explicit list of values
  options: PropTypes.arrayOf(PropTypes.string),  // Fallback options
  selected: PropTypes.arrayOf(PropTypes.string),
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  label: PropTypes.string,
  maxPanelHeight: PropTypes.number,
  multiSelect: PropTypes.bool,
  className: PropTypes.string,
  dataUrl: PropTypes.string,
};

SearchableMultiSelect.defaultProps = {
  values: null,
  options: [],
  placeholder: "Search…",
  label: "Select",
  maxPanelHeight: 300,
  className: "",
  multiSelect: true,
  dataUrl: null,
};
