// Household memory (a Pi Durable document), the prompt that shows it, and the one tool that edits it.
import { Type } from "@earendil-works/pi-ai";
import { defineDoc, defineExtension, defineTool, section } from "@earendil-works/pi-durable";
import { type Episode, type Member, type Outcome, missing, RED_FLAGS, triage } from "./triage.ts";

export type Decision = { seq: number; outcome: Outcome; memberId: string; episodeId: string };
export type HouseholdState = { members: Record<string, Member>; episodes: Record<string, Episode>; seq: number; decisions: Decision[] };

export const emptyHousehold = (): HouseholdState => ({ members: {}, episodes: {}, seq: 0, decisions: [] });
export const Memory = defineDoc<HouseholdState>({
	kind: "chikitsak.household",
	version: 1,
	scope: "session",
	initial: emptyHousehold,
	checkpointWhen: () => false,
});

const STALE_MS = 14 * 864e5;
const isActive = (e: Episode) => e.status !== "resolved" && Date.now() - Date.parse(e.lastAt) < STALE_MS;
const uniq = (a: string[]) => [...new Set(a)];

const PREAMBLE = `You are Chikitsak, a warm, concise family health assistant for one household. Several family members share this chat.
- Work out which family member each message is about from context (names, relations, pronouns, open episodes). If you truly cannot tell, ask one short question.
- Whenever the user reports symptoms, an update, or that a problem is better, call update_case, filling every field you know (including details from earlier messages). Attach updates to the matching open episode; use episode_id "new" only for a new problem. Set resolved when the user says it is better.
- Record lasting facts (age, chronic conditions, regular medicines, allergies, pregnancy) through update_case member details, even with no episode.
- Report red_flags only when present now, never ones the user denies. Ask about warning signs once, naming the 3-4 most relevant to the complaint; set screened as soon as the user answers.
- Follow update_case's result exactly: ask only for the missing items, or give home-care advice for HOME. Never write your own emergency or referral message.
- General health questions with no active symptoms: answer briefly without tools.
- Never give a definite diagnosis or prescribe prescription medicines. Keep replies short and plain.`;

function render(h: HouseholdState): string {
	const members = Object.values(h.members).map((m) =>
		`- ${m.id}: ${m.name}, ${m.relation}${m.age !== undefined ? `, age ${m.age}` : ""}` +
		(m.conditions.length ? `; conditions: ${m.conditions.join(", ")}` : "") +
		(m.meds.length ? `; meds: ${m.meds.join(", ")}` : "") +
		(m.allergies.length ? `; allergies: ${m.allergies.join(", ")}` : ""));
	const eps = Object.values(h.episodes);
	const open = eps.filter(isActive).map((e) =>
		`- ${e.id} (${h.members[e.memberId]?.name}): ${e.title}; ${e.status}; opened ${e.openedAt.slice(0, 10)}, last ${e.lastAt.slice(0, 10)}; facts ${JSON.stringify(e.facts)}` +
		(e.log.length ? `; notes: ${e.log.slice(-3).join(" | ")}` : ""));
	const closed = eps.filter((e) => !isActive(e)).slice(-5).map((e) => `- ${e.id} (${h.members[e.memberId]?.name}): ${e.title}, closed`);
	return [`Today: ${new Date().toISOString().slice(0, 10)}`, "Members:", ...(members.length ? members : ["- none yet"]),
		"Open episodes:", ...(open.length ? open : ["- none"]), ...(closed.length ? ["Past episodes:", ...closed] : [])].join("\n");
}

const S = Type.String, N = Type.Number, B = Type.Boolean, Opt = Type.Optional, list = (description: string) => Opt(Type.Array(S(), { description }));
const MEMBER = ["name", "relation", "age"] as const;
const FACTS = ["complaint", "duration_days", "severity", "fever", "temperature_c", "worsening", "pregnant"] as const;
const Params = Type.Object({
	member_id: S({ pattern: "^[a-z0-9-]{1,32}$", description: "Existing member id, or a new short lowercase id (e.g. 'aarav', 'dad') for someone new" }),
	name: Opt(S()), relation: Opt(S({ description: "Relation to the user: son, mother, self..." })),
	age: Opt(N({ minimum: 0, maximum: 120, description: "Years; fractions for infants (0.2 = ~10 weeks)" })),
	conditions: list("Chronic conditions, e.g. type 2 diabetes"), meds: list("Regular medicines"), allergies: list("Allergies"),
	episode_id: Opt(S({ description: "Open episode id this update belongs to, or 'new' for a new health problem. Omit for profile-only updates." })),
	title: Opt(S({ description: "Short title for a new episode, e.g. 'Fever'" })),
	complaint: Opt(S({ description: "Main symptom(s)" })), duration_days: Opt(N({ minimum: 0, maximum: 3650, description: "Days since it started; 'since last night' = 1" })),
	severity: Opt(Type.Union([Type.Literal("mild"), Type.Literal("moderate"), Type.Literal("severe")])),
	fever: Opt(B()), temperature_c: Opt(N({ minimum: 30, maximum: 45, description: "Convert °F to °C" })), worsening: Opt(B()), pregnant: Opt(B()),
	red_flags: Opt(Type.Array(Type.Union(RED_FLAGS.map((f) => Type.Literal(f))), { description: "Only warning signs present now" })),
	screened: Opt(B({ description: "True once the user has answered your warning-sign question, even if not every sign was mentioned" })),
	note: Opt(S({ description: "One-line summary of this update" })),
	resolved: Opt(B({ description: "True only for the one episode the user says is better or over" })),
	wants_doctor: Opt(S({ description: "Reason, if you think a doctor should review even if no rule requires it" })),
});
const pick = <K extends string>(o: Record<string, unknown>, keys: readonly K[]) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

const updateCase = defineTool({
	name: "update_case",
	description: "Save everything known about a family member and their health episode (repeat details the user gave earlier), then get the triage decision.",
	parameters: Params,
	replay: "safe",
	execute: async (a, api, ctx) => {
		let result = "Saved. Reply to the user briefly.";
		let stop = false;
		await api.commit(async (tx) => {
			const h = await tx.doc(Memory);
			const now = new Date().toISOString();
			h.members[a.member_id] ??= { id: a.member_id, name: a.member_id, relation: "unknown", conditions: [], meds: [], allergies: [] };
			const m = h.members[a.member_id]!; // re-read: edits must go through the draft, not the inserted object
			Object.assign(m, pick(a, MEMBER), { conditions: uniq([...m.conditions, ...(a.conditions ?? [])]), meds: uniq([...m.meds, ...(a.meds ?? [])]), allergies: uniq([...m.allergies, ...(a.allergies ?? [])]) });
			if (!a.episode_id) return;
			if (a.episode_id !== "new" && h.episodes[a.episode_id]?.memberId !== a.member_id) {
				result = `Episode ${a.episode_id} is not an episode of ${a.member_id}. Use one of ${a.member_id}'s open episode ids, or "new".`;
				return;
			}
			const id = a.episode_id === "new" ? `${a.member_id}-${Object.keys(h.episodes).length + 1}` : a.episode_id;
			h.episodes[id] ??= { id, memberId: a.member_id, title: a.title ?? a.complaint ?? "Health issue", status: "open", openedAt: now, lastAt: now, facts: {}, redFlags: [], screened: false, log: [] };
			const e = h.episodes[id]!;
			Object.assign(e.facts, pick(a, FACTS));
			e.lastAt = now;
			e.redFlags = uniq([...e.redFlags, ...(a.red_flags ?? [])]);
			e.screened ||= !!a.screened;
			if (a.wants_doctor) e.wantsDoctor = a.wants_doctor;
			if (a.note) e.log = [...e.log, `${now.slice(0, 10)} ${a.note}`].slice(-50);
			if (a.resolved && !e.redFlags.length) {
				e.status = "resolved";
				result = `Episode ${id} marked resolved. Reply to the user briefly.`;
				return;
			}
			const outcome = triage(m, e);
			e.outcome = outcome;
			if (outcome === "DOCTOR") e.status = "handed_off";
			h.decisions = [...h.decisions, { seq: ++h.seq, outcome, memberId: m.id, episodeId: id }].slice(-20);
			stop = outcome === "EMERGENCY" || outcome === "DOCTOR";
			result = stop ? `${outcome}: a fixed message is shown to the user. Do not add anything.`
				: outcome === "NEED_INFO" ? `NEED_INFO for ${id}. Recorded so far: ${JSON.stringify(e.facts)}, screened: ${e.screened}. Still missing: ${missing(e).join("; ")}. If the user already told you any of these, call update_case again with them now; otherwise ask only for what is missing, in one short message.`
				: `HOME for ${id}. Give brief home-care and monitoring steps that fit ${m.name}'s profile, then list specific warning signs that need urgent care.`;
		}, ctx);
		const output = [{ type: "text" as const, text: result }];
		return stop ? { output, control: { terminate: true } } : { output };
	},
});

export const Chikitsak = defineExtension({
	name: "chikitsak",
	sections: [
		section("preamble", () => PREAMBLE, { tag: false }),
		section("household", async (input, rc) => render((await input.read.snapshot(Memory, rc)) ?? emptyHousehold())),
	],
	tools: [updateCase],
});
