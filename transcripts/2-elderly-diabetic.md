# Elderly parent: memory shapes advice and drives a doctor handoff

Household: `2-elderly-diabetic-1793723747385`

**User:** Some background: my dad Ramesh lives with us. He's 72, has type 2 diabetes and takes metformin.

**Chikitsak**

> Got it—I’ve saved Ramesh’s details: he’s 72, has type 2 diabetes, and takes metformin.

**User:** Is it okay for him to have a mango after lunch?

**Chikitsak**

> Yes, he can have mango in moderation. Since he has diabetes, keep the portion modest—about **½ cup of sliced mango**—and count it as part of the meal’s carbohydrates. Whole fruit is a better choice than juice; his blood-sugar response and care plan matter too.

**User:** He's been feeling very tired and a bit dizzy for the last 4 days.

**Chikitsak** `NEED_INFO · ramesh · ramesh-1`

> Does he have any chest pain, trouble breathing, confusion, or fainting/unresponsiveness right now?

**User:** I'd say moderate. No chest pain, he hasn't fainted, his speech is normal and there's no weakness on one side.

**Chikitsak** `DOCTOR · ramesh · ramesh-1`

> Thanks, I have what I need. I'm transferring this case to a doctor on our team for review, and they will contact you shortly. If things get worse before then, call your local emergency number.

## Household memory after the conversation

```json
{
  "members": {
    "ramesh": {
      "id": "ramesh",
      "name": "Ramesh",
      "relation": "father",
      "conditions": [
        "type 2 diabetes"
      ],
      "meds": [
        "metformin"
      ],
      "allergies": [],
      "age": 72
    }
  },
  "episodes": {
    "ramesh-1": {
      "id": "ramesh-1",
      "memberId": "ramesh",
      "title": "Tiredness and dizziness",
      "status": "handed_off",
      "openedAt": "2026-11-03T16:35:52.847Z",
      "lastAt": "2026-11-03T16:35:56.638Z",
      "facts": {
        "complaint": "Very tired and a bit dizzy",
        "duration_days": 4,
        "severity": "moderate"
      },
      "redFlags": [],
      "screened": true,
      "log": [
        "2026-11-03 Symptoms ongoing for four days.",
        "2026-11-03 Moderate tiredness and dizziness; no chest pain, fainting, speech change, or one-sided weakness."
      ],
      "outcome": "DOCTOR"
    }
  }
}
```
