import React, { useEffect, useState, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import Papa from "papaparse";
import "leaflet/dist/leaflet.css";
import marker2x from "leaflet/dist/images/marker-icon-2x.png";
import marker from "leaflet/dist/images/marker-icon.png";
import shadow from "leaflet/dist/images/marker-shadow.png";
import PropTypes from "prop-types";

/** Leaflet default icon fix */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: marker2x,
  iconUrl: marker,
  shadowUrl: shadow,
});

/** Explicit colored marker icons */
const redIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  shadowUrl: shadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const greenIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
  shadowUrl: shadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function SetMapBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds);
    }
  }, [map, bounds]);
  return null;
}
SetMapBounds.propTypes = {
  bounds: PropTypes.object,
};

const STORAGE_ACCOUNT = "nwmiwsstorageaccount";
const CONTAINER_NAME = "nwmiws";
const SAS_TOKEN =
  "sv=2024-11-04&ss=bfqt&srt=sco&sp=rwdlacupiytfx&se=2055-03-28T12:14:21Z&st=2025-03-28T04:14:21Z&spr=https&sig=c2vDu7jiNSYQ2FTY5Dr9VEB7G%2BR8wVEHnveaXwNFE5k%3D";

function MapPanel({ selectedSites = [], onMarkerClick }) {
  const [allLocations, setAllLocations] = useState([]);

  // Fetch locations once
  useEffect(() => {
    const url = `https://${STORAGE_ACCOUNT}.blob.core.windows.net/${CONTAINER_NAME}/locations.csv?${SAS_TOKEN}`;
    fetch(url)
      .then((response) => response.text())
      .then((csvText) => {
        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (result) => {
            const locations = result.data
              .map((row) => {
                const urlField =
                  row.url ||
                  row.URL ||
                  row.link ||
                  row.Link ||
                  row.website ||
                  row.Website ||
                  "";

                return {
                  name: row.name || row.Location,
                  lat: parseFloat(row.latitude) || parseFloat(row.Latitude),
                  lng: parseFloat(row.longitude) || parseFloat(row.Longitude),
                  avg_depth: row.avg_depth_ft
                    ? `${parseInt(row.avg_depth_ft, 10).toLocaleString()} ft`
                    : "N/A",
                  max_depth: row.max_depth_ft
                    ? `${parseInt(row.max_depth_ft, 10).toLocaleString()} ft`
                    : "N/A",
                  size: row.surface_area_acres
                    ? `${parseInt(row.surface_area_acres, 10).toLocaleString()} acres`
                    : "N/A",
                  description: row.description || "No description available.",
                  url: String(urlField).trim(),
                };
              })
              .filter((loc) => !isNaN(loc.lat) && !isNaN(loc.lng));
            setAllLocations(locations);
          },
        });
      })
      .catch((error) => {
        console.error("Error loading locations CSV:", error);
      });
  }, []);

  // Compute bounds if no selection
  const bounds = useMemo(() => {
    if (selectedSites && selectedSites.length === 0 && allLocations.length > 0) {
      return L.latLngBounds(allLocations.map((loc) => [loc.lat, loc.lng]));
    }
    return null;
  }, [selectedSites, allLocations]);

  const defaultCenter = [42.5, -86.0];
  const defaultZoom = 8;

  return (
    <MapContainer
      style={{ height: "100%" }}
      center={bounds ? undefined : defaultCenter}
      zoom={bounds ? undefined : defaultZoom}
      scrollWheelZoom
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      {bounds && <SetMapBounds bounds={bounds} />}

      {allLocations.map((loc) => {
        const isSelected = selectedSites.includes(loc.name);
        const icon = isSelected ? greenIcon : redIcon; // green = selected, red = unselected
        return (
          <Marker
            key={loc.name}
            position={[loc.lat, loc.lng]}
            icon={icon}
            eventHandlers={{
              click: () => onMarkerClick && onMarkerClick(loc.name),
              mouseover: (e) => e.target.openPopup(),
              mouseout: (e) => e.target.closePopup(),
            }}
          >
            <Popup>
              <div>
                <h3>{loc.name}</h3>
                <p>
                  <strong>Size:</strong> {loc.size}
                </p>
                <p>
                  <strong>Max Depth:</strong> {loc.max_depth}
                </p>
                <p>
                  <strong>Average Depth:</strong> {loc.avg_depth}
                </p>
                <p>
                  <strong>Description:</strong> {loc.description}
                </p>
                <p>
                  <strong>Website:</strong>{" "}
                  {loc.url ? (
                    <a
                      href={/^https?:\/\//i.test(loc.url) ? loc.url : `https://${loc.url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {loc.url}
                    </a>
                  ) : (
                    <em>(add site URL)</em>
                  )}
                </p>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}

MapPanel.propTypes = {
  selectedSites: PropTypes.arrayOf(PropTypes.string).isRequired,
  onMarkerClick: PropTypes.func.isRequired,
};

export default MapPanel;
