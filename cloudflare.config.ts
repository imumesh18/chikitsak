import { bindings, defineConfig, exports } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "chikitsak",
		compatibilityDate: "2026-10-01",
		compatibilityFlags: ["nodejs_compat"],
		entrypoint,
		observability: { enabled: true },
		env: { OPENAI_API_KEY: bindings.secret() },
		exports: { Household: exports.durableObject({ storage: "sqlite" }) },
	},
});
