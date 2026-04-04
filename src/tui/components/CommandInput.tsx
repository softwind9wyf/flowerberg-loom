import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

interface CommandInputProps {
  onSubmit: (text: string) => void;
  placeholder?: string;
}

export function CommandInput({ onSubmit, placeholder = "Type a message or /command..." }: CommandInputProps) {
  const [input, setInput] = useState("");

  useInput((ch, key) => {
    if (key.escape) {
      setInput("");
      return;
    }
    if (key.return) {
      if (input.trim()) {
        onSubmit(input.trim());
        setInput("");
      }
      return;
    }
    if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      return;
    }
    if (ch && !key.ctrl && !key.meta) {
      setInput((prev) => prev + ch);
    }
  });

  return (
    <Box borderStyle="round" borderColor="gray" paddingX={1}>
      <Text color="cyan">{"❯"}</Text>
      <Text> </Text>
      {input.length > 0 ? (
        <Text>{input}</Text>
      ) : (
        <Text dimColor>{placeholder}</Text>
      )}
      <Text color="cyan">▎</Text>
    </Box>
  );
}
