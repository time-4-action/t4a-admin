// lib/agent-bridge-types.ts — the shape of one entry in lib/agent-bridge-routes.generated.ts.
export type BridgeMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type BridgeHandler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response> | Response;

export type BridgeRoute = {
  // The app path with Next.js segments, e.g. "/api/admin/preorder/campaigns/[id]".
  pattern: string;
  // The route module (its exported GET / POST / … handlers).
  mod: Partial<Record<BridgeMethod, BridgeHandler>>;
  // The file's leading comment, if any.
  header: string;
  // The handlers it exports, each with the comment above it.
  methods: Partial<Record<BridgeMethod, string>>;
};
