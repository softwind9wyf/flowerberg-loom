import React from "react";
import { Box, Text } from "ink";
import type { Project, ProjectPhase } from "../../types/project.js";
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

interface StatusBarProps {
  project: Project | null;
  chatMode?: "normal" | "goal" | "spec";
}

export function StatusBar({ project, chatMode = "normal" }: StatusBarProps) {
  if (!project) {
    return (
      <Box borderStyle="round" borderColor="gray" paddingX={1}>
        <Text bold color="cyan">flowerberg-loom</Text>
        <Text dimColor> — no project selected. Type /init &lt;name&gt;</Text>
      </Box>
    );
  }

  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">fbloom</Text>
      <Text> │ </Text>
      {chatMode !== "normal" && (
        <>
          <Text bold color="magenta">[{chatMode === "goal" ? "goal chat" : chatMode === "spec" ? "spec chat" : chatMode}]</Text>
          <Text> │ </Text>
        </>
      )}
      <Text bold>{project.name}</Text>
      <Text> │ </Text>
      {PHASE_ORDER.map((phase, idx) => {
        const isCurrent = phase === project.current_phase;
        const label = PHASE_LABELS[phase];
        if (isCurrent) {
          return (
            <React.Fragment key={phase}>
              {idx > 0 && <Text dimColor>→</Text>}
              <Text bold color="yellow">▶ {label}</Text>
            </React.Fragment>
          );
        }
        return (
          <React.Fragment key={phase}>
            {idx > 0 && <Text dimColor>→</Text>}
            <Text dimColor>{label}</Text>
          </React.Fragment>
        );
      })}
    </Box>
  );
}
