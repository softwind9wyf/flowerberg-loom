import React from "react";
import { render } from "ink";
import type { ProjectOrchestrator } from "../orchestrator/project.js";
import type { FileStore } from "../store/file-store.js";
import type { AppConfig } from "../types/config.js";
import type { AgentInterface } from "../types/agent.js";
import type { Project } from "../types/project.js";
import { App } from "./components/App.js";
import { ChatApp } from "./components/ChatApp.js";

/** Start the legacy project-based TUI dashboard */
export function startProjectTUI(orchestrator: ProjectOrchestrator): void {
  render(<App orchestrator={orchestrator} />);
}

/** Start the new chat-based TUI */
export function startChatTUI(
  fileStore: FileStore,
  config: AppConfig,
  agent: AgentInterface | null,
  initialProject?: Project,
): void {
  render(<ChatApp fileStore={fileStore} config={config} agent={agent} initialProject={initialProject} />);
}
