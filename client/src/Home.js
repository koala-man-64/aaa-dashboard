import { useEffect } from "react";
// import { Link, useNavigate } from "react-router-dom";
import { useNavigate } from "react-router-dom";
// import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
// // import L from "leaflet";
import Papa from "papaparse";
import map_screenshot from './map_screenshot.png';
import trend_plot_icon from './trend_plot_icon.png';
import comparison_plot_icon from './comparison_plot_icon.png';
import "leaflet/dist/leaflet.css";
// import shadow from "leaflet/dist/images/marker-shadow.png";

/**
 * Home
 * ----
 * Intro/landing page describing what the application can do.
 * Uses the same visual language and layout proportions as the app.
 */
export default function Home() {
  const navigate = useNavigate();
  // const [locations, setLocations] = useState([]);

  // // Lake = red, Stream = blue
  // const lakeIcon = useMemo(
  //   () =>
  //     new L.Icon({
  //       iconUrl:
  //         "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  //       shadowUrl: shadow,
  //       iconSize: [25, 41],
  //       iconAnchor: [12, 41],
  //       popupAnchor: [1, -34],
  //       shadowSize: [41, 41],
  //     }),
  //   []
  // );

  // const streamIcon = useMemo(
  //   () =>
  //     new L.Icon({
  //       iconUrl:
  //         "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png",
  //       shadowUrl: shadow,
  //       iconSize: [25, 41],
  //       iconAnchor: [12, 41],
  //       popupAnchor: [1, -34],
  //       shadowSize: [41, 41],
  //     }),
  //   []
  // );

  // const inferType = (name) => {
  //   const s = String(name || "").toLowerCase();
  //   if (/\b(stream|river|creek)\b/.test(s)) return "stream";
  //   if (/\blake\b/.test(s)) return "lake";
  //   return "lake";
  // };

  useEffect(() => {
    const STORAGE_ACCOUNT = "nwmiwsstorageaccount";
    const CONTAINER_NAME = "nwmiws";
    const SAS_TOKEN =
      "sv=2024-11-04&ss=bfqt&srt=sco&sp=rwdlacupiytfx&se=2055-03-28T12:14:21Z&st=2025-03-28T04:14:21Z&spr=https&sig=c2vDu7jiNSYQ2FTY5Dr9VEB7G%2BR8wVEHnveaXwNFE5k%3D";

    const url = `https://${STORAGE_ACCOUNT}.blob.core.windows.net/${CONTAINER_NAME}/locations.csv?${SAS_TOKEN}`;
    fetch(url)
      .then((r) => r.text())
      .then((csv) =>
        Papa.parse(csv, {
          header: true,
          skipEmptyLines: true,
          // complete: ({ data }) => {
          //   // const locs = data
          //   //   .map((row) => {
          //   //     const name = row.name || row.Location;
          //   //     const lat = parseFloat(row.latitude) || parseFloat(row.Latitude);
          //   //     const lng = parseFloat(row.longitude) || parseFloat(row.Longitude);
          //   //     if (!name || isNaN(lat) || isNaN(lng)) return null;
          //   //     return { name, lat, lng };
          //   //   })
          //   //   .filter(Boolean);
          //   // setLocations(locs);
          // },
        })
      )
      .catch((e) => console.error("Error loading locations:", e));
  }, []);

  // const bounds = useMemo(() => {
  //   if (!locations.length) return null;
  //   return L.latLngBounds(locations.map((l) => [l.lat, l.lng]));
  // }, [locations]);

  // const defaultCenter = [45.0, -85.5];
  // const defaultZoom = 6;

  return (
    <div className="main" style={{ height: "100%"  }}>
      {/* Reuse the same .main grid as the dashboard so columns match:
         left = max-content (capped by --panel-max-width), right = flexible */}
       {/* RIGHT: description panel (flexible width like plots column) */}
        
          <img src={map_screenshot} />
        <div
          className="right"
          style={{
            display: "flex",
            flexDirection: "column",
            background: "var(--color-panel-bg)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius)",
            padding: 24,
            boxShadow: "0 2px 4px rgba(0,0,0,.08)",
          }}
        >
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

            <p style={{ marginBottom: 10, lineHeight: 1.5 }}>
              This database can be used to retrieve, display, and download water quality data
              for lakes and streams in northern Michigan. (see map)
            </p>
            <br />
            <p style={{ marginBottom: 10, lineHeight: 1.5 }}>
              You can select from a list of select any of the following water quality parameters: <strong>Chloro, Cloride, Nitrate, Secchi, Total Phosphorous</strong>
            </p>
            {/* <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 14px" }}>
              <span style={{ color: "var(--color-secondary)", fontWeight: 600 }}>
                Click below to show parameters
              </span>
              <Link
                to="/app"
                style={{
                  textDecoration: "none",
                  background: "#eef2ff",
                  color: "var(--color-secondary)",
                  border: "1px solid var(--color-border)",
                  padding: "6px 10px",
                  borderRadius: "10px",
                  fontWeight: 600,
                }}
              >
                Trophic Index
              </Link>
            </div> */}
            <br />
            <ol style={{ margin: "12px 0 12px 18px", lineHeight: 1.6, padding: 0 }}>
              <li style={{ marginBottom: 8 }}>
                <strong>Trend:</strong> Data can be displayed as a trend line that shows 
         how a water quality parameter changes over time.
                <img src={trend_plot_icon} />
              </li>
              <li>
               <img src={comparison_plot_icon} /> <strong>Comparison:</strong> Data can also be displayed as a bar graph that simultaneously 
       compares the average water quality of up to 10 different sites.
                
              </li>   
            </ol>
            <br />
            <p style={{ marginBottom: 10, lineHeight: 1.5 }}>
              Select the preferred site(s), the type of display, the water quality measurement,
              and the time interval. The charts show the selected data and the maximum and minimum
              values as well as the actual number of annual measurements.
            </p>


          </div>
            <p style={{ marginBottom: 0, lineHeight: 1.5 }}>
              If you have questions or comments, please contact John Ransom at the Benzie County
              Conservation District. <strong>231-882-4391</strong> or <strong>john@benziecd.org</strong>.
            </p>
          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            <button
              type="button"
              onClick={() => navigate("/app")}
              style={{
                flex: 1,
                padding: 12,
                backgroundColor: "var(--color-accent)",
                color: "#fff",
                border: "none",
                borderRadius: "var(--radius)",
                fontSize: 16,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Continue
            </button>
            <div style={{flex: 1}} />
            <a
              href="https://www.benziecd.org"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1,
                textDecoration: "none",
                textAlign: "center",
                padding: 12,
                backgroundColor: "#e5e7eb",
                color: "var(--color-secondary)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius)",
                fontSize: 16,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              Exit
            </a>
          </div>
        </div>
    </div>
  );
}
