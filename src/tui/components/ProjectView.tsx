import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import type { Project, ProjectPhase } from "../../types/project.js";
import type { ProjectEvent } from "../../types/events.js";
import { FileStore } from "../../store/file-store.js";
import { PhaseStatus } from "./PhaseStatus.js";
import { GoalInput } from "./GoalInput.js";
import { SpecEditor } from "./SpecEditor.js";
import { PlanView } from "./PlanView.js";
import { LiveOutput } from "./LiveOutput.js";
import { HumanPrompt } from "./HumanPrompt.js";

interface ProjectViewProps {
  project: Project;
  fileStore: FileStore;
  onProvideInput: (fileStore: FileStore, input: string) => void;
  onSetGoal: (fileStore: FileStore, goal: string) => void;
  onApproveSpec: (fileStore: FileStore) => void;
  onRequestSpecChanges: (fileStore: FileStore, feedback: string) => void;
  onEvent?: (handler: (event: ProjectEvent) => void) => () => void;
  onBack: () => void;
}

export function ProjectView({
  project,
  fileStore,
  onProvideInput,
  onSetGoal,
  onApproveSpec,
  onRequestSpecChanges,
  onEvent,
  onBack,
}: ProjectViewProps) {
  const [phaseStates, setPhaseStates] = useState(
    fileStore.getAllPhaseStates(),
  );
  const [planSections, setPlanSections] = useState(
    fileStore.readPlan(),
  );
  const [specContent, setSpecContent] = useState<string | null>(null);
  const [outputChunks, setOutputChunks] = useState<string[]>([]);

  // Refresh state periodically
  useEffect(() => {
    const refresh = () => {
      const state = fileStore.readState();
      if (!state) return;
      setPhaseStates(fileStore.getAllPhaseStates());
      setPlanSections(fileStore.readPlan());

      const spec = fileStore.getFullSpec();
      if (spec) setSpecContent(spec);
    };

    refresh();
    const interval = setInterval(refresh, 1000);
    return () => clearInterval(interval);
  }, [fileStore]);

  // Listen to orchestrator events for streaming output
  useEffect(() => {
    if (!onEvent) return;
    const unsub = onEvent((event: ProjectEvent) => {
      if (event.type === "agent_output") {
        setOutputChunks((prev) => [...prev, event.chunk]);
      }
    });
    return unsub;
  }, [onEvent]);

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

  // Flatten plan sections for PlanView compatibility
  const planSteps = planSections.flatMap((s) =>
    s.items.map((item) => ({
      id: item.id,
      project_id: "",
      phase: s.phase.toLowerCase() as ProjectPhase,
      sequence: 0,
      title: item.title,
      description: item.description,
      status: item.checked ? "done" as const : "pending" as const,
      depends_on: [],
      assigned_agent: null,
      result: null,
      error_message: null,
      started_at: null,
      completed_at: null,
    }))
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
            onSubmit={(goal) => onSetGoal(fileStore, goal)}
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
            onApprove={() => onApproveSpec(fileStore)}
            onRequestChanges={(fb) => onRequestSpecChanges(fileStore, fb)}
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
            onSubmit={(input) => onProvideInput(fileStore, input)}
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
