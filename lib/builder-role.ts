// Builder module configuration.
//
// The Builder section is a self-contained, client-side tool that generates
// copyable HTML snippets for the marketing website's "sections" (radar charts,
// range bars). It calls no backend — the reference implementation lives in the
// t4a-main-website-sections repo; this is a polished admin-portal port.

// The Auth0 role that grants access to the Builder section. Mirrors the
// "builder-admin" entry in lib/access.ts SECTION_ROLES.builder. It is
// privileged, so only a super-admin may grant/revoke it.
export const BUILDER_ADMIN_ROLE_NAME =
  process.env.NEXT_PUBLIC_BUILDER_ADMIN_ROLE_NAME || "builder-admin";

// The URL written into the <script src="…"> line of every generated snippet.
// This is the canonical, hosted copy of the shared renderer on the live site.
// (The admin bundles its own copy at /patrik-components.js purely to power the
// live preview + the download button.) Hardcoded on purpose — not configurable.
export const BUILDER_SCRIPT_URL =
  "https://www.patrikinternational.com/assets/added_js_files/patrik-components.js";
