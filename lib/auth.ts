// lib/auth.ts
import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { agentActorSession } from "@/lib/agent-actor";

export const auth0 = new Auth0Client({
  session: {
    rolling: true,
  },
});

// During a T4A agent bridge call (lib/agent-bridge.ts) every getSession() answers as
// the staff member who asked the agent (lib/agent-actor.ts); otherwise the browser
// session as always. Outside a bridge call this is exactly the original method.
const browserSession = auth0.getSession.bind(auth0);
(auth0 as unknown as { getSession: (...args: unknown[]) => Promise<unknown> }).getSession = (...args: unknown[]) => {
  const agent = agentActorSession();
  return agent ? Promise.resolve(agent) : (browserSession as (...a: unknown[]) => Promise<unknown>)(...args);
};
