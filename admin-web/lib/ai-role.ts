export const AI_ROLE_NAME = process.env.NEXT_PUBLIC_AI_ROLE_NAME ?? "AI User";
export const isAiRole = (name: string) =>
  name.toLowerCase() === AI_ROLE_NAME.toLowerCase();

export const DEV_ROLE_NAME = process.env.NEXT_PUBLIC_DEV_ROLE_NAME ?? "dev";
export const isDevRole = (name: string) =>
  name.toLowerCase() === DEV_ROLE_NAME.toLowerCase();
