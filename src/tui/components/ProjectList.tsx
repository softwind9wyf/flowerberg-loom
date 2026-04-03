import React from "react";
import { Box, Text } from "ink";
import type { Project, ProjectStatus } from "../../types/project.js";

const STATUS_ICONS: Record<ProjectStatus, string> = {
  active: "●",
  paused: "⏸",
  completed: "✓",
  failed: "✗",
  abandoned: "⊘",
};

const STATUS_COLORS: Record<ProjectStatus, string> = {
  active: "green",
  paused: "yellow",
  completed: "green",
  failed: "red",
  abandoned: "gray",
};

interface ProjectListProps {
  projects: Project[];
  selectedIdx: number;
}

export function ProjectList({ projects, selectedIdx }: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <Box flexDirection="column">
        <Text dimColor>No projects yet. Use: fbloom init &lt;name&gt;</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text bold underline>Projects</Text>
      {projects.map((project, idx) => {
        const isSelected = idx === selectedIdx;
        return (
          <Box
            key={project.id}
            borderStyle={isSelected ? "double" : "round"}
            borderColor={isSelected ? "cyan" : "gray"}
            paddingX={1}
            marginTop={idx > 0 ? 1 : 0}
            flexDirection="column"
          >
            <Box>
              <Text
                color={STATUS_COLORS[project.status]}
                bold={isSelected}
              >
                {STATUS_ICONS[project.status]} {project.name}
              </Text>
              <Text dimColor> — {project.current_phase}</Text>
            </Box>
            {project.goal && (
              <Text dimColor>{project.goal.slice(0, 80)}{project.goal.length > 80 ? "..." : ""}</Text>
            )}
            <Text dimColor>{new Date(project.created_at).toLocaleDateString()}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
