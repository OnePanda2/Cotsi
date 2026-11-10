export type Prefs = { style: "characters" | "plain"; shows?: string; visuals?: boolean; bookScenes?: boolean };

export type TrackSummary = {
  id: string;
  kind: "topic" | "book" | "job";
  title: string;
  phase: string | null;
  total: number;
  done: number;
  nextReviewAt: string | null;
  updatedAt: string;
};

export type Me = {
  user: { email: string; name: string };
  prefs: Prefs;
  tracks: TrackSummary[];
  today: string;
  usage: { used: number };
};

export type Roadmap = {
  outcome: string;
  capstone: string;
  weeks?: number;
  milestones: { n: number; title: string; hours?: number; done_means?: string[]; boss?: boolean }[];
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

export type Profile = {
  first_name: string;
  headline: string;
  location_country: string;
  years_experience: number;
  current_role: string;
  fields: string[];
  skills: { name: string; level: string }[];
  education: string;
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

export type JobDraft = {
  profile?: Profile;
  prefs?: JobPrefs;
  recs?: { roles: RoleRec[]; watchlist: { title: string; note: string }[]; caveat: string };
};

export type Source = { url: string; title: string };
export type ScanResult = { text: string; sources: Source[] };

export type Track = {
  id: string;
  kind: "topic" | "book" | "job";
  title: string;
  depth?: string;
  updatedAt: string;
  state: {
    phase?: string;
    map?: { topic?: string; goal?: string; trunk?: { title: string; unlocks?: string }[]; anchor?: string };
    progress?: { current?: number; done?: number[]; weak?: string[]; unchecked?: string[] };
    cards?: { q: string; a: string }[];
    roadmap?: Roadmap;
    nextReviewAt?: string;
  };
  job?: { profile: Profile; prefs: JobPrefs; role: RoleRec; milestonesDone?: number[] };
};

export type Message = { role: "user" | "assistant"; text: string; at: string; sources?: Source[] };
