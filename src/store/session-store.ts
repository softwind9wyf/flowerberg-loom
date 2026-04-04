import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { join, resolve } from "path";

// --- Types ---

export interface SessionMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface Session {
  id: string;
  topic: string;
  systemPrompt?: string;
  messages: SessionMessage[];
  summary?: string;       // compressed summary of older messages
  createdAt: string;
  updatedAt: string;
}

export interface SessionStoreOptions {
  /** Max chars before triggering compression (default: 20000) */
  maxChars?: number;
  /** Number of recent messages to keep after compression (default: 4) */
  keepRecent?: number;
}

// --- SessionStore ---

export class SessionStore {
  private dir: string;
  private maxChars: number;
  private keepRecent: number;
  private compressFn?: (messages: SessionMessage[]) => Promise<string>;

  /**
   * @param projectPath - root directory of the project (where .fbloom/ lives)
   * @param options - compression options
   * @param compressFn - async function that takes old messages and returns a summary string.
   *                      If not provided, compression is a no-op (messages just get truncated).
   */
  constructor(
    projectPath: string,
    options?: SessionStoreOptions,
    compressFn?: (messages: SessionMessage[]) => Promise<string>,
  ) {
    this.dir = join(projectPath, ".fbloom", "sessions");
    this.maxChars = options?.maxChars ?? 20000;
    this.keepRecent = options?.keepRecent ?? 4;
    this.compressFn = compressFn;

    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true });
    }
  }

  // --- CRUD ---

  /** Create a new session */
  create(id: string, topic: string, systemPrompt?: string): Session {
    const session: Session = {
      id,
      topic,
      systemPrompt,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.write(session);
    return session;
  }

  /** Get a session by ID */
  get(id: string): Session | undefined {
    const filePath = this.filePath(id);
    if (!existsSync(filePath)) return undefined;
    return this.read(filePath);
  }

  /** Get or create a session */
  getOrCreate(id: string, topic: string, systemPrompt?: string): Session {
    return this.get(id) ?? this.create(id, topic, systemPrompt);
  }

  /** List all sessions */
  list(): Session[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => this.read(join(this.dir, f)));
  }

  /** Delete a session */
  delete(id: string): void {
    const filePath = this.filePath(id);
    if (existsSync(filePath)) unlinkSync(filePath);
  }

  // --- Message operations ---

  /** Append a user message */
  addUserMessage(id: string, content: string): Session {
    const session = this.get(id);
    if (!session) throw new Error(`Session "${id}" not found`);
    session.messages.push({
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    });
    session.updatedAt = new Date().toISOString();
    this.write(session);
    return session;
  }

  /** Append an assistant message */
  addAssistantMessage(id: string, content: string): Session {
    const session = this.get(id);
    if (!session) throw new Error(`Session "${id}" not found`);
    session.messages.push({
      role: "assistant",
      content,
      timestamp: new Date().toISOString(),
    });
    session.updatedAt = new Date().toISOString();
    this.write(session);
    return session;
  }

  /** Get messages for API call (prepends summary if exists) */
  getMessages(id: string): Array<{ role: "user" | "assistant"; content: string }> {
    const session = this.get(id);
    if (!session) return [];

    const result: Array<{ role: "user" | "assistant"; content: string }> = [];

    // If there's a summary, inject it as a system-like user message at the start
    if (session.summary) {
      result.push({
        role: "user",
        content: `[Previous conversation summary]\n${session.summary}`,
      });
      result.push({
        role: "assistant",
        content: "Understood. I'll keep this context in mind. Let's continue.",
      });
    }

    for (const msg of session.messages) {
      result.push({ role: msg.role, content: msg.content });
    }

    return result;
  }

  /** Get total char count of all messages */
  getCharCount(id: string): number {
    const session = this.get(id);
    if (!session) return 0;
    let total = session.summary?.length ?? 0;
    for (const msg of session.messages) {
      total += msg.content.length;
    }
    return total;
  }

  /**
   * Compress session if it exceeds maxChars.
   * Keeps the N most recent messages, compresses older ones into summary.
   * If compressFn is provided, calls it to generate summary.
   * Otherwise, does simple text truncation of old messages.
   */
  async compressIfNeeded(id: string): Promise<boolean> {
    const session = this.get(id);
    if (!session) return false;

    const totalChars = this.getCharCount(id);
    if (totalChars <= this.maxChars) return false;

    const keepCount = Math.min(this.keepRecent, session.messages.length);
    const oldMessages = session.messages.slice(0, -keepCount);
    const recentMessages = session.messages.slice(-keepCount);

    if (oldMessages.length === 0) return false;

    let newSummary: string;

    if (this.compressFn) {
      // AI-powered compression
      newSummary = await this.compressFn(oldMessages);
    } else {
      // Simple compression: concatenate key points
      const lines = oldMessages.map(
        (m) => `[${m.role}]: ${m.content.slice(0, 500)}${m.content.length > 500 ? "..." : ""}`,
      );
      newSummary = (session.summary ? session.summary + "\n\n" : "") + lines.join("\n");
      // Cap summary at half of maxChars
      if (newSummary.length > this.maxChars / 2) {
        newSummary = newSummary.slice(0, this.maxChars / 2) + "\n...(earlier context truncated)";
      }
    }

    session.summary = newSummary;
    session.messages = recentMessages;
    session.updatedAt = new Date().toISOString();
    this.write(session);
    return true;
  }

  // --- Private ---

  private filePath(id: string): string {
    // Sanitize id for filesystem
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "_");
    return join(this.dir, `${safeId}.json`);
  }

  private read(filePath: string): Session {
    return JSON.parse(readFileSync(filePath, "utf-8")) as Session;
  }

  private write(session: Session): void {
    writeFileSync(this.filePath(session.id), JSON.stringify(session, null, 2), "utf-8");
  }
}
