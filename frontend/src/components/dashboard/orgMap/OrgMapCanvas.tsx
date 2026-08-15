"use client";

import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "@maplibre/maplibre-gl-leaflet";
import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { MapContainer, CircleMarker, Marker, Popup, Tooltip, useMap } from "react-leaflet";
import type { OrgMapCountry, OrgMapDepartment, OrgMapBranch } from "@/lib/orgMapApi";
import styles from "./orgMap.module.css";

// CARTO's vector basemap style — unlike the raster tile CDN (which bakes labels
// in whatever language OSM tags as the primary "name" per place), this style's
// place/country/city label layers explicitly render "name_en", so country and
// city names show in English worldwide regardless of local script.
const BASEMAP_STYLE_URL = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

// Predefined, static choropleth palette — reuses the app's existing chart colors
// (see --chart-* in globals.css). Assigned by position, never randomized.
const COUNTRY_COLORS = [
  "#EF4444", "#F97316", "#F59E0B", "#EAB308",
  "#84CC16", "#22C55E", "#10B981", "#059669",
];
const UNMAPPED_COUNTRY_COLOR = "#64748B";

const WORLD_CENTER: [number, number] = [20, 0];
const WORLD_ZOOM = 2;

const branchIcon = L.divIcon({
  className: "",
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#2563EB;border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.45);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  popupAnchor: [0, -8],
});

const approxBranchIcon = L.divIcon({
  className: "",
  html: `<div style="width:16px;height:16px;border-radius:50%;background:#F59E0B;border:2px dashed #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.45);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  popupAnchor: [0, -8],
});

function countryCentroid(country: OrgMapCountry): [number, number] | null {
  if (country.branches.length === 0) return null;
  const geocoded = country.branches.filter((b) => b.geocoded);
  const pool = geocoded.length > 0 ? geocoded : country.branches;
  const lat = pool.reduce((sum, b) => sum + b.lat, 0) / pool.length;
  const lng = pool.reduce((sum, b) => sum + b.lng, 0) / pool.length;
  return [lat, lng];
}

function FitBounds({ branches }: { branches: OrgMapBranch[] | null }) {
  const map = useMap();

  useEffect(() => {
    if (!branches || branches.length === 0) {
      map.setView(WORLD_CENTER, WORLD_ZOOM);
      return;
    }
    if (branches.length === 1) {
      map.setView([branches[0].lat, branches[0].lng], 11);
      return;
    }
    const bounds = L.latLngBounds(branches.map((b) => [b.lat, b.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  }, [branches, map]);

  return null;
}

function MapLibreBaseLayer() {
  const map = useMap();

  useEffect(() => {
    const layer = L.maplibreGL({
      style: BASEMAP_STYLE_URL,
      attributionControl: false,
    }).addTo(map);
    map.attributionControl.addAttribution(BASEMAP_ATTRIBUTION);

    return () => {
      map.removeLayer(layer);
      map.attributionControl.removeAttribution(BASEMAP_ATTRIBUTION);
    };
  }, [map]);

  return null;
}

function DepartmentAccordion({
  departments,
  expandedDeptId,
  onToggle,
}: {
  departments: OrgMapDepartment[];
  expandedDeptId: string | null;
  onToggle: (deptId: string) => void;
}) {
  if (departments.length === 0) {
    return (
      <div>
        <p className={styles.sectionLabel}>Departments</p>
        <p className={styles.noDeptText}>No departments recorded</p>
      </div>
    );
  }

  return (
    <div>
      <p className={styles.sectionLabel}>Departments</p>
      <div className={styles.deptList}>
        {departments.map((dept) => {
          const open = expandedDeptId === dept.dept_id;
          return (
            <div key={dept.dept_id} className={styles.deptRow}>
              <button
                type="button"
                className={styles.deptRowHead}
                onClick={() => onToggle(dept.dept_id)}
              >
                <span>{dept.name}</span>
                <svg
                  className={`${styles.deptChevron} ${open ? styles.deptChevronOpen : ""}`}
                  width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
              {open && (
                <div className={styles.subDeptList}>
                  <p className={styles.subSectionLabel}>Sub-departments</p>
                  {dept.sub_departments.length === 0 ? (
                    <span className={styles.noDeptText}>No sub-departments recorded</span>
                  ) : (
                    dept.sub_departments.map((sd) => (
                      <span key={sd.sub_dept_id} className={styles.subDeptItem}>{sd.name}</span>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BranchPopupContent({ branch }: { branch: OrgMapBranch }) {
  const [expandedDeptId, setExpandedDeptId] = useState<string | null>(null);

  return (
    <div>
      <p className={styles.popupBranchName}>{branch.name}</p>
      {!branch.geocoded && (
        <span className={styles.approxBadge}>~ Approximate location</span>
      )}
      <DepartmentAccordion
        departments={branch.departments}
        expandedDeptId={expandedDeptId}
        onToggle={(deptId) => setExpandedDeptId((prev) => (prev === deptId ? null : deptId))}
      />
    </div>
  );
}

interface OrgMapCanvasProps {
  countries: OrgMapCountry[];
  mode: "world" | "country";
}

export default function OrgMapCanvas({ countries, mode }: OrgMapCanvasProps) {
  const [selectedCountryId, setSelectedCountryId] = useState<string | null>(
    mode === "country" ? countries[0]?.country_id ?? null : null
  );
  const [hoveredCountryId, setHoveredCountryId] = useState<string | null>(null);

  const countriesWithBranches = useMemo(
    () => countries.filter((c) => c.branches.length > 0),
    [countries]
  );

  const activeCountry = useMemo(
    () => countries.find((c) => c.country_id === selectedCountryId) ?? null,
    [countries, selectedCountryId]
  );

  const fitBranches = activeCountry ? activeCountry.branches : null;

  return (
    <div className={styles.mapCanvasWrap}>
      {mode === "world" && selectedCountryId && (
        <button
          type="button"
          className={styles.worldViewBtn}
          onClick={() => setSelectedCountryId(null)}
        >
          ◀ World view
        </button>
      )}
      <MapContainer
        center={WORLD_CENTER}
        zoom={WORLD_ZOOM}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <MapLibreBaseLayer />

        <FitBounds branches={fitBranches} />

        {mode === "world" &&
          countriesWithBranches.map((country) => {
            const centroid = countryCentroid(country);
            if (!centroid) return null;
            const colorIndex = countriesWithBranches.indexOf(country);
            const fillColor = COUNTRY_COLORS[colorIndex % COUNTRY_COLORS.length] ?? UNMAPPED_COUNTRY_COLOR;
            const isActive = country.country_id === selectedCountryId;
            const isHovered = country.country_id === hoveredCountryId;

            return (
              <CircleMarker
                key={country.country_id}
                center={centroid}
                radius={isActive || isHovered ? 14 : 10}
                pathOptions={{
                  color: isActive ? "#101828" : "#ffffff",
                  weight: isActive ? 3 : 1.5,
                  fillColor,
                  fillOpacity: isHovered ? 0.95 : 0.75,
                }}
                eventHandlers={{
                  mouseover: () => setHoveredCountryId(country.country_id),
                  mouseout: () => setHoveredCountryId(null),
                  click: () => setSelectedCountryId(country.country_id),
                }}
              >
                <Tooltip direction="top" offset={[0, -8]}>
                  {country.country_name} · {country.branches.length} branch{country.branches.length === 1 ? "" : "es"}
                </Tooltip>
              </CircleMarker>
            );
          })}

        {activeCountry &&
          activeCountry.branches.map((branch) => (
            <Marker
              key={branch.branch_id}
              position={[branch.lat, branch.lng]}
              icon={branch.geocoded ? branchIcon : approxBranchIcon}
            >
              <Popup minWidth={220} maxWidth={260} maxHeight={280}>
                <BranchPopupContent branch={branch} />
              </Popup>
            </Marker>
          ))}
      </MapContainer>
    </div>
  );
}
