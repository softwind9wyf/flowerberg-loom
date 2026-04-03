import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import type { Project, ProjectPhase } from "../../types/project.js";
import type { PlanStep } from "../../types/plan.js";
import type { ProjectEvent } from "../../types/events.js";
import type { Store } from "../../store/index.js";
import { PhaseStatus } from "./PhaseStatus.js";
import { GoalInput } from "./GoalInput.js";
import { SpecEditor } from "./SpecEditor.js";
import { PlanView } from "./PlanView.js";
import { LiveOutput } from "./LiveOutput.js";
import { HumanPrompt } from "./HumanPrompt.js";

interface ProjectViewProps {
  project: Project;
  store: Store;
  onProvideInput: (projectId: string, input: string) => void;
  onSetGoal: (projectId: string, goal: string) => void;
  onApproveSpec: (projectId: string) => void;
  onRequestSpecChanges: (projectId: string, feedback: string) => void;
  onEvent?: (handler: (event: ProjectEvent) => void) => () => void;
  onBack: () => void;
}

export function ProjectView({
  project,
  store,
  onProvideInput,
  onSetGoal,
  onApproveSpec,
  onRequestSpecChanges,
  onEvent,
  onBack,
}: ProjectViewProps) {
  const [phaseStates, setPhaseStates] = useState(
    store.getAllPhaseStates(project.id),
  );
  const [planSteps, setPlanSteps] = useState<PlanStep[]>(
    store.getPlanSteps(project.id),
  );
  const [specContent, setSpecContent] = useState<string | null>(null);
  const [outputChunks, setOutputChunks] = useState<string[]>([]);

  // Refresh state periodically
  useEffect(() => {
    const refresh = () => {
      const updated = store.getProject(project.id);
      if (!updated) return;
      setPhaseStates(store.getAllPhaseStates(project.id));
      setPlanSteps(store.getPlanSteps(project.id));

      const spec = store.getLatestSpec(project.id);
      if (spec) setSpecContent(spec.content);
    };

    refresh();
    const interval = setInterval(refresh, 1000);
    return () => clearInterval(interval);
  }, [project.id, store]);

  // Listen to orchestrator events for streaming output
  useEffect(() => {
    if (!onEvent) return;
    const unsub = onEvent((event: ProjectEvent) => {
      if (event.type === "agent_output" && event.projectId === project.id) {
        setOutputChunks((prev) => [...prev, event.chunk]);
      }
    });
    return unsub;
  }, [project.id, onEvent]);

  useInput(useCallback((ch, key) => {
    if (key.escape || ch === "q") {
      onBack();
    }
  }, [onBack]));

  const currentPhase = project.current_phase;
  const phaseView = phaseStates.map((s) => ({
    phase: s.phase as ProjectPhase,
    status: s.status,
    output: s.output_data,
  }));

  const needsInput = phaseStates.find(
    (s) => s.phase === currentPhase && s.status === "waiting_input",
  );

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">{project.name}</Text>
        <Text dimColor> — {project.status} | {currentPhase}</Text>
      </Box>

      <PhaseStatus phaseStates={phaseView} currentPhase={currentPhase} />

      <Box marginTop={1}>
        {currentPhase === "goal" && !project.goal && (
          <GoalInput
            onSubmit={(goal) => onSetGoal(project.id, goal)}
          />
        )}
        {currentPhase === "goal" && project.goal && !needsInput && (
          <Box flexDirection="column">
            <Text bold>Goal:</Text>
            <Text>{project.goal}</Text>
          </Box>
        )}
        {currentPhase === "spec" && specContent && needsInput && (
          <SpecEditor
            specContent={specContent}
            onApprove={() => onApproveSpec(project.id)}
            onRequestChanges={(fb) => onRequestSpecChanges(project.id, fb)}
          />
        )}
        {(currentPhase === "dev" || currentPhase === "test" || currentPhase === "review") && (
          <PlanView steps={planSteps} />
        )}
        {currentPhase === "deploy" && needsInput && (
          <HumanPrompt
            prompt={(() => {
              try {
                return JSON.parse(needsInput.output_data ?? "{}").prompt ?? "Input required";
              } catch { return "Input required"; }
            })()}
            onSubmit={(input) => onProvideInput(project.id, input)}
          />
        )}
        {(currentPhase === "dev" || currentPhase === "test" || currentPhase === "review") && (
          <Box marginTop={1}>
            <LiveOutput chunks={outputChunks} />
          </Box>
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Esc/q: back</Text>
      </Box>
    </Box>
  );
}
