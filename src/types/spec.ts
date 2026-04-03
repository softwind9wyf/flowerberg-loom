export type SpecStatus = "draft" | "review" | "approved" | "rejected";

export interface SpecDocument {
  id: string;
  project_id: string;
  version: number;
  content: string;
  status: SpecStatus;
  ai_generated: boolean;
  created_at: string;
  updated_at: string;
  parent_version_id: string | null;
}
