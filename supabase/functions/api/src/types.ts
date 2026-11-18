export type User = { id: string; email: string; name: string };

export type Prefs = {
  style: "characters" | "plain";
  shows?: string;
  visuals?: boolean;
  bookScenes?: boolean;
  /** How they like to learn. Unset until they answer the question after sign-up. */
  mode?: "read" | "listen";
  /** Listening mode: the chosen voice's id and the reading speed. */
  voice?: string;
  rate?: number;
  /** false hides the learner from the game leaderboards. */
  board?: boolean;
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
  /** Where each weak skill starts, from the level check ("SQL: from what a table is"). */
  start_points?: string[];
  milestones: {
    n: number;
    title: string;
    hours?: number;
    done_means?: string[];
    boss?: boolean;
    capstone?: boolean;
    /** The milestone's topics, from the most basic to the most advanced. */
    topics?: string[];
  }[];
};

export type CotsiState = {
  phase?: "questions" | "teaching" | "unlock" | "wrapup" | "done";
  map?: { topic?: string; goal?: string; trunk?: { title: string; unlocks?: string }[]; anchor?: string };
  progress?: { current?: number; done?: number[]; weak?: string[]; unchecked?: string[] };
  cards?: { q: string; a: string }[];
  roadmap?: Roadmap;
  nextReviewAt?: string;
  reviewStepDays?: number;
  /** Facts the learner shared that later lessons need (device, installed tools, level checks). */
  notes?: string[];
  /** Topics and books: the overview of core ideas (or chapters), each opened on its own page. */
  outline?: Outline;
  /** Pages of the outline that Cotsi has taught (1-based). */
  partsDone?: number[];
  /** The optional hands-on project is finished. */
  projectDone?: boolean;
};

export type Outline = {
  kind: "ideas" | "chapters";
  /** One plain line on where the learner will be by the end. */
  anchor: string;
  parts: { title: string; gist: string }[];
  /** A small hands-on project to put it into practice; empty when there's nothing to build. */
  project: string;
  /** For books: the chapter list is grouped or approximate, not the exact table of contents. */
  approx?: boolean;
  /** Made from a lesson started before the overview existed; its first page is the "main" thread. */
  legacy?: boolean;
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
    /** Topics done, keyed "milestone.topic", and how: learned, revised and tested, or tested. */
    topics?: Record<string, { via: "learn" | "revise" | "know"; at: string }>;
    /** Topics whose test was failed: only Learn is allowed until they're learned. */
    mustLearn?: string[];
    /** The way the learner chose to start each topic. */
    started?: Record<string, "learn" | "revise" | "know">;
  };
};

export type StoredMessage = {
  role: "user" | "assistant";
  text: string;
  at: string;
  /** App-generated kickoff messages are sent to the model but not shown to the learner. */
  hidden?: boolean;
  sources?: { url: string; title: string }[];
  /** A picture the learner shared: a small preview to show, and what the image model saw in it. */
  image?: { thumb: string; desc: string };
};

export type Env = {
  anthropicApiKey: string;
  modelLesson: string;
  modelPlan: string;
  modelResearch: string;
  /** Reads images the learner shares, once, and describes them for the lesson model. */
  modelVision: string;
  dailyBudgetUsd: number;
  userDailyUsd: number;
  jobAnalysesPerDay: number;
  allowedOrigins: string[];
  requestTimeoutMs: number;
  devAuth: boolean;
  /** Shown to signed-in learners while lessons aren't open yet (no Claude API key). */
  notReadyMessage: string;
  /** Lowercase emails allowed to use lessons and CV analysis; "*" allows everyone. */
  memberEmails: string[];
  /** Shown to signed-in learners who aren't on the members list. */
  membersOnlyMessage: string;
  /** OpenAI key for natural read-aloud voices. Empty: listening mode shows "coming soon". */
  openaiApiKey: string;
  ttsModel: string;
  /** About what OpenAI charges per million characters read, for the daily spending limits. */
  ttsUsdPerMillion: number;
};
