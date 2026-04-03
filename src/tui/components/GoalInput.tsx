import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";

interface GoalInputProps {
  onSubmit: (goal: string) => void;
}

export function GoalInput({ onSubmit }: GoalInputProps) {
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useInput(useCallback((ch, key) => {
    if (submitted) return;
    if (key.return) {
      if (input.trim()) {
        setSubmitted(true);
        onSubmit(input.trim());
      }
    } else if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
    } else if (!key.ctrl && !key.meta) {
      setInput((prev) => prev + ch);
    }
  }, [input, submitted, onSubmit]));

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">Describe your project goal:</Text>
      <Box marginTop={1} borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text>
          {input}
          {!submitted && <Text color="cyan">▎</Text>}
        </Text>
      </Box>
      {submitted ? (
        <Box marginTop={1}><Text color="green">Goal submitted!</Text></Box>
      ) : (
        <Box marginTop={1}><Text dimColor>Press Enter to submit</Text></Box>
      )}
    </Box>
  );
}
