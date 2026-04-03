import React from "react";
import { render } from "ink";
import type { ProjectOrchestrator } from "../orchestrator/project.js";
import { App } from "./components/App.js";

/** Start the project-based TUI */
export function startProjectTUI(orchestrator: ProjectOrchestrator): void {
  render(<App orchestrator={orchestrator} />);
}
