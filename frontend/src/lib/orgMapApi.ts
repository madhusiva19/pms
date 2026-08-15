// Fetches the org tree (countries → branches → departments → sub-departments)
// used by OrgMapFooter to render the HQ/Country Admin dashboard map.
import { apiFetch } from "@/lib/apiFetch";

export type OrgMapSubDepartment = {
  sub_dept_id: string;
  name: string;
};

export type OrgMapDepartment = {
  dept_id: string;
  name: string;
  sub_departments: OrgMapSubDepartment[];
};

export type OrgMapBranch = {
  branch_id: string;
  name: string;
  lat: number;
  lng: number;
  geocoded: boolean;
  departments: OrgMapDepartment[];
};

export type OrgMapCountry = {
  country_id: string;
  country_name: string;
  branches: OrgMapBranch[];
};

export type OrgMapTree = {
  countries: OrgMapCountry[];
};

export async function fetchOrgMapTree(countryId?: string): Promise<OrgMapTree> {
  const query = countryId ? `?country_id=${encodeURIComponent(countryId)}` : "";
  const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/org/map-tree${query}`);
  if (!res.ok) {
    throw new Error("Failed to load organization map data");
  }
  return res.json();
}
