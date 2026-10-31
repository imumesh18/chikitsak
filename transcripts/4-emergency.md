# Mild cold turns into an emergency

Household: `4-emergency-1793723769266`

**User:** My husband Vikram (45) has had a mild cough and runny nose for 2 days, no fever.

**Chikitsak** `NEED_INFO · vikram · vikram-1`

> Does Vikram have any breathing difficulty, chest pain, blue lips, or confusion?

**User:** Now he's getting really breathless just sitting on the sofa and says his chest feels tight and heavy.

**Chikitsak** `EMERGENCY · vikram · vikram-1`

> This may be a medical emergency. Call your local emergency number (112 in India, 911 in the US) or go to the nearest emergency department now. Do not wait for further replies here.

## Household memory after the conversation

```json
{
  "members": {
    "vikram": {
      "id": "vikram",
      "name": "Vikram",
      "relation": "husband",
      "conditions": [],
      "meds": [],
      "allergies": [],
      "age": 45
    }
  },
  "episodes": {
    "vikram-1": {
      "id": "vikram-1",
      "memberId": "vikram",
      "title": "Cough and runny nose",
      "status": "open",
      "openedAt": "2026-11-03T16:36:10.835Z",
      "lastAt": "2026-11-03T16:36:14.147Z",
      "facts": {
        "complaint": "Mild cough and runny nose; now very breathless at rest with chest tightness/heaviness",
        "duration_days": 2,
        "severity": "severe",
        "fever": false,
        "worsening": true
      },
      "redFlags": [
        "breathing_difficulty",
        "chest_pain"
      ],
      "screened": true,
      "log": [
        "2026-11-03 Mild cough and runny nose for 2 days; no fever.",
        "2026-11-03 Now very breathless sitting at rest and reports chest feels tight and heavy."
      ],
      "outcome": "EMERGENCY"
    }
  }
}
```
