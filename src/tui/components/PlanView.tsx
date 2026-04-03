import React from "react";
import { Box, Text } from "ink";
import type { PlanStep } from "../../types/plan.js";

const STEP_STATUS_ICONS: Record<string, string> = {
  pending: "○",
  in_progress: "▶",
  done: "✓",
  failed: "✗",
};

const STEP_STATUS_COLORS: Record<string, string> = {
  pending: "gray",
  in_progress: "cyan",
  done: "green",
  failed: "red",
};

interface PlanViewProps {
  steps: PlanStep[];
}

export function PlanView({ steps }: PlanViewProps) {
  if (steps.length === 0) {
    return (
      <Box flexDirection="column">
        <Text bold underline>Plan Steps</Text>
        <Text dimColor>No plan steps yet</Text>
      </Box>
    );
  }

  const done = steps.filter((s) => s.status === "done").length;
  const barWidth = 20;
  const filled = Math.round((done / steps.length) * barWidth);
  const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);

  return (
    <Box flexDirection="column">
      <Text bold underline>Plan Steps</Text>
      <Box marginTop={1}>
        <Text dimColor>[</Text>
        <Text color="green">{bar}</Text>
        <Text dimColor>] </Text>
        <Text>{done}/{steps.length}</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {steps.map((step) => (
          <Box key={step.id} marginLeft={1}>
            <Text color={STEP_STATUS_COLORS[step.status] ?? "white"}>
              {STEP_STATUS_ICONS[step.status] ?? "?"} {step.title}
            </Text>
            {step.status === "in_progress" && (
              <Text color="cyan"> ...</Text>
            )}
            {step.status === "failed" && step.error_message && (
              <Text color="red"> — {step.error_message.slice(0, 50)}</Text>
            )}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
