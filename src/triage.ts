// Deterministic safety layer: the model fills a case, these rules decide what happens.
export type Outcome = "EMERGENCY" | "DOCTOR" | "NEED_INFO" | "HOME";

export const RED_FLAGS = [
	"chest_pain", "breathing_difficulty", "blue_lips", "unresponsive", "seizure", "stroke_signs",
	"severe_bleeding", "throat_or_lip_swelling", "confusion", "stiff_neck_with_fever",
	"non_blanching_rash", "infant_not_feeding", "suicidal_thoughts",
] as const;

export const MESSAGES = {
	EMERGENCY: "This may be a medical emergency. Call your local emergency number (112 in India, 911 in the US) or go to the nearest emergency department now. Do not wait for further replies here.",
	DOCTOR: "Thanks, I have what I need. I'm transferring this case to a doctor on our team for review, and they will contact you shortly. If things get worse before then, call your local emergency number.",
	HOME_FOOTER: "This is general guidance, not a diagnosis. Message me if anything changes, and seek urgent care if you notice any of the warning signs above.",
};

export type Member = { id: string; name: string; relation: string; age?: number; conditions: string[]; meds: string[]; allergies: string[] };
export type Facts = { complaint?: string; duration_days?: number; severity?: "mild" | "moderate" | "severe"; fever?: boolean; temperature_c?: number; worsening?: boolean; pregnant?: boolean };
export type Episode = {
	id: string; memberId: string; title: string; status: "open" | "resolved" | "handed_off";
	openedAt: string; lastAt: string; facts: Facts; redFlags: string[]; screened: boolean;
	wantsDoctor?: string; outcome?: Outcome; log: string[];
};

const HIGH_RISK = /diabet|heart|cardiac|kidney|renal|immun|cancer|chemo|copd|asthma/i;

// Each rule returns DOCTOR when it fires. Extensions can push more.
export const doctorRules: ((m: Member, e: Episode) => boolean)[] = [
	(_, e) => e.facts.severity === "severe",
	(_, e) => !!e.facts.worsening,
	(_, e) => (e.facts.duration_days ?? 0) >= (e.facts.fever ? 3 : 7),
	(_, e) => (e.facts.temperature_c ?? 0) >= 40,
	(m, e) => !!e.facts.fever && m.age !== undefined && m.age < 0.25,
	(m, e) => (m.age ?? 0) >= 65 || !!e.facts.pregnant || m.conditions.some((c) => HIGH_RISK.test(c)),
	(_, e) => !!e.wantsDoctor,
];

export function missing(e: Episode): string[] {
	const f = e.facts;
	return [
		!f.complaint && "main symptom",
		f.duration_days === undefined && "how long it has been going on",
		!f.severity && "how severe it is (mild / moderate / severe)",
		f.fever && f.temperature_c === undefined && "measured temperature",
		!e.screened && "warning signs relevant to this complaint",
	].filter((x): x is string => !!x);
}

export function triage(m: Member, e: Episode): Outcome {
	if (e.redFlags.length) return "EMERGENCY";
	if (e.status === "handed_off") return "DOCTOR"; // escalation is sticky
	if (missing(e).length) return "NEED_INFO";
	return doctorRules.some((r) => r(m, e)) ? "DOCTOR" : "HOME";
}

// Backstop for when the model misses an obvious emergency in the raw text.
const TRIPWIRE = /\b(can'?t breathe|not breathing|struggling to breathe|chest pain|unconscious|unresponsive|collapsed|seizure|fitting|lips? (are |look |turning )?blue|face drooping|slurred speech|severe bleeding|kill myself|suicid)/i;
export function tripwire(text: string): boolean {
	const m = TRIPWIRE.exec(text);
	if (!m) return false;
	const before = text.slice(0, m.index).split(/\s+/).slice(-4).join(" ");
	return !/\b(no|not|never|without|denies|(is|was|does|did|has|had)n'?t)\b/i.test(before);
}
