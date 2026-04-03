import React from "react";
import { Box, Text } from "ink";
import type { ProjectPhase } from "../../types/project.js";
import { PHASE_ORDER } from "../../types/project.js";

const PHASE_LABELS: Record<ProjectPhase, string> = {
  goal: "Goal",
  spec: "Spec",
  plan: "Plan",
  dev: "Dev",
  test: "Test",
  review: "Review",
  deploy: "Deploy",
};

interface PhaseStatusProps {
  phaseStates: { phase: ProjectPhase; status: string; output: string | null }[];
  currentPhase: ProjectPhase;
}

export function PhaseStatus({ phaseStates, currentPhase }: PhaseStatusProps) {
  const statusMap = new Map(phaseStates.map((s) => [s.phase, s.status]));

  return (
    <Box flexDirection="column">
      <Text bold underline>Phases</Text>
      <Box marginTop={1}>
        {PHASE_ORDER.map((phase, idx) => {
          const status = statusMap.get(phase) ?? "pending";
          const isCurrent = phase === currentPhase;
          const isDone = status === "done";
          const isFailed = status === "failed";
          const isWaiting = status === "waiting_input";

          let icon: string;
          let color: string;

          if (isDone) {
            icon = "✓";
            color = "green";
          } else if (isFailed) {
            icon = "✗";
            color = "red";
          } else if (isWaiting) {
            icon = "⏸";
            color = "yellow";
          } else if (isCurrent) {
            icon = "▶";
            color = "cyan";
          } else {
            icon = "○";
            color = "gray";
          }

          return (
            <React.Fragment key={phase}>
              {idx > 0 && <Text dimColor> → </Text>}
              <Text color={color} bold={isCurrent}>
                {icon} {PHASE_LABELS[phase]}
              </Text>
            </React.Fragment>
          );
        })}
      </Box>
    </Box>
  );
}
