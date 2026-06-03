"use client";
import { Bot } from "lucide-react";
import { AccessManager } from "@/components/access-manager";
import { AI_ROLE_NAME } from "@/lib/ai-role";

export default function AiAccessPage() {
  return (
    <AccessManager
      roleName={AI_ROLE_NAME}
      title="AI Access"
      icon={Bot}
      accent="indigo"
      envVarName="NEXT_PUBLIC_AI_ROLE_NAME"
      lead={
        <>
          People with the{" "}
          <strong className="text-foreground">{AI_ROLE_NAME}</strong> role can
          use the AI product. Granting access enables billable usage.
        </>
      }
      grant={{
        heading: "Grant AI access",
        roleSubtitle: "AI access · billable usage",
        ack: "I understand this grants AI access and may incur costs.",
      }}
    />
  );
}
