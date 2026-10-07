/**
 * World simulation types. Shared by the engine (pure), the server store and the UI.
 * All money and resources are fictional.
 */
export const RESOURCES = ["food", "wood", "tools", "knowledge"] as const;
export type Resource = (typeof RESOURCES)[number];
export type Stock = Record<Resource, number>;

export const INHABITANT_ROLES = ["farmer", "forester", "crafter", "trader", "builder", "scholar"] as const;
export type InhabitantRole = (typeof INHABITANT_ROLES)[number];

export type LocationKind = "home" | "farm" | "forest" | "workshop" | "market" | "hall" | "library" | "granary" | "site";

export interface Location {
  id: string;
  name: string;
  kind: LocationKind;
  x: number; // 0..100
  y: number; // 0..60
  capacity?: number; // homes
}

export type ActionKind = "working" | "building" | "studying" | "trading" | "eating" | "resting" | "idle" | "hungry";

export interface Inhabitant {
  id: string;
  name: string;
  role: InhabitantRole;
  color: string;
  skill: number; // 0..1 proficiency in their role
  goal: string;
  homeId: string;
  workplaceId: string;
  /** Fictional credits, stored in cents to keep bookkeeping exact. */
  cents: number;
  inventory: Stock;
  energy: number; // 0..100
  hunger: number; // 0..100
  relationships: Record<string, number>; // -1..1
  action: { kind: ActionKind; locationId: string; detail: string };
  joinedTick: number;
}

export interface Organization {
  id: string;
  name: string;
  kind: "guild" | "council";
  role?: InhabitantRole;
  memberIds: string[];
  foundedTick: number;
}

export type ProjectKind = "irrigation" | "granary" | "workshop" | "homes" | "library" | "market_hall";
export type ProjectStatus = "proposed" | "awaiting_council" | "approved" | "active" | "done" | "rejected";

export interface Project {
  id: string;
  kind: ProjectKind;
  name: string;
  proposerId: string;
  rationale: string;
  costCents: number;
  /** Credits set aside when funded; pays builders' wages, remainder returns on completion. */
  escrowCents: number;
  materials: Partial<Stock>;
  workRequired: number;
  progress: number;
  status: ProjectStatus;
  assignedIds: string[];
  proposedTick: number;
  decidedBy?: "rules" | "prime" | "council";
  sessionId?: string | null;
  note?: string;
}

export interface WorldConfig {
  maxPopulation: number;
  maxOrganizations: number;
  growthEnabled: boolean;
  /** Projects costing more than this (credits) need a council/Prime decision. */
  councilThresholdCredits: number;
  /** Apply a council recommendation automatically when it is unambiguous. Off by default. */
  councilAutoApply: boolean;
}

export const DEFAULT_WORLD_CONFIG: WorldConfig = {
  maxPopulation: 12,
  maxOrganizations: 3,
  growthEnabled: true,
  councilThresholdCredits: 75,
  councilAutoApply: false,
};

export interface WorldState {
  version: 1;
  name: string;
  seed: number;
  rng: number;
  tick: number;
  branch: number;
  config: WorldConfig;
  treasury: { cents: number; stock: Stock };
  prices: Record<Resource, number>; // cents per unit
  locations: Location[];
  inhabitants: Inhabitant[];
  organizations: Organization[];
  projects: Project[];
  built: ProjectKind[];
  modifiers: { farm: number; workshop: number; library: number; sellSpread: number; spoilage: number };
  stats: { tradesToday: number; turnoverCents: number; mealsMissed: number };
}

export type WorldEventType =
  | "world.created"
  | "tick.summary"
  | "trade"
  | "hunger"
  | "project.proposed"
  | "project.council_needed"
  | "project.approved"
  | "project.funded"
  | "project.waiting_funds"
  | "project.completed"
  | "project.rejected"
  | "inhabitant.arrived"
  | "organization.founded"
  | "council.requested"
  | "council.decision"
  | "council.recommendation"
  | "world.restored"
  | "world.config";

export interface WorldEvent {
  type: WorldEventType;
  tick: number;
  text: string;
  data: Record<string, unknown>;
}

export const SHIFT_NAMES = ["Morning", "Afternoon", "Evening"] as const;
export const shiftOf = (tick: number) => SHIFT_NAMES[tick % 3];
export const dayOf = (tick: number) => Math.floor(tick / 3) + 1;
