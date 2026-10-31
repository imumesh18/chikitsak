// Worker + one Durable Object per household running the Pi Durable loop.
import { DurableObject } from "cloudflare:workers";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { createRegistry, Harness } from "@earendil-works/pi-durable";
import { PiHarness } from "agents/harness/pi";
import { Lifecycle } from "agents/lifecycle";
import { Chikitsak, type Decision, emptyHousehold, Memory } from "./household.ts";
import { MESSAGES, type Outcome, tripwire } from "./triage.ts";

const MODEL = { provider: "openai", id: "gpt-6-luna" };
const MAX_TEXT = 2000;
const RANK: Record<Outcome, number> = { HOME: 0, NEED_INFO: 1, DOCTOR: 2, EMERGENCY: 3 };
export type ChatReply = { reply: string; failed?: boolean; tripwire?: boolean } & Partial<Decision>;

export class Household extends DurableObject<Env> {
	harness = new PiHarness({
		harness: ({ storage, context, onWake }) => {
			const key = { type: "api_key", key: this.env.OPENAI_API_KEY } as const;
			const models = createModels({ credentials: { read: async (p) => (p === "openai" ? key : undefined), list: async () => [{ providerId: "openai", type: "api_key" }], modify: async () => key, delete: async () => {} } });
			models.setProvider(openaiProvider());
			const registry = createRegistry();
			registry.install(Chikitsak);
			return Harness.open(storage, { models, registry, onWake, settings: { retry: { enabled: true, maxRetries: 2, baseDelayMs: 500 } } }, context);
		},
		defaults: { model: MODEL, thinkingLevel: "low" },
	});
	lifecycle = Lifecycle.install(this).use(this.harness);

	async state() {
		return (await (await this.harness.pi()).snapshot(Memory, BACKGROUND_CONTEXT)) ?? emptyHousehold();
	}

	async chat(text: string): Promise<ChatReply> {
		if (tripwire(text)) {
			await this.harness.submit(text); // still record it; the model updates memory in the background
			console.log(JSON.stringify({ event: "triage", outcome: "EMERGENCY", tripwire: true }));
			return { reply: MESSAGES.EMERGENCY, outcome: "EMERGENCY", tripwire: true };
		}
		const before = (await this.state()).seq;
		const { text: answer = "", status, reason } = await this.harness.prompt(text);
		if (status !== "done") {
			console.error(JSON.stringify({ event: "run_failed", status, reason }));
			return { reply: "Sorry, I couldn't answer just now. Please try again. If this is urgent, call your local emergency number.", failed: true };
		}
		const decision = (await this.state()).decisions.filter((d) => d.seq > before).sort((a, b) => RANK[b.outcome] - RANK[a.outcome])[0];
		const outcome = decision?.outcome;
		if (decision) console.log(JSON.stringify({ event: "triage", ...decision }));
		const reply = outcome === "EMERGENCY" || outcome === "DOCTOR" ? MESSAGES[outcome]
			: outcome === "HOME" ? `${answer}\n\n${MESSAGES.HOME_FOOTER}` : answer;
		return { reply, ...decision };
	}
}

const error = (status: number, message: string) => Response.json({ error: message }, { status });

export default {
	async fetch(req, _env, ctx) {
		const [, id, action] = new URL(req.url).pathname.match(/^\/h\/([\w-]{1,64})\/(chat|state)$/) ?? [];
		if (!id) return error(404, "Not found");
		if (req.method !== (action === "chat" ? "POST" : "GET")) return error(405, "Method not allowed");
		const household = ctx.exports.Household.getByName(id) as unknown as Pick<Household, "chat" | "state">;
		try {
			if (action === "state") return Response.json(await household.state());
			const body: unknown = await req.json().catch(() => null);
			const text = typeof body === "object" && body && "text" in body && typeof body.text === "string" ? body.text.trim() : "";
			if (!text) return error(400, 'Expected JSON body {"text": "..."}');
			if (text.length > MAX_TEXT) return error(413, `Message is longer than ${MAX_TEXT} characters`);
			const r = await household.chat(text);
			return Response.json(r, { status: r.failed ? 503 : 200 });
		} catch (e) {
			console.error(JSON.stringify({ event: "request_failed", action, error: String(e) }));
			return error(500, "Internal error");
		}
	},
} satisfies ExportedHandler;
