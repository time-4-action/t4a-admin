import { Suspense } from "react";
import { AgentsClient } from "./agents-client";

// Customers → Agents: portal agents and the clients they may see / order for.
export default function CustomerAgentsPage() {
  return (
    <Suspense>
      <AgentsClient />
    </Suspense>
  );
}
