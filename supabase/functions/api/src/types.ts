export type User = { id: string; email: string; name: string };

export type Prefs = {
  style: "characters" | "plain";
  shows?: string;
  visuals?: boolean;
  bookScenes?: boolean;
};

export type Profile = {
  is_cv: boolean;
  not_cv_reason: string;
  first_name: string;
  headline: string;
  location_country: string;
  years_experience: number;
  current_role: string;
  fields: string[];
  skills: { name: string; level: "basic" | "working" | "strong" }[];
  education: string;
  languages: string[];
  achievements: string[];
  strengths: string[];
  summary: string;
};

export type JobPrefs = {
  hoursPerWeek: number;
  horizonMonths: 3 | 6;
  location: string;
  workMode: "remote" | "on-site" | "either";
  note?: string;
};

export type RoleRec = {
  title: string;
  one_liner: string;
  why_rising: string;
  signals: string[];
  evidence: { title: string; url: string }[];
  fit_score: number;
  fit_reasons: string[];
  have: string[];
  gaps: string[];
  weeks_to_ready: number;
  pay_note: string;
  confidence: "high" | "medium" | "low";
  first_step: string;
};

export type Recommendations = {
  roles: RoleRec[];
  watchlist: { title: string; note: string }[];
  caveat: string;
};

/** The job-preparation wizard's working state, before a role is chosen. */
export type JobDraft = {
  profile?: Profile;
  prefs?: JobPrefs;
  scans?: Record<string, { text: string; sources: { url: string; title: string }[] }>;
  recs?: Recommendations;
  updatedAt: string;
};

export type Roadmap = {
  outcome: string;
  capstone: string;
  weeks?: number;
  milestones: { n: number; title: string; hours?: number; done_means?: string[]; boss?: boolean }[];
};

export type CotsiState = {
  phase?: "questions" | "teaching" | "unlock" | "wrapup" | "done";
  map?: { topic?: string; goal?: string; trunk?: { title: string; unlocks?: string }[]; anchor?: string };
  progress?: { current?: number; done?: number[]; weak?: string[]; unchecked?: string[] };
  cards?: { q: string; a: string }[];
  roadmap?: Roadmap;
  nextReviewAt?: string;
  reviewStepDays?: number;
};

export type Track = {
  id: string;
  kind: "topic" | "book" | "job";
  title: string;
  depth?: "quick" | "standard" | "deep";
  createdAt: string;
  updatedAt: string;
  state: CotsiState;
  job?: {
    profile: Profile;
    prefs: JobPrefs;
    role: RoleRec;
    milestonesDone?: number[];
  };
};

export type StoredMessage = {
  role: "user" | "assistant";
  text: string;
  at: string;
  /** App-generated kickoff messages are sent to the model but not shown to the learner. */
  hidden?: boolean;
  sources?: { url: string; title: string }[];
};

export type Env = {
  anthropicApiKey: string;
  modelLesson: string;
  modelPlan: string;
  modelResearch: string;
  dailyBudgetUsd: number;
  userDailyUsd: number;
  jobAnalysesPerDay: number;
  allowedOrigins: string[];
  requestTimeoutMs: number;
  devAuth: boolean;
};
