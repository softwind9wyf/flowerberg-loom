export type SpecStatus = "draft" | "review" | "approved" | "rejected";

/** Spec metadata — content lives in spec/*.md files, versioning via git */
export interface SpecInfo {
  status: SpecStatus;
  ai_generated: boolean;
  updated_at: string;
}
