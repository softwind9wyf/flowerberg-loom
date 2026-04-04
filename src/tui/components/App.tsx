import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
import type { Project } from "../../types/project.js";
import type { ProjectOrchestrator } from "../../orchestrator/project.js";
import { FileStore } from "../../store/file-store.js";

interface AppProps {
  orchestrator: ProjectOrchestrator;
}

export function App({ orchestrator }: AppProps) {
  const { exit } = useApp();
  const [refreshKey, setRefreshKey] = useState(0);

  // Listen for orchestrator events
  useEffect(() => {
    const handler = () => {
      setRefreshKey((k) => k + 1);
    };
    orchestrator.on("event", handler);
    return () => { orchestrator.off("event", handler); };
  }, [orchestrator]);

  useInput(useCallback((input) => {
    if (input === "q") {
      exit();
    }
  }, [exit]));

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
        <Text bold color="cyan">flowerberg-loom</Text>
        <Text dimColor> — project dev loom (use Chat TUI: just run `fbloom`)</Text>
      </Box>

      <Box>
        <Text dimColor>Legacy dashboard mode. Use `fbloom` without arguments for the chat-based TUI.</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>q: quit</Text>
      </Box>
    </Box>
  );
}
