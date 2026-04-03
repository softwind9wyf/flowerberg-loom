import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
import type { Project } from "../../types/project.js";
import type { ProjectEvent } from "../../types/events.js";
import type { ProjectOrchestrator } from "../../orchestrator/project.js";
import { ProjectList } from "./ProjectList.js";
import { ProjectView } from "./ProjectView.js";

interface AppProps {
  orchestrator: ProjectOrchestrator;
}

export function App({ orchestrator }: AppProps) {
  const { exit } = useApp();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [view, setView] = useState<"list" | "detail">("list");
  const [refreshKey, setRefreshKey] = useState(0);

  // Refresh project list
  useEffect(() => {
    const refresh = () => {
      setProjects(orchestrator.listProjects());
    };
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [orchestrator, refreshKey]);

  // Listen for orchestrator events
  useEffect(() => {
    const handler = () => {
      setRefreshKey((k) => k + 1);
    };
    orchestrator.on("event", handler);
    return () => { orchestrator.off("event", handler); };
  }, [orchestrator]);

  useInput(useCallback((input, key) => {
    if (view === "detail") return; // handled by ProjectView

    switch (input) {
      case "q":
        exit();
        break;
      case "j":
      case "down":
        setSelectedIdx((i) => Math.min(i + 1, projects.length - 1));
        break;
      case "k":
      case "up":
        setSelectedIdx((i) => Math.max(i - 1, 0));
        break;
      case "d":
      case "Enter":
        if (projects[selectedIdx]) setView("detail");
        break;
    }
  }, [view, projects.length, selectedIdx, exit]));

  const handleBack = useCallback(() => {
    setView("list");
    setRefreshKey((k) => k + 1);
  }, []);

  if (view === "detail" && projects[selectedIdx]) {
    const project = projects[selectedIdx];
    return (
      <ProjectView
        key={project.id}
        project={project}
        store={orchestrator.getStore()}
        onProvideInput={(id, input) => {
          orchestrator.provideInput(id, input);
          setRefreshKey((k) => k + 1);
        }}
        onSetGoal={(id, goal) => {
          orchestrator.setGoal(id, goal);
          setRefreshKey((k) => k + 1);
        }}
        onApproveSpec={(id) => {
          const store = orchestrator.getStore();
          const spec = store.getLatestSpec(id);
          if (spec) store.updateSpecStatus(spec.id, "approved");
          orchestrator.provideInput(id, "approved");
          setRefreshKey((k) => k + 1);
        }}
        onRequestSpecChanges={(id, feedback) => {
          orchestrator.provideInput(id, feedback);
          setRefreshKey((k) => k + 1);
        }}
        onEvent={(handler) => {
          orchestrator.on("event", handler);
          return () => { orchestrator.off("event", handler); };
        }}
        onBack={handleBack}
      />
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">flowerberg-loom</Text>
        <Text dimColor> — project dev loom</Text>
      </Box>

      <ProjectList projects={projects} selectedIdx={selectedIdx} />

      <Box marginTop={1}>
        <Text dimColor>j/k: navigate | d: detail | q: quit</Text>
      </Box>
    </Box>
  );
}
