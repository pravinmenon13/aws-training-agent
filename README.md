# IBM AWS Training Hub

A self-contained, single-file web app for IBM L&K India that centralises all AWS training information — events, certifications, Gen AI paths, resources, FAQ and a rule-based chatbot — with no backend or build step required.

## Live Features

| Section | Description |
|---|---|
| 🏠 **Dashboard** | KPI stats, next upcoming events, featured certs, quick action buttons |
| 📅 **Training Calendar** | 9 upcoming events with search, category filter, countdown, enrol link |
| 📋 **My Enrolments** | In-session enrolment tracker with status pills |
| 🎖️ **Certifications** | 13 certs across Foundation → Specialty with IBM Learning & AWS Official links |
| 🧠 **Gen AI Paths** | 13 IBM & AWS Gen AI badges by role and level |
| 💻 **Workshops & Labs** | Immersion Days, Hackathon recordings, Discovery Series + external labs |
| 📚 **All Resources** | Tech Talks, Immersion Days, Discovery Series, Hackathon recordings, IBM Blogs |
| 🔗 **Quick Links** | 16 curated links: LRT, Credly, Skill Builder, AALEARN2, AWS workshops |
| ♻️ **Reskilling Tracks** | Role-transition paths, account paths, Well-Architected, Tournaments |
| ❓ **FAQ** | 27 answered questions (LRT, vouchers, CAP, Credly, scheduling) with tag filter |
| 🧭 **Path Recommender** | Role + level + focus → personalised learning path |
| 🤖 **Ask the Bot** | Rule-based chatbot with suggestion chips covering all hub content |

## Usage

```
# Clone the repo
git clone https://github.com/PRAVINMENON/aws-training-agent.git

# Open the app — no build step needed
open aws-training-agent/app/index.html
```

Or simply double-click `app/index.html` in your file explorer.

## Structure

```
aws-training-agent/
├── app/
│   └── index.html       # Entire app — self-contained HTML + CSS + JS
└── README.md
```

## Tech

- Pure HTML5 / CSS3 / Vanilla JS — zero dependencies, zero build step
- All data is embedded as JS arrays in `index.html`
- Works fully offline

## Contributing

Update the data arrays at the top of the `<script>` block in `app/index.html`:

| Variable | What it controls |
|---|---|
| `EVENTS` | Training calendar entries |
| `CERTS` | Certification cards |
| `GENAI` | Gen AI learning paths |
| `FAQS` | FAQ entries |
| `RES` | Resources by tab |
| `RESKILLING / ACCOUNTS / WAF / TOURNAMENTS` | Reskilling page lists |

---

*Made with IBM Bob · L&K India AWS Practice*
