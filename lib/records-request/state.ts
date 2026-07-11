// Pure lifecycle state machine for a records request. No I/O.
// Driven by FL §119: no statutory deadline (no timer here — see follow_up_days
// in the tracker) and a §119.07(4) special-service-charge gate (cost_quoted -> cost_approved).

export const STATES = [
  "drafted",
  "filed",
  "acknowledged",
  "cost_quoted",
  "cost_approved",
  "fulfilled",
  "landed",
  "denied",
  "withdrawn",
] as const;

export const TERMINAL = new Set<string>(["landed", "denied", "withdrawn"]);

const RULES: Record<string, { from: string[]; to: string }> = {
  send: { from: ["drafted"], to: "filed" },
  ack: { from: ["filed"], to: "acknowledged" },
  quote: { from: ["filed", "acknowledged"], to: "cost_quoted" },
  approveCost: { from: ["cost_quoted"], to: "cost_approved" },
  fulfill: { from: ["acknowledged", "cost_approved"], to: "fulfilled" },
  land: { from: ["fulfilled"], to: "landed" },
  deny: { from: ["filed", "acknowledged", "cost_quoted", "cost_approved"], to: "denied" },
  withdraw: {
    from: ["drafted", "filed", "acknowledged", "cost_quoted", "cost_approved", "fulfilled"],
    to: "withdrawn",
  },
};

export const ACTIONS = Object.keys(RULES);

export function nextState(current: string, action: string): string {
  const rule = RULES[action];
  if (!rule) throw new Error(`unknown action: ${action}`);
  if (!rule.from.includes(current))
    throw new Error(`illegal transition: cannot ${action} from ${current}`);
  return rule.to;
}
