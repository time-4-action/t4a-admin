// lib/mgmt.ts
import { ManagementClient } from "auth0";

let client: ManagementClient | null = null;

export function getMgmtClient(): ManagementClient {
  if (!client) {
    client = new ManagementClient({
      domain: process.env.AUTH0_ISSUER_BASE_URL!.replace("https://", ""),
      clientId: process.env.AUTH0_MGMT_CLIENT_ID!,
      clientSecret: process.env.AUTH0_MGMT_CLIENT_SECRET!,
    });
  }
  return client;
}
