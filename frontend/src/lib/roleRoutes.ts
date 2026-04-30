// lib/roleRoutes.ts

export interface RoleRoutes {
  dashboard:      string;
  createTemplate: string | null; // null = role cannot create/edit templates
  viewTemplate:   string;        // all roles can view — each role has its own route
}

export const ROLE_ROUTES: Record<number, RoleRoutes> = {
  1: {
    dashboard:      "/hq-admin/template-management",
    createTemplate: "/hq-admin/create-template",    // HQ Admin — full create/edit/view
    viewTemplate:   "/hq-admin/create-template",    // view uses same page with ?mode=view
  },
  2: {
    dashboard:      "/country-admin/template-management",
    createTemplate: null,                            // cannot create or edit
    viewTemplate:   "/country-admin/view-template",
  },
  3: {
    dashboard:      "/branch-admin/template-management",
    createTemplate: null,
    viewTemplate:   "/branch-admin/view-template",
  },
  4: {
    dashboard:      "/dept-admin/template-management",
    createTemplate: null,
    viewTemplate:   "/dept-admin/view-template",
  },
  5: {
    dashboard:      "/sub-dept-admin/template-management",
    createTemplate: null,
    viewTemplate:   "/sub-dept-admin/view-template",
  },
};

export function getRoleRoutes(level: number): RoleRoutes {
  return ROLE_ROUTES[level] ?? ROLE_ROUTES[1];
}