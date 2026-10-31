# Chikitsak

A long-term family health assistant. One small agent loop per household that remembers who is who, tracks each illness as its own episode, asks focused follow-up questions, and escalates with fixed messages when it should.

Runs locally on Cloudflare Workers + Durable Objects with [Pi Durable](https://github.com/earendil-works/pi/tree/main/packages/durable) through the Agents SDK's `PiHarness`. Model: OpenAI `gpt-6-luna`.

## Why it is this small

The repo is minimal on purpose. A polished UI is easy to build, and quick to add with a coding agent, so it would not say much about the design. What matters here is the core: how the agent loop, the memory and the safety rules fit together. Keeping everything else out makes that core easy to read, understand and explain in one sitting. The chat page is only there so you can try it.

## Run it

```bash
pnpm install
cp .dev.vars.example .dev.vars   # add your OPENAI_API_KEY
pnpm dev                         # chat at http://localhost:5173
pnpm scenarios                   # in another terminal: rewrites transcripts/
```

## Approach

Product vision: [PRODUCT.md](PRODUCT.md).


**The model talks and extracts. Code decides.**

The LLM does what it is good at: empathy, asking the next useful question, and working out that "her knee" means the grandmother. A plain function makes every safety call, and the two escalation replies are constants the model never writes.

```
Browser / script ──POST /h/:household/chat──▶ Worker ──getByName──▶ Household Durable Object
                                                                    ├─ PiHarness (Pi Durable loop, OpenAI)
                                                                    ├─ chikitsak extension: prompt sections + update_case tool
                                                                    ├─ triage(): pure rules
                                                                    ├─ Memory document (members, episodes) in DO SQLite
                                                                    └─ reply gate: fixed text for EMERGENCY / DOCTOR
```

One turn:

1. The system prompt carries the household memory (members and open episodes), rendered fresh each turn.
2. On symptoms, the model calls `update_case` with the member, the episode (existing id or `"new"`) and structured facts.
3. The tool saves to memory and runs `triage()`, which returns one of four outcomes:

| Outcome | When | What the user gets |
|---|---|---|
| EMERGENCY | Any red flag from a fixed list | Fixed message: call emergency services. The run ends at once. |
| DOCTOR | A risk rule fires: severe, worsening, long duration, very high fever, infant with fever, age 65+, pregnancy, chronic condition from memory, or the model asks | Fixed handoff message. The run ends at once. |
| NEED_INFO | Missing complaint, duration, severity, temperature (if fever), or warning-sign screen | The model asks only for what is missing |
| HOME | Everything gathered, no rule fired | Model's home-care advice plus a fixed safety footer |

4. The Durable Object picks the most severe outcome of the turn and swaps in the fixed text where required.

## Design decisions

- **One Durable Object per household.** Telling family members apart needs all of them in one context. A DO runs one request at a time, so two parents typing at once cannot corrupt memory.
- **Memory is a Pi Durable document**, stored in the same SQLite as the transcript and written atomically. A family is small, so the whole state fits in the prompt and no retrieval is needed. Pi compacts the chat; the document is the source of truth.
- **One tool, `update_case`, both records and triages.** Assessment runs every time facts change, so the model cannot record a red flag and forget to act on it.
- **The model can raise the outcome, never lower it.** It may set `wants_doctor`, but nothing lets it override a rule. Escalation is sticky per episode.
- **Fixed text through `terminate`.** On EMERGENCY or DOCTOR the tool ends Pi's run, so the model never gets a turn to paraphrase.
- **Keyword backstop.** A regex with a simple negation check catches "collapsed", "unresponsive" and the like even if the model misses them. It replies EMERGENCY immediately and still records the message.
- **Episodes go stale.** An episode with no update for 14 days drops out of the prompt.
- **Crash-safe for free.** Pi Durable checkpoints each step; `update_case` is a keyed upsert marked `replay: "safe"`.
- **Defensive edges.** The Worker checks method, body shape and size (2,000 characters) and returns JSON errors (400 / 404 / 405 / 413 / 500 / 503). The tool schema bounds ages, temperatures and member ids, and the tool refuses to attach an update to another member's episode. Triage decisions and failed runs are logged as JSON, with Workers observability on.

## Extending it

Everything new is a Pi extension (tools, prompt sections, hooks) installed next to `chikitsak`. Facts are an open map and `doctorRules` is an array, so an extension can add facts and rules. The outcome is always the most severe one, so plug-ins can make the system more cautious, never less.

| Capability | Plugs in as |
|---|---|
| Lab report analysis | A tool that reads an uploaded report and saves values as episode facts, plus a rule such as `HbA1c > 9 → DOCTOR` |
| Knowledge base | A `search_guidelines` tool over Vectorize / AI Search, plus a prompt section on when to cite it |
| Telemedicine | An `afterRun` hook that starts a durable task posting the case to a provider on DOCTOR |
| Proactive check-ins | A scheduled Pi task: "ask about Aarav's fever in 12 hours" |

## Files

| File | Lines | What |
|---|---|---|
| `src/triage.ts` | 62 | Red flags, fixed messages, rules, missing-info check, keyword backstop |
| `src/household.ts` | 121 | Memory document, system prompt, `update_case` |
| `src/index.ts` | 77 | Worker routes and validation, Household DO, PiHarness |
| `index.html` | 86 | Chat page (Tailwind, built by Vite) with outcome tags and a memory panel |
| `scripts/scenarios.ts` | 44 | Runs the four scenarios, writes `transcripts/` |

## Scenarios

| Transcript | Shows |
|---|---|
| [1-child-fever](transcripts/1-child-fever.md) | Follow-up questions → HOME → "fever's gone" resolves the same episode |
| [2-elderly-diabetic](transcripts/2-elderly-diabetic.md) | Profile saved first; a general diet question answered using the remembered diabetes; later symptoms + age/diabetes from memory → DOCTOR |
| [3-switching-members](transcripts/3-switching-members.md) | Mother and daughter in one chat; "her knee" resolves only the mother's episode |
| [4-emergency](transcripts/4-emergency.md) | Mild cold, then breathlessness and chest tightness → EMERGENCY |

## Limits

- Local only. There is no auth: anyone who knows a household id can read it, so a real deployment needs sign-in in front of `/h/*`. Replies are not streamed.
- The model is the smallest OpenAI one, so it sometimes asks a slightly odd warning-sign question. The rules, not the model, decide outcomes.
- Not medical advice. The rules are illustrative and need clinical review.
