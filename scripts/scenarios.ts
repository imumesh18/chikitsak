// Runs the scenarios against a local `pnpm dev` and writes one transcript per scenario.
// Usage: node scripts/scenarios.ts [scenario-id]
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:5173";
const SCENARIOS: Record<string, { title: string; turns: string[] }> = {
	"1-child-fever": { title: "Child fever: follow-ups, home care, then resolved", turns: [
		"My son Aarav (4 years old) has had a fever since last night.",
		"It was 101.5F this morning. He's a bit cranky but drinking water and playing a little.",
		"No rash, no stiff neck, he isn't unusually sleepy and he's breathing normally.",
		"Update: Aarav's fever is gone today and he's back to his usual self.",
	] },
	"2-elderly-diabetic": { title: "Elderly parent: memory shapes advice and drives a doctor handoff", turns: [
		"Some background: my dad Ramesh lives with us. He's 72, has type 2 diabetes and takes metformin.",
		"Is it okay for him to have a mango after lunch?",
		"He's been feeling very tired and a bit dizzy for the last 4 days.",
		"I'd say moderate. No chest pain, he hasn't fainted, his speech is normal and there's no weakness on one side.",
	] },
	"3-switching-members": { title: "Two family members in one conversation", turns: [
		"My mother has had knee pain for 2 days after a long walk. It's mild, no swelling or redness, and she can walk fine.",
		"Also, my daughter Meera (6) has had a cough since yesterday. Mild, no fever.",
		"She's breathing comfortably, eating well, no wheezing or noisy breathing.",
		"Her knee feels much better today, thanks!",
	] },
	"4-emergency": { title: "Mild cold turns into an emergency", turns: [
		"My husband Vikram (45) has had a mild cough and runny nose for 2 days, no fever.",
		"Now he's getting really breathless just sitting on the sofa and says his chest feels tight and heavy.",
	] },
};

mkdirSync("transcripts", { recursive: true });
for (const [id, s] of Object.entries(SCENARIOS).filter(([id]) => !process.argv[2] || id === process.argv[2])) {
	const household = `${id}-${Date.now()}`;
	const lines = [`# ${s.title}`, "", `Household: \`${household}\``, ""];
	for (const text of s.turns) {
		const r = await (await fetch(`${BASE}/h/${household}/chat`, { method: "POST", body: JSON.stringify({ text }) })).json();
		const tag = r.outcome ? ` \`${[r.outcome, r.memberId, r.episodeId, r.tripwire && "tripwire"].filter(Boolean).join(" · ")}\`` : "";
		lines.push(`**User:** ${text}`, "", `**Chikitsak**${tag}`, "", ...r.reply.split("\n").map((l: string) => `> ${l}`), "");
		console.log(`[${id}] ${r.outcome ?? "-"} ${text.slice(0, 60)}`);
	}
	const state = await (await fetch(`${BASE}/h/${household}/state`)).json();
	lines.push("## Household memory after the conversation", "", "```json", JSON.stringify({ members: state.members, episodes: state.episodes }, null, 2), "```", "");
	writeFileSync(`transcripts/${id}.md`, lines.join("\n"));
}
