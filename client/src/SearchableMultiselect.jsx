import React, { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";

export default function SearchableMultiSelect({
  options = [],
  selected = [],
  onChange,
  placeholder = "Search…",
  label = "Sites",
  maxPanelHeight = 280,
  className = "",
  siteTypeMap = {},
  multiSelect = true,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hoverIdx, setHoverIdx] = useState(-1);

  // START: position state (initialized with a “safe” fixed position)
  const [panelStyle, setPanelStyle] = useState({
    position: "fixed",
    top: -9999,
    left: -9999,
    width: 0,
    maxHeight: maxPanelHeight,
    zIndex: 10000,
  });
  // END

  const rootRef = useRef(null);
  const toggleRef = useRef(null);
  const panelRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const onDocClick = (e) => {
      if (!rootRef.current?.contains(e.target) && !panelRef.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => String(o).toLowerCase().includes(q));
  }, [options, query]);

  const toggleOption = (opt) => {
    let next;
    if (multiSelect) {
      next = selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt];
    } else {
      next = selected.length === 1 && selected[0] === opt ? [] : [opt];
    }
    onChange?.(next);
  };

  const selectAll = () => onChange?.(Array.from(new Set([...selected, ...filtered])));
  const clearAll = () => onChange?.([]);

  const inferType = (name) => {
    const t = (siteTypeMap?.[name] || "").toString().toLowerCase();
    if (t === "lake" || t === "stream") return t;
    const s = String(name).toLowerCase();
    if (/\bstream\b|\briver\b|\bcreek\b/.test(s)) return "stream";
    if (/\blake\b/.test(s)) return "lake";
    return "";
  };
  const selectByType = (type) => {
    const want = options.filter((n) => inferType(n) === type.toLowerCase());
    onChange?.(want);
  };

  // Compute a placement rect relative to viewport
  const computePlacement = () => {
    if (!toggleRef.current) return;

    const r = toggleRef.current.getBoundingClientRect();
    const pad = 8;
    const width = Math.min(r.width, window.innerWidth - pad * 2);
    const left = Math.max(pad, Math.min(r.left, window.innerWidth - width - pad));
    const maxH = Math.min(maxPanelHeight, window.innerHeight - pad * 2);

    // position panel just under the control
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

  // OPEN/CLOSE with pre-placement to avoid first-paint flash
  const onToggleClick = () => {
    if (!open) {
      computePlacement();      // pre-place before opening
      setOpen(true);
      // ensure a final placement after mount
      requestAnimationFrame(() => computePlacement());
    } else {
      setOpen(false);
    }
  };

  // Keyboard navigation
  const onKeyDown = (e) => {
    if (!open && (e.key === "Enter" || e.key === " " || e.key === "ArrowDown")) {
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

  // Reposition on resize/scroll while open
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

  // --- Updated summary text logic ---
  const summary = (() => {
    if (selected.length === 0) return `Select ${label}`;
    if (selected.length === 1) return selected[0];

    // When multiple sites are selected: "First + N other(s)"
    // Example: "North Lake Leelanau + 3 others"
    const first = selected[0];
    const others = selected.length - 1;
    const suffix = others === 1 ? "other" : "others";
    return `${first} + ${others} ${suffix}`;
  })();
  // -----------------------------------

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
            />
            <div
              className="sms-actions"
              style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-start" }}
            >
              <button type="button" className="sms-action" onClick={selectAll} title="Select all">
                All
              </button>
              <button type="button" className="sms-action" onClick={clearAll} title="Clear selection">
                Clear
              </button>
              <button
                type="button"
                className="sms-action"
                onClick={() => selectByType("lake")}
                title="Select all Lakes"
              >
                Lakes
              </button>
              <button
                type="button"
                className="sms-action"
                onClick={() => selectByType("stream")}
                title="Select all Streams"
              >
                Streams
              </button>
            </div>
          </div>

          <div className="sms-list" role="listbox" aria-multiselectable>
            {filtered.length === 0 && <div className="sms-empty">No matches</div>}
            {filtered.map((opt, idx) => {
              const active = selected.includes(opt);
              return (
                <div
                  key={opt}
                  role="option"
                  aria-selected={active}
                  className={`sms-option ${active ? "active" : ""} ${idx === hoverIdx ? "hover" : ""}`}
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
    <div ref={rootRef} className={`sms-root ${className}`} onKeyDown={onKeyDown}>
      <label className="sms-label">{label}</label>
      <button
        ref={toggleRef}
        type="button"
        className={`sms-toggle ${open ? "open" : ""}`}
        onClick={onToggleClick}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`sms-summary ${selected.length ? "has-value" : ""}`}>{summary}</span>
        <span className="sms-caret" aria-hidden />
      </button>

      {panel}
    </div>
  );
}

SearchableMultiSelect.propTypes = {
  options: PropTypes.arrayOf(PropTypes.string).isRequired,
  selected: PropTypes.arrayOf(PropTypes.string).isRequired,
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  label: PropTypes.string,
  maxPanelHeight: PropTypes.number,
  multiSelect: PropTypes.bool,
  className: PropTypes.string,
  siteTypeMap: PropTypes.object,
};

SearchableMultiSelect.defaultProps = {
  placeholder: "Search…",
  label: "Select",
  maxPanelHeight: 300,
  className: "",
  siteTypeMap: {},
};
