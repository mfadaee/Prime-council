/**
 * Deterministic world engine.
 *
 * `step(state)` is a pure function: same state in → same state and events out.
 * Randomness comes only from the seeded PRNG stored in the state, so any tick
 * can be replayed, inspected and restored exactly. No model is called here;
 * council decisions enter only through `decide()`, as explicit events.
 *
 * Economy (closed and fictional): credits move between inhabitants and the
 * treasury but are never created or destroyed — tests assert this invariant.
 * Resources are produced by work, consumed by meals, crafting and projects.
 *
 * A day has three shifts: two work shifts (morning, afternoon) and an evening
 * of meals, market trade, rest and community rules (proposals, growth, guilds).
 */
import {
  DEFAULT_WORLD_CONFIG,
  RESOURCES,
  dayOf,
  type Inhabitant,
  type InhabitantRole,
  type Location,
  type Project,
  type ProjectKind,
  type Resource,
  type Stock,
  type WorldConfig,
  type WorldEvent,
  type WorldState,
} from "./types";

// ----------------------------------------------------------------- helpers ---

/** mulberry32: tiny, fast, deterministic PRNG. Returns [value, nextState]. */
export function rand(state: number): [number, number] {
  let t = (state + 0x6d2b79f5) | 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const emptyStock = (): Stock => ({ food: 0, wood: 0, tools: 0, knowledge: 0 });
export const credits = (cents: number) => (cents / 100).toFixed(2);

const MARKET_RESERVE_CENTS = 2000;
const BASE_PRICE: Record<Resource, number> = { food: 300, wood: 400, tools: 1500, knowledge: 600 };
const ROLE_COLORS: Record<InhabitantRole, string> = {
  farmer: "#3DDC97",
  forester: "#8BD450",
  crafter: "#FFB15C",
  trader: "#5CC8FF",
  builder: "#B79CFF",
  scholar: "#FF8FCB",
};
const ROLE_PLACE: Record<InhabitantRole, Location["kind"]> = {
  farmer: "farm",
  forester: "forest",
  crafter: "workshop",
  trader: "market",
  builder: "forest",
  scholar: "hall",
};
const ROLE_GOAL: Record<InhabitantRole, string> = {
  farmer: "Keep everyone fed",
  forester: "Supply timber for the village",
  crafter: "Make enough tools for every trade",
  trader: "Keep goods moving at fair prices",
  builder: "Build what the community needs",
  scholar: "Grow the community's knowledge",
};
const NAMES = ["Ada", "Bram", "Cyra", "Dov", "Esme", "Fen", "Gil", "Hana", "Ivo", "Juno", "Kai", "Lior", "Mira", "Nils", "Oona", "Pax", "Quin", "Rhea", "Sol", "Tamsin"];

interface Template {
  kind: ProjectKind;
  name: string;
  costCents: number;
  materials: Partial<Stock>;
  work: number;
  proposerRole: InhabitantRole;
  repeatable?: number;
}
export const TEMPLATES: Record<ProjectKind, Template> = {
  irrigation: { kind: "irrigation", name: "Irrigation channels", costCents: 6000, materials: { wood: 8, tools: 2 }, work: 20, proposerRole: "farmer" },
  granary: { kind: "granary", name: "Granary", costCents: 5000, materials: { wood: 10 }, work: 16, proposerRole: "farmer" },
  workshop: { kind: "workshop", name: "Workshop expansion", costCents: 7000, materials: { wood: 10, tools: 1 }, work: 18, proposerRole: "crafter" },
  homes: { kind: "homes", name: "New homes", costCents: 8000, materials: { wood: 16, tools: 2 }, work: 24, proposerRole: "builder", repeatable: 3 },
  library: { kind: "library", name: "Library", costCents: 9000, materials: { wood: 12, tools: 2 }, work: 22, proposerRole: "scholar" },
  market_hall: { kind: "market_hall", name: "Market hall", costCents: 10000, materials: { wood: 14, tools: 3 }, work: 26, proposerRole: "trader" },
};

// ------------------------------------------------------------------ create ---

function makeInhabitant(state: WorldState, role: InhabitantRole, nameIdx: number, cents: number): Inhabitant {
  const home = state.locations.filter((l) => l.kind === "home").find((h) => state.inhabitants.filter((i) => i.homeId === h.id).length < (h.capacity ?? 2));
  const work = state.locations.find((l) => l.kind === ROLE_PLACE[role])!;
  let v: number;
  [v, state.rng] = rand(state.rng);
  const name = NAMES[nameIdx % NAMES.length] + (nameIdx >= NAMES.length ? ` ${Math.floor(nameIdx / NAMES.length) + 1}` : "");
  return {
    id: `inh_${name.toLowerCase().replace(/\s+/g, "")}`,
    name,
    role,
    color: ROLE_COLORS[role],
    skill: r2(0.45 + v * 0.3),
    goal: ROLE_GOAL[role],
    homeId: home?.id ?? state.locations.find((l) => l.kind === "home")!.id,
    workplaceId: work.id,
    cents,
    inventory: { ...emptyStock(), food: 2 },
    energy: 90,
    hunger: 10,
    relationships: {},
    action: { kind: "idle", locationId: home?.id ?? work.id, detail: "Settling in" },
    joinedTick: state.tick,
  };
}

export function createWorld(seed: number, config: Partial<WorldConfig> = {}, name = "Ember Hollow"): { state: WorldState; events: WorldEvent[] } {
  const state: WorldState = {
    version: 1,
    name,
    seed,
    rng: seed >>> 0,
    tick: 0,
    branch: 0,
    config: { ...DEFAULT_WORLD_CONFIG, ...config },
    treasury: { cents: 20000, stock: { food: 24, wood: 12, tools: 3, knowledge: 0 } },
    prices: { ...BASE_PRICE },
    locations: [
      { id: "loc_hall", name: "Commons Hall", kind: "hall", x: 50, y: 30 },
      { id: "loc_market", name: "Market", kind: "market", x: 66, y: 36 },
      { id: "loc_farm", name: "Riverside Farm", kind: "farm", x: 20, y: 44 },
      { id: "loc_forest", name: "Old Wood", kind: "forest", x: 84, y: 14 },
      { id: "loc_workshop", name: "Workshop", kind: "workshop", x: 34, y: 18 },
      { id: "loc_site", name: "Building site", kind: "site", x: 16, y: 16 },
      { id: "loc_home1", name: "Hearth Row 1", kind: "home", x: 40, y: 50, capacity: 2 },
      { id: "loc_home2", name: "Hearth Row 2", kind: "home", x: 52, y: 52, capacity: 2 },
      { id: "loc_home3", name: "Hearth Row 3", kind: "home", x: 64, y: 50, capacity: 2 },
    ],
    inhabitants: [],
    organizations: [],
    projects: [],
    built: [],
    modifiers: { farm: 1, workshop: 1, library: 1, sellSpread: 0.9, spoilage: 0.02 },
    stats: { tradesToday: 0, turnoverCents: 0, mealsMissed: 0 },
  };
  const roles: InhabitantRole[] = ["farmer", "forester", "crafter", "trader", "builder", "scholar"];
  roles.forEach((r, i) => state.inhabitants.push(makeInhabitant(state, r, i, 2000)));
  return {
    state,
    events: [
      {
        type: "world.created",
        tick: 0,
        text: `${name} is founded by ${state.inhabitants.map((i) => i.name).join(", ")}. The treasury holds ${credits(state.treasury.cents)} credits.`,
        data: { seed, population: state.inhabitants.length },
      },
    ],
  };
}

// -------------------------------------------------------------- accounting ---

/** All credits in the world: treasury + inhabitants + project escrows. Constant over time. */
export function totalCents(s: WorldState): number {
  return s.treasury.cents + s.inhabitants.reduce((n, i) => n + i.cents, 0) + s.projects.reduce((n, p) => n + p.escrowCents, 0);
}

function transfer(s: WorldState, from: "treasury" | Inhabitant, to: "treasury" | Inhabitant, cents: number): boolean {
  cents = Math.round(cents);
  if (cents <= 0) return true;
  const bal = from === "treasury" ? s.treasury.cents : from.cents;
  if (bal < cents) return false;
  if (from === "treasury") s.treasury.cents -= cents;
  else from.cents -= cents;
  if (to === "treasury") s.treasury.cents += cents;
  else to.cents += cents;
  return true;
}

function bond(a: Inhabitant, b: Inhabitant, amount: number) {
  if (a.id === b.id) return;
  a.relationships[b.id] = r2(clamp((a.relationships[b.id] ?? 0) + amount, -1, 1));
  b.relationships[a.id] = r2(clamp((b.relationships[a.id] ?? 0) + amount, -1, 1));
}

function guildBonus(s: WorldState, i: Inhabitant): number {
  return s.organizations.some((o) => o.kind === "guild" && o.memberIds.includes(i.id)) ? 1.1 : 1;
}

function targetStock(s: WorldState): Stock {
  const pop = Math.max(1, s.inhabitants.length);
  return { food: pop * 4, wood: pop * 3, tools: Math.max(3, pop * 0.5), knowledge: pop * 2 };
}

function updatePrices(s: WorldState) {
  const target = targetStock(s);
  for (const r of RESOURCES) {
    const ratio = target[r] / Math.max(0.5, s.treasury.stock[r]);
    s.prices[r] = Math.round(BASE_PRICE[r] * clamp(Math.pow(ratio, 0.35), 0.5, 2.5));
  }
}

// -------------------------------------------------------------------- work ---

function workShift(s: WorldState, events: WorldEvent[]) {
  const active = s.projects.find((p) => p.status === "active");
  const byLoc = new Map<string, Inhabitant[]>();
  for (const i of s.inhabitants) {
    const tired = i.energy < 15;
    const hungry = i.hunger > 60;
    const eff = (hungry ? 0.5 : 1) * guildBonus(s, i) * (i.inventory.tools >= 1 ? 1.2 : 1);
    if (tired) {
      i.action = { kind: "resting", locationId: i.homeId, detail: "Too tired to work" };
      i.energy = clamp(i.energy + 10, 0, 100);
      continue;
    }
    let loc = i.workplaceId;
    switch (i.role) {
      case "farmer": {
        const out = r2(2.6 * i.skill * eff * s.modifiers.farm);
        i.inventory.food = r2(i.inventory.food + out);
        i.action = { kind: "working", locationId: loc, detail: `Harvested ${out} food` };
        break;
      }
      case "forester": {
        const out = r2(2.2 * i.skill * eff);
        i.inventory.wood = r2(i.inventory.wood + out);
        i.action = { kind: "working", locationId: loc, detail: `Cut ${out} wood` };
        break;
      }
      case "crafter": {
        if (i.inventory.wood >= 2) {
          const out = r2(1 * eff * s.modifiers.workshop * (0.6 + i.skill * 0.6));
          i.inventory.wood = r2(i.inventory.wood - 2);
          i.inventory.tools = r2(i.inventory.tools + out);
          i.action = { kind: "working", locationId: loc, detail: `Made ${out} tools from 2 wood` };
        } else i.action = { kind: "idle", locationId: loc, detail: "Waiting for wood" };
        break;
      }
      case "trader": {
        i.action = { kind: "trading", locationId: loc, detail: "Keeping the market stalls" };
        break;
      }
      case "scholar": {
        const out = r2(1.2 * i.skill * eff * s.modifiers.library);
        s.treasury.stock.knowledge = r2(s.treasury.stock.knowledge + out);
        const paid = transfer(s, "treasury", i, 150);
        i.action = { kind: "studying", locationId: loc, detail: `Recorded ${out} knowledge${paid ? " (stipend 1.50)" : " (no stipend: treasury empty)"}` };
        break;
      }
      case "builder": {
        if (active) {
          loc = "loc_site";
          const done = r2(2 * (0.5 + i.skill) * eff);
          active.progress = r2(Math.min(active.workRequired, active.progress + done));
          if (!active.assignedIds.includes(i.id)) active.assignedIds.push(i.id);
          const wage = Math.min(300, active.escrowCents);
          active.escrowCents -= wage;
          i.cents += wage;
          i.action = { kind: "building", locationId: "loc_site", detail: `Built ${done} on ${active.name}` };
        } else {
          const out = r2(1.6 * i.skill * eff);
          i.inventory.wood = r2(i.inventory.wood + out);
          loc = "loc_forest";
          i.action = { kind: "working", locationId: loc, detail: `No active project — cut ${out} wood` };
        }
        break;
      }
    }
    i.energy = clamp(i.energy - 18, 0, 100);
    i.hunger = clamp(i.hunger + 12, 0, 100);
    i.skill = r2(Math.min(1, i.skill + 0.005 * (s.built.includes("library") ? 1.5 : 1)));
    byLoc.set(i.action.locationId, [...(byLoc.get(i.action.locationId) ?? []), i]);
  }
  // People who work side by side grow closer.
  for (const group of byLoc.values()) for (let a = 0; a < group.length; a++) for (let b = a + 1; b < group.length; b++) bond(group[a], group[b], 0.02);

  if (active && active.progress >= active.workRequired) completeProject(s, active, events);
}

function completeProject(s: WorldState, p: Project, events: WorldEvent[]) {
  p.status = "done";
  s.treasury.cents += p.escrowCents; // unspent budget returns to the treasury
  p.escrowCents = 0;
  s.built.push(p.kind);
  const SPOTS: Partial<Record<ProjectKind, { x: number; y: number }>> = { granary: { x: 4, y: 28 }, library: { x: 70, y: 22 } };
  const at = SPOTS[p.kind] ?? { x: 50, y: 10 };
  switch (p.kind) {
    case "irrigation":
      s.modifiers.farm = r2(s.modifiers.farm * 1.25);
      break;
    case "granary":
      s.modifiers.spoilage = 0;
      s.locations.push({ id: `loc_granary`, name: "Granary", kind: "granary", ...at });
      break;
    case "workshop":
      s.modifiers.workshop = r2(s.modifiers.workshop * 1.5);
      break;
    case "library":
      s.modifiers.library = r2(s.modifiers.library * 2);
      s.locations.push({ id: `loc_library`, name: "Library", kind: "library", ...at });
      s.inhabitants.filter((i) => i.role === "scholar").forEach((i) => (i.workplaceId = "loc_library"));
      break;
    case "market_hall":
      s.modifiers.sellSpread = 0.95;
      break;
    case "homes": {
      const n = s.locations.filter((l) => l.kind === "home").length + 1;
      s.locations.push({ id: `loc_home${n}`, name: `Hearth Row ${n}`, kind: "home", x: 28 + n * 9, y: 56, capacity: 2 });
      break;
    }
  }
  for (const id of p.assignedIds) for (const id2 of p.assignedIds) if (id < id2) bond(s.inhabitants.find((i) => i.id === id)!, s.inhabitants.find((i) => i.id === id2)!, 0.05);
  events.push({ type: "project.completed", tick: s.tick, text: `${p.name} is complete. ${benefitText(p.kind)}`, data: { projectId: p.id, kind: p.kind } });
}

export function benefitText(kind: ProjectKind): string {
  return {
    irrigation: "Farm yields rise by 25%.",
    granary: "Stored food no longer spoils.",
    workshop: "Tool output rises by 50%.",
    homes: "Housing for two more inhabitants.",
    library: "Scholarship doubles and skills grow faster.",
    market_hall: "Sellers keep 95% of market price instead of 90%.",
  }[kind];
}

// ----------------------------------------------------------------- evening ---

function evening(s: WorldState, events: WorldEvent[]) {
  // Community levy: 15% of savings above 30 credits returns to the treasury, so
  // money keeps circulating to fund wages, stipends and projects.
  let levy = 0;
  for (const i of s.inhabitants) {
    const excess = i.cents - 3000;
    if (excess > 0) {
      const due = Math.round(excess * 0.15);
      transfer(s, i, "treasury", due);
      levy += due;
    }
  }
  if (levy) events.push({ type: "trade", tick: s.tick, text: `The community levy returns ${credits(levy)} credits to the treasury.`, data: { levyCents: levy } });
  // Citizen dividend: cash the treasury holds above its reserve is shared out
  // equally (20% a day), so money does not pile up in the treasury either.
  const surplusCash = s.treasury.cents - 10000;
  if (surplusCash > 0 && s.inhabitants.length) {
    const each = Math.floor((surplusCash * 0.2) / s.inhabitants.length);
    if (each > 0) {
      for (const i of s.inhabitants) transfer(s, "treasury", i, each);
      events.push({ type: "trade", tick: s.tick, text: `The treasury pays a dividend of ${credits(each)} credits to each inhabitant.`, data: { dividendCents: each } });
    }
  }
  updatePrices(s);
  const trader = s.inhabitants.find((i) => i.role === "trader");
  let turnover = 0;
  let trades = 0;
  let missed = 0;

  // Sell surplus to the market (the treasury buys at price × spread).
  const keep = (i: Inhabitant): Stock => ({ food: 3, wood: i.role === "crafter" ? 4 : 0, tools: 1, knowledge: 0 });
  for (const i of s.inhabitants) {
    for (const r of ["food", "wood", "tools"] as Resource[]) {
      const surplus = Math.floor(i.inventory[r] - keep(i)[r]);
      if (surplus <= 0) continue;
      const unit = Math.round(s.prices[r] * s.modifiers.sellSpread);
      // The market only buys while its stores are below twice the target level.
      const demand = Math.max(0, Math.floor(targetStock(s)[r] * 2 - s.treasury.stock[r]));
      const affordable = Math.min(surplus, demand, Math.floor(s.treasury.cents / Math.max(1, unit)));
      if (affordable <= 0) continue;
      transfer(s, "treasury", i, affordable * unit);
      i.inventory[r] = r2(i.inventory[r] - affordable);
      s.treasury.stock[r] = r2(s.treasury.stock[r] + affordable);
      turnover += affordable * unit;
      trades++;
      if (trader) bond(i, trader, 0.01);
    }
  }

  // Buy what is needed: crafters restock wood; workers without tools buy one.
  for (const i of s.inhabitants) {
    if (i.role === "crafter" && i.inventory.wood < 4) {
      const want = Math.min(4 - Math.floor(i.inventory.wood), Math.floor(s.treasury.stock.wood), Math.floor(i.cents / s.prices.wood));
      if (want > 0 && transfer(s, i, "treasury", want * s.prices.wood)) {
        i.inventory.wood = r2(i.inventory.wood + want);
        s.treasury.stock.wood = r2(s.treasury.stock.wood - want);
        turnover += want * s.prices.wood;
        trades++;
      }
    }
    if (["farmer", "forester", "builder"].includes(i.role) && i.inventory.tools < 1 && s.treasury.stock.tools >= 1 && i.cents >= s.prices.tools * 1.5) {
      if (transfer(s, i, "treasury", s.prices.tools)) {
        i.inventory.tools = r2(i.inventory.tools + 1);
        s.treasury.stock.tools = r2(s.treasury.stock.tools - 1);
        turnover += s.prices.tools;
        trades++;
      }
    }
  }

  // Trader earns a commission on market turnover (paid by the treasury).
  if (trader && turnover > 0) transfer(s, "treasury", trader, Math.round(turnover * 0.03));

  // Meals: own food first, then the market, then a neighbour's surplus (sold, or
  // given freely between people who get on well).
  let gifts = 0;
  let p2p = 0;
  let commons = 0;
  for (const i of s.inhabitants) {
    if (i.inventory.food >= 1) {
      i.inventory.food = r2(i.inventory.food - 1);
      i.hunger = 0;
      i.action = { kind: "eating", locationId: "loc_hall", detail: "Supper at the Commons Hall" };
      continue;
    }
    if (s.treasury.stock.food >= 1 && transfer(s, i, "treasury", s.prices.food)) {
      s.treasury.stock.food = r2(s.treasury.stock.food - 1);
      i.hunger = 0;
      turnover += s.prices.food;
      trades++;
      i.action = { kind: "eating", locationId: "loc_hall", detail: `Bought supper at the market (${credits(s.prices.food)})` };
      continue;
    }
    if (s.treasury.stock.food >= 1) {
      // Commons kitchen: the community stores feed anyone who cannot pay.
      s.treasury.stock.food = r2(s.treasury.stock.food - 1);
      i.hunger = 0;
      commons++;
      i.action = { kind: "eating", locationId: "loc_hall", detail: "Fed by the commons kitchen" };
      continue;
    }
    const seller = s.inhabitants
      .filter((o) => o.id !== i.id && o.inventory.food >= 4)
      .sort((a, b) => (i.relationships[b.id] ?? 0) - (i.relationships[a.id] ?? 0) || b.inventory.food - a.inventory.food)[0];
    if (seller) {
      if (i.cents >= s.prices.food && transfer(s, i, seller, s.prices.food)) {
        p2p++;
        trades++;
        turnover += s.prices.food;
        i.action = { kind: "eating", locationId: "loc_hall", detail: `Bought supper from ${seller.name}` };
      } else if ((seller.relationships[i.id] ?? 0) >= 0.1) {
        gifts++;
        bond(i, seller, 0.03);
        i.action = { kind: "eating", locationId: "loc_hall", detail: `${seller.name} shared supper` };
      } else {
        i.hunger = clamp(i.hunger + 25, 0, 100);
        missed++;
        i.action = { kind: "hungry", locationId: i.homeId, detail: "Could not afford food tonight" };
        continue;
      }
      seller.inventory.food = r2(seller.inventory.food - 1);
      i.hunger = 0;
      continue;
    }
    i.hunger = clamp(i.hunger + 25, 0, 100);
    missed++;
    i.action = { kind: "hungry", locationId: i.homeId, detail: "There was no food to be had" };
  }
  if (gifts || p2p) events.push({ type: "trade", tick: s.tick, text: `Neighbours traded ${p2p} supper(s) directly and shared ${gifts} for free.`, data: { p2p, gifts } });
  if (commons) events.push({ type: "trade", tick: s.tick, text: `The commons kitchen fed ${commons} inhabitant(s) who could not pay.`, data: { commons } });


  if (missed) events.push({ type: "hunger", tick: s.tick, text: `${missed} inhabitant(s) went to bed hungry.`, data: { missed } });

  // Rest overnight; spoilage of stored food (unless there is a granary).
  for (const i of s.inhabitants) i.energy = clamp(i.energy + (i.hunger > 60 ? 25 : 55), 0, 100);
  s.treasury.stock.food = r2(s.treasury.stock.food * (1 - s.modifiers.spoilage));

  const eaters = s.inhabitants.filter((i) => i.action.kind === "eating");
  for (let a = 0; a < eaters.length; a++) for (let b = a + 1; b < eaters.length; b++) bond(eaters[a], eaters[b], 0.005);

  s.stats = { tradesToday: trades, turnoverCents: turnover, mealsMissed: missed };
  if (trades) events.push({ type: "trade", tick: s.tick, text: `Market day: ${trades} trades, ${credits(turnover)} credits changed hands.`, data: { trades, turnoverCents: turnover } });

  communityRules(s, events);
}

// --------------------------------------------------------- community rules ---

function needScore(s: WorldState, kind: ProjectKind): number {
  const pop = s.inhabitants.length;
  const housing = s.locations.filter((l) => l.kind === "home").reduce((n, h) => n + (h.capacity ?? 2), 0);
  switch (kind) {
    case "irrigation":
      return 6 - s.treasury.stock.food / pop;
    case "granary":
      return s.treasury.stock.food > pop * 2 ? 3 : 1;
    case "workshop":
      return 4 - s.treasury.stock.tools;
    case "homes":
      return pop >= housing - 1 ? 6 : 0;
    case "library":
      return s.treasury.stock.knowledge >= 8 ? 3 : 0.5;
    case "market_hall":
      return s.stats.tradesToday >= 6 ? 2.5 : 0.5;
  }
}

function rationale(s: WorldState, kind: ProjectKind): string {
  const pop = s.inhabitants.length;
  const perCap = (s.treasury.stock.food / pop).toFixed(1);
  return {
    irrigation: `The stores hold ${perCap} food per person; better water would raise farm yields.`,
    granary: `Stored food spoils at ${Math.round(s.modifiers.spoilage * 100)}% a night; a granary would keep it.`,
    workshop: `The treasury has ${s.treasury.stock.tools} tools for ${pop} people; a bigger workshop would help every trade.`,
    homes: `${pop} people share homes built for ${s.locations.filter((l) => l.kind === "home").reduce((n, h) => n + (h.capacity ?? 2), 0)}; newcomers need somewhere to live.`,
    library: `We have recorded ${s.treasury.stock.knowledge} knowledge; a library would let scholarship grow.`,
    market_hall: `${s.stats.tradesToday} trades a day happen in the open; a hall would let sellers keep more.`,
  }[kind];
}

function communityRules(s: WorldState, events: WorldEvent[]) {
  const day = dayOf(s.tick);
  const open = s.projects.filter((p) => ["proposed", "awaiting_council", "approved", "active"].includes(p.status));

  // 1. Proposals: every second day, the best-placed inhabitant proposes the most needed project.
  if (day % 2 === 0 && open.length < 2) {
    const candidates = (Object.keys(TEMPLATES) as ProjectKind[])
      .filter((k) => {
        const t = TEMPLATES[k];
        const pending = s.projects.some((p) => p.kind === k && p.status !== "done" && p.status !== "rejected");
        const built = s.built.filter((b) => b === k).length;
        return !pending && built < (t.repeatable ?? 1);
      })
      .map((k) => ({ k, score: needScore(s, k) }))
      .filter((c) => c.score > 1)
      .sort((a, b) => b.score - a.score || a.k.localeCompare(b.k));
    const pick = candidates[0];
    if (pick) {
      const t = TEMPLATES[pick.k];
      const proposer =
        s.inhabitants.filter((i) => i.role === t.proposerRole).sort((a, b) => b.skill - a.skill)[0] ?? [...s.inhabitants].sort((a, b) => b.skill - a.skill)[0];
      const p: Project = {
        id: `prj_${s.tick}_${pick.k}`,
        kind: pick.k,
        name: t.name,
        proposerId: proposer.id,
        rationale: rationale(s, pick.k),
        costCents: t.costCents,
        escrowCents: 0,
        materials: t.materials,
        workRequired: t.work,
        progress: 0,
        status: "proposed",
        assignedIds: [],
        proposedTick: s.tick,
      };
      s.projects.push(p);
      events.push({ type: "project.proposed", tick: s.tick, text: `${proposer.name} proposes ${t.name}: ${p.rationale}`, data: { projectId: p.id, proposerId: proposer.id, costCents: p.costCents } });
    }
  }

  // 2. Allocation: small projects are approved by rule; large ones go to the council.
  for (const p of s.projects) {
    if (p.status === "proposed") {
      if (p.costCents > s.config.councilThresholdCredits * 100) {
        p.status = "awaiting_council";
        events.push({
          type: "project.council_needed",
          tick: s.tick,
          text: `${p.name} costs ${credits(p.costCents)} credits — above the ${s.config.councilThresholdCredits}-credit threshold, so it awaits a council decision.`,
          data: { projectId: p.id },
        });
      } else {
        p.status = "approved";
        p.decidedBy = "rules";
        events.push({ type: "project.approved", tick: s.tick, text: `${p.name} is approved by community rule (under the council threshold).`, data: { projectId: p.id, by: "rules" } });
      }
    }
  }
  // 3. Funding: one active project at a time, funded from the treasury when affordable.
  if (!s.projects.some((p) => p.status === "active")) {
    const next = s.projects.find((p) => p.status === "approved");
    if (next) fund(s, next, events);
  }

  // 4. Growth: a newcomer arrives when there is food, housing and room under the Prime's cap.
  const pop = s.inhabitants.length;
  const housing = s.locations.filter((l) => l.kind === "home").reduce((n, h) => n + (h.capacity ?? 2), 0);
  if (s.config.growthEnabled && pop < s.config.maxPopulation && pop < housing && s.treasury.stock.food >= pop * 3 && s.treasury.cents >= 1500) {
    const counts = new Map<InhabitantRole, number>();
    for (const i of s.inhabitants) counts.set(i.role, (counts.get(i.role) ?? 0) + 1);
    const role = (["farmer", "forester", "builder", "crafter", "scholar", "trader"] as InhabitantRole[]).sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0))[0];
    const newcomer = makeInhabitant(s, role, s.inhabitants.length, 0);
    transfer(s, "treasury", newcomer, 1500);
    s.inhabitants.push(newcomer);
    events.push({ type: "inhabitant.arrived", tick: s.tick, text: `${newcomer.name} arrives and settles as a ${role}, with 15.00 credits from the treasury.`, data: { inhabitantId: newcomer.id, role } });
  }

  // 5. Organisations: three or more people in one trade found a guild (+10% output).
  if (s.organizations.length < s.config.maxOrganizations) {
    for (const role of ["farmer", "forester", "crafter", "builder", "scholar", "trader"] as InhabitantRole[]) {
      if (s.organizations.length >= s.config.maxOrganizations) break;
      const members = s.inhabitants.filter((i) => i.role === role);
      if (members.length >= 3 && !s.organizations.some((o) => o.role === role)) {
        const name = `${role[0].toUpperCase()}${role.slice(1)}s' Guild`;
        s.organizations.push({ id: `org_${role}`, name, kind: "guild", role, memberIds: members.map((m) => m.id), foundedTick: s.tick });
        events.push({ type: "organization.founded", tick: s.tick, text: `${members.map((m) => m.name).join(", ")} found the ${name}.`, data: { role } });
      }
    }
  }
  for (const o of s.organizations) if (o.role) o.memberIds = s.inhabitants.filter((i) => i.role === o.role).map((i) => i.id);
}

function fund(s: WorldState, p: Project, events: WorldEvent[]) {
  const enoughMaterials = (Object.entries(p.materials) as [Resource, number][]).every(([r, n]) => s.treasury.stock[r] >= n);
  // Keep a market reserve so the treasury can still buy produce after funding.
  if (s.treasury.cents - p.costCents >= MARKET_RESERVE_CENTS && enoughMaterials) {
    s.treasury.cents -= p.costCents;
    p.escrowCents = p.costCents;
    for (const [r, n] of Object.entries(p.materials) as [Resource, number][]) s.treasury.stock[r] = r2(s.treasury.stock[r] - n);
    p.status = "active";
    p.note = undefined;
    events.push({ type: "project.funded", tick: s.tick, text: `${p.name} is funded and construction begins.`, data: { projectId: p.id } });
  } else if (p.note !== "waiting for funds") {
    p.note = "waiting for funds";
    const missing = (Object.entries(p.materials) as [Resource, number][]).filter(([r, n]) => s.treasury.stock[r] < n).map(([r, n]) => `${r} ${s.treasury.stock[r]}/${n}`);
    events.push({
      type: "project.waiting_funds",
      tick: s.tick,
      text: `${p.name} waits for resources (credits ${credits(s.treasury.cents)}/${credits(p.costCents + MARKET_RESERVE_CENTS)} incl. market reserve${missing.length ? `; ${missing.join(", ")}` : ""}).`,
      data: { projectId: p.id },
    });
  }
}

// --------------------------------------------------------------- public API ---

function clone<T>(v: T): T {
  return structuredClone(v);
}

/** Advance one shift. Pure: the input state is not modified. */
export function step(input: WorldState): { state: WorldState; events: WorldEvent[] } {
  const s = clone(input);
  const events: WorldEvent[] = [];
  const shift = s.tick % 3;
  if (shift === 2) evening(s, events);
  else workShift(s, events);
  const pop = s.inhabitants.length;
  events.push({
    type: "tick.summary",
    tick: s.tick,
    text: `Day ${dayOf(s.tick)} ${["morning", "afternoon", "evening"][shift]}: ${pop} inhabitants, treasury ${credits(s.treasury.cents)} credits, food ${s.treasury.stock.food}.`,
    data: { population: pop, treasuryCents: s.treasury.cents, stock: { ...s.treasury.stock } },
  });
  s.tick += 1;
  return { state: s, events };
}

/**
 * Apply a council or Prime decision on a project awaiting review — the explicit
 * link from deliberation to the world.
 */
export function decide(
  input: WorldState,
  projectId: string,
  decision: "approve" | "reject",
  meta: { by: "prime" | "council"; sessionId?: string | null; reason?: string },
): { state: WorldState; events: WorldEvent[] } {
  const s = clone(input);
  const p = s.projects.find((x) => x.id === projectId);
  if (!p || p.status !== "awaiting_council") throw new Error("Project is not awaiting a decision");
  const events: WorldEvent[] = [];
  p.decidedBy = meta.by;
  p.sessionId = meta.sessionId ?? null;
  const who = meta.by === "council" ? "The council" : "The Prime";
  if (decision === "approve") {
    p.status = "approved";
    events.push({ type: "council.decision", tick: s.tick, text: `${who} approves ${p.name}.${meta.reason ? ` ${meta.reason}` : ""}`, data: { projectId, decision, ...meta } });
    if (!s.projects.some((x) => x.status === "active")) fund(s, p, events);
  } else {
    p.status = "rejected";
    events.push({ type: "council.decision", tick: s.tick, text: `${who} rejects ${p.name}.${meta.reason ? ` ${meta.reason}` : ""}`, data: { projectId, decision, ...meta } });
  }
  return { state: s, events };
}

/** Extract an unambiguous APPROVE/REJECT recommendation from a council answer. */
export function parseRecommendation(answer: string): "approve" | "reject" | null {
  const m = answer.match(/\bDECISION:\s*(APPROVE|REJECT)\b/i);
  if (m) return m[1].toLowerCase() as "approve" | "reject";
  return null;
}

export function councilQuestion(s: WorldState, p: Project): string {
  const proposer = s.inhabitants.find((i) => i.id === p.proposerId);
  const mats = Object.entries(p.materials)
    .map(([r, n]) => `${n} ${r}`)
    .join(", ");
  return `[Simulated world: ${s.name} — fictional economy] ${proposer?.name ?? "An inhabitant"} (${proposer?.role ?? "?"}) proposes "${p.name}". Cost: ${credits(p.costCents)} fictional credits plus ${mats || "no materials"}; ${p.workRequired} units of construction work. Benefit: ${benefitText(p.kind)} Rationale given: ${p.rationale}
Current state: ${s.inhabitants.length} inhabitants, treasury ${credits(s.treasury.cents)} credits, stores ${JSON.stringify(s.treasury.stock)}, day ${dayOf(s.tick)}.
Should the community fund this project now? Begin your final answer with "DECISION: APPROVE" or "DECISION: REJECT", then explain.`;
}
