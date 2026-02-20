const growthRecommendations: Record<string, string> = {
  specs:
    "Write a structured spec for your next feature before touching code. Include acceptance criteria that AI can use to generate tests.",
  context:
    "Set up persistent context for your AI tools — project rules files, architecture docs, or memory features. Stop starting from zero every session.",
  agents:
    "Try delegating a multi-step task to AI agents instead of doing each step yourself. Start with a well-defined task like writing tests for existing code.",
  feedback:
    "Start tracking one metric about AI effectiveness — acceptance rate, rework frequency, or time saved. You can't improve what you don't measure.",
  governance:
    "Add one automated quality check to your AI workflow — a linter rule, a test coverage gate, or a security scan that runs on all code.",
  delivery:
    "Connect your specs to your CI/CD pipeline. Start by making specs machine-readable so automation can consume them.",
  organization:
    "Share one AI workflow with your team this week. Start a channel or doc where people post AI tips — making sharing normal is the first step.",
};

export function getGrowthRecommendation(capabilityId: string): string {
  return (
    growthRecommendations[capabilityId] ??
    "Explore how AI can enhance this area of your workflow."
  );
}
