import { readFileSync, writeFileSync } from "fs";

export interface ParsedFile {
  metadata: Record<string, unknown>;
  content: string;
}

const DELIMITER = "---";

export function parseFrontmatter(text: string): ParsedFile {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith(DELIMITER)) {
    return { metadata: {}, content: trimmed };
  }

  const firstDelimEnd = trimmed.indexOf("\n", DELIMITER.length);
  if (firstDelimEnd === -1) {
    return { metadata: {}, content: trimmed };
  }

  const rest = trimmed.slice(firstDelimEnd + 1);
  const secondDelimStart = rest.indexOf(DELIMITER);
  if (secondDelimStart === -1) {
    return { metadata: {}, content: trimmed };
  }

  const frontmatterText = rest.slice(0, secondDelimStart).trim();
  const body = rest.slice(secondDelimStart + DELIMITER.length).trimStart();

  const metadata: Record<string, unknown> = {};
  for (const line of frontmatterText.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const rawValue = line.slice(colonIdx + 1).trim();
    // Simple value parsing
    if (rawValue === "true") metadata[key] = true;
    else if (rawValue === "false") metadata[key] = false;
    else if (rawValue === "null") metadata[key] = null;
    else if (/^-?\d+$/.test(rawValue)) metadata[key] = parseInt(rawValue, 10);
    else if (/^-?\d+\.\d+$/.test(rawValue)) metadata[key] = parseFloat(rawValue);
    else metadata[key] = rawValue;
  }

  return { metadata, content: body };
}

export function serializeFrontmatter(metadata: Record<string, unknown>, content: string): string {
  const entries = Object.entries(metadata);
  if (entries.length === 0) return content;

  const lines = entries.map(([k, v]) => {
    if (v === null) return `${k}: null`;
    if (typeof v === "boolean") return `${k}: ${v}`;
    return `${k}: ${v}`;
  });

  return `${DELIMITER}\n${lines.join("\n")}\n${DELIMITER}\n${content}`;
}

export function readParsedFile(filePath: string): ParsedFile {
  const text = readFileSync(filePath, "utf-8");
  return parseFrontmatter(text);
}

export function writeParsedFile(filePath: string, metadata: Record<string, unknown>, content: string): void {
  const text = serializeFrontmatter(metadata, content);
  writeFileSync(filePath, text, "utf-8");
}
