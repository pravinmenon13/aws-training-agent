#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ── calendar data ──────────────────────────────────────────────────────────
import { EVENTS } from "./data.js";

// ── resource data ──────────────────────────────────────────────────────────
import {
  TOURNAMENTS,
  CERTIFICATIONS,
  EXTERNAL_LEARNING_PATHS,
  CPE_MODULES,
  GENAI_PATHS,
  RESKILLING_TRACKS,
  ACCOUNT_LEARNING_PATHS,
  WELL_ARCHITECTED_SESSIONS,
  TECH_TALKS,
  IMMERSION_DAYS,
  DISCOVERY_SERIES,
  HACKATHON_RECORDINGS,
  IBM_BLOGS,
  FAQS,
} from "./resources.js";

// ── enrolment / reminder store ─────────────────────────────────────────────
import {
  upsertEnrolment,
  getEnrolment,
  listEnrolments,
  deleteEnrolment,
  markReminded,
  hasBeenReminded,
  listReminders,
  type EnrolmentStatus,
} from "./store.js";

const server = new McpServer({ name: "aws-training-agent", version: "0.2.0" });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

function matchesKeyword(text: string, kw: string): boolean {
  return text.toLowerCase().includes(kw.toLowerCase());
}

// ════════════════════════════════════════════════════════════════════════════
//  TOOL 1 — query_events  (training calendar)
// ════════════════════════════════════════════════════════════════════════════

server.tool(
  "query_events",
  "Search and filter AWS training calendar events. Supports filtering by category, keyword in title, and/or a date range.",
  {
    category:  z.enum(["PartnerCast", "Certification", "Course", "Series"]).optional()
                 .describe("Filter by event category"),
    keyword:   z.string().optional()
                 .describe("Case-insensitive keyword to match against the event title"),
    from_date: z.string().optional()
                 .describe("ISO date YYYY-MM-DD — only return events starting on or after this date"),
    to_date:   z.string().optional()
                 .describe("ISO date YYYY-MM-DD — only return events starting on or before this date"),
  },
  async ({ category, keyword, from_date, to_date }) => {
    let results = [...EVENTS];
    if (category)  results = results.filter(e => e.category === category);
    if (keyword)   results = results.filter(e => matchesKeyword(e.title, keyword));
    if (from_date) results = results.filter(e => e.startDate >= from_date);
    if (to_date)   results = results.filter(e => e.startDate <= to_date);

    if (!results.length) return { content: [{ type: "text", text: "No events matched your query." }] };

    const lines = results.map(e => {
      const d = daysUntil(e.startDate);
      const when = d > 0 ? `in ${d} day(s)` : d === 0 ? "TODAY" : `${Math.abs(d)} day(s) ago`;
      return `[ID ${e.id}] ${e.title}\n  Category: ${e.category} | Time: ${e.timeStart}–${e.timeEnd}\n  Dates: ${e.startDate} → ${e.endDate} (${when})\n  Enrol: ${e.enrolLink}`;
    });

    return { content: [{ type: "text", text: `Found ${results.length} event(s):\n\n${lines.join("\n\n")}` }] };
  }
);

// ════════════════════════════════════════════════════════════════════════════
//  TOOL 2 — manage_enrolment
// ════════════════════════════════════════════════════════════════════════════

server.tool(
  "manage_enrolment",
  "Enrol a user in a training event, update their enrolment status, list their enrolments, or cancel an enrolment.",
  {
    action:    z.enum(["enrol", "update_status", "list", "cancel"]).describe("Action to perform"),
    user_name: z.string().describe("Name or IBM ID of the person"),
    event_id:  z.number().int().optional().describe("Event ID from query_events — required for enrol / update_status / cancel"),
    status:    z.enum(["enrolled", "waitlisted", "completed", "cancelled"]).optional().describe("New status — required for update_status"),
    notes:     z.string().optional().describe("Optional free-text notes"),
  },
  async ({ action, user_name, event_id, status, notes }) => {
    switch (action) {
      case "enrol": {
        if (!event_id) return { content: [{ type: "text", text: "event_id is required." }], isError: true };
        const event = EVENTS.find(e => e.id === event_id);
        if (!event) return { content: [{ type: "text", text: `No event with ID ${event_id}.` }], isError: true };
        const existing = getEnrolment(user_name, event_id);
        if (existing) return { content: [{ type: "text", text: `${user_name} is already enrolled (status: ${existing.status}).` }] };
        const rec = upsertEnrolment({ eventId: event_id, userName: user_name, status: "enrolled", enrolledAt: new Date().toISOString(), notes });
        return { content: [{ type: "text", text: `✅ ${user_name} enrolled in "${event.title}" on ${event.startDate}.\nStatus: ${rec.status} | Enrolled at: ${rec.enrolledAt}` }] };
      }
      case "update_status": {
        if (!event_id) return { content: [{ type: "text", text: "event_id is required." }], isError: true };
        if (!status)   return { content: [{ type: "text", text: "status is required." }], isError: true };
        const existing = getEnrolment(user_name, event_id);
        if (!existing) return { content: [{ type: "text", text: `No enrolment found for ${user_name} in event ${event_id}.` }], isError: true };
        const updated = upsertEnrolment({ ...existing, status: status as EnrolmentStatus, notes: notes ?? existing.notes });
        return { content: [{ type: "text", text: `Updated enrolment for ${user_name} in event ${event_id}: status → "${updated.status}".` }] };
      }
      case "list": {
        const records = listEnrolments(user_name);
        if (!records.length) return { content: [{ type: "text", text: `No enrolments found for ${user_name}.` }] };
        const lines = records.map(r => {
          const ev = EVENTS.find(e => e.id === r.eventId);
          return `• [ID ${r.eventId}] ${ev?.title ?? "Unknown"} — ${r.status}${r.notes ? ` | ${r.notes}` : ""}`;
        });
        return { content: [{ type: "text", text: `Enrolments for ${user_name}:\n${lines.join("\n")}` }] };
      }
      case "cancel": {
        if (!event_id) return { content: [{ type: "text", text: "event_id is required." }], isError: true };
        const removed = deleteEnrolment(user_name, event_id);
        return { content: [{ type: "text", text: removed ? `Enrolment for ${user_name} in event ${event_id} cancelled.` : `No enrolment found.` }] };
      }
      default:
        return { content: [{ type: "text", text: "Unknown action." }], isError: true };
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
//  TOOL 3 — check_reminders
// ════════════════════════════════════════════════════════════════════════════

server.tool(
  "check_reminders",
  "List upcoming training events within N days, mark an event as reminded, or list reminded events.",
  {
    action:        z.enum(["list_upcoming", "mark_reminded", "list_reminded"]).describe("Action to perform"),
    days_ahead:    z.number().int().min(1).max(365).optional().default(7).describe("Days ahead to scan (default 7)"),
    user_name:     z.string().optional().describe("Filter or record for this user"),
    event_id:      z.number().int().optional().describe("Required for mark_reminded"),
    only_enrolled: z.boolean().optional().default(false).describe("Only show events user is enrolled in"),
  },
  async ({ action, days_ahead, user_name, event_id, only_enrolled }) => {
    switch (action) {
      case "list_upcoming": {
        const horizon = days_ahead ?? 7;
        let upcoming = EVENTS.filter(e => { const d = daysUntil(e.startDate); return d >= 0 && d <= horizon; });
        if (only_enrolled && user_name) {
          const ids = listEnrolments(user_name).map(r => r.eventId);
          upcoming = upcoming.filter(e => ids.includes(e.id));
        }
        if (!upcoming.length) return { content: [{ type: "text", text: `No events in the next ${horizon} day(s).` }] };
        const lines = upcoming.map(e => {
          const d = daysUntil(e.startDate);
          const reminded = user_name ? hasBeenReminded(user_name, e.id) : false;
          return `[ID ${e.id}] ${e.title}\n  Starts: ${e.startDate} (in ${d} day(s)) | Reminded: ${reminded ? "Yes" : "No"}\n  Enrol: ${e.enrolLink}`;
        });
        return { content: [{ type: "text", text: `${upcoming.length} event(s) in next ${horizon} day(s):\n\n${lines.join("\n\n")}` }] };
      }
      case "mark_reminded": {
        if (!event_id || !user_name) return { content: [{ type: "text", text: "event_id and user_name are required." }], isError: true };
        const rec = markReminded(user_name, event_id);
        return { content: [{ type: "text", text: `Reminder recorded: ${user_name} notified about event ${event_id} at ${rec.remindedAt}.` }] };
      }
      case "list_reminded": {
        const records = listReminders(user_name);
        if (!records.length) return { content: [{ type: "text", text: `No reminder records found.` }] };
        const lines = records.map(r => { const ev = EVENTS.find(e => e.id === r.eventId); return `• [ID ${r.eventId}] ${ev?.title ?? "Unknown"} — ${r.remindedAt} (${r.userName})`; });
        return { content: [{ type: "text", text: `Reminder log:\n${lines.join("\n")}` }] };
      }
      default:
        return { content: [{ type: "text", text: "Unknown action." }], isError: true };
    }
  }
);

// ════════════════════════════════════════════════════════════════════════════
//  TOOL 4 — query_certifications
// ════════════════════════════════════════════════════════════════════════════

server.tool(
  "query_certifications",
  "Look up AWS certification learning paths by level or keyword. Returns IBM YourLearning links and official AWS certification links.",
  {
    level:   z.enum(["Foundation", "Associate", "Professional", "Specialty"]).optional().describe("Certification level"),
    keyword: z.string().optional().describe("Keyword to match against certification name"),
  },
  async ({ level, keyword }) => {
    let results = [...CERTIFICATIONS];
    if (level)   results = results.filter(c => c.level === level);
    if (keyword) results = results.filter(c => matchesKeyword(c.name, keyword));
    if (!results.length) return { content: [{ type: "text", text: "No certifications matched." }] };

    const lines = results.map(c => [
      `${c.name} [${c.level}]`,
      c.ibmLearningLink  ? `  IBM Learning : ${c.ibmLearningLink}` : null,
      c.ibmLearningLink2 ? `  IBM Learning2: ${c.ibmLearningLink2}` : null,
      c.awsLink          ? `  AWS Official  : ${c.awsLink}` : null,
      c.notes            ? `  Notes         : ${c.notes}` : null,
    ].filter(Boolean).join("\n"));

    return { content: [{ type: "text", text: `${results.length} certification(s):\n\n${lines.join("\n\n")}` }] };
  }
);

// ════════════════════════════════════════════════════════════════════════════
//  TOOL 5 — query_resources
// ════════════════════════════════════════════════════════════════════════════

server.tool(
  "query_resources",
  "Search across all AWS resource categories: tech_talks, immersion_days, discovery_series, hackathon_recordings, cpe_modules, genai_paths, reskilling_tracks, external_learning_paths, account_learning_paths, well_architected, blogs, tournaments.",
  {
    category: z.enum([
      "tech_talks", "immersion_days", "discovery_series", "hackathon_recordings",
      "cpe_modules", "genai_paths", "reskilling_tracks", "external_learning_paths",
      "account_learning_paths", "well_architected", "blogs", "tournaments", "all",
    ]).describe("Resource category to query — use 'all' for a full overview"),
    keyword: z.string().optional().describe("Case-insensitive keyword filter applied to name/title"),
  },
  async ({ category, keyword }) => {
    const kw = keyword?.toLowerCase();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function fmt(label: string, items: any[]): string {
      if (!items.length) return "";
      const rows = items
        .filter(i => !kw || matchesKeyword(i.title ?? i.name ?? "", keyword!))
        .map(i => {
          const name = i.title ?? i.name ?? "(unnamed)";
          const link = i.link ? `\n    Link: ${i.link}` : "";
          const extra = Object.entries(i)
            .filter(([k]) => !["title", "name", "link"].includes(k))
            .map(([k, v]) => `\n    ${k}: ${v}`)
            .join("");
          return `• ${name}${link}${extra}`;
        });
      if (!rows.length) return "";
      return `── ${label} (${rows.length}) ──\n${rows.join("\n\n")}`;
    }

    const sections: string[] = [];

    const include = (cat: string) => category === "all" || category === cat;

    if (include("tournaments"))
      sections.push(fmt("Tournaments / Play & Learn", TOURNAMENTS.map(t => ({ name: t.name, link: t.link, kickoff: t.kickoffDate, ends: t.endDate }))));

    if (include("tech_talks"))
      sections.push(fmt("Tech Talks", TECH_TALKS.map(t => ({ name: t.name, link: t.link, year: t.year }))));

    if (include("immersion_days"))
      sections.push(fmt("Immersion Days", IMMERSION_DAYS));

    if (include("discovery_series"))
      sections.push(fmt("Discovery Series", DISCOVERY_SERIES));

    if (include("hackathon_recordings"))
      sections.push(fmt("Hackathon Recordings", HACKATHON_RECORDINGS));

    if (include("cpe_modules"))
      sections.push(fmt("CPE Bootcamp Modules", CPE_MODULES.map(m => ({ name: `${m.module}: ${m.title}`, link: m.link }))));

    if (include("genai_paths"))
      sections.push(fmt("Gen AI Learning Paths", GENAI_PATHS.map(p => ({ name: `#${p.id} ${p.title}`, link: p.ibmLink ?? "", badge: p.badgeType, duration: p.duration, audience: p.targetAudience }))));

    if (include("reskilling_tracks"))
      sections.push(fmt("Reskilling Tracks", RESKILLING_TRACKS));

    if (include("external_learning_paths"))
      sections.push(fmt("External Learning Paths (Skill Builder)", EXTERNAL_LEARNING_PATHS.map(p => ({ name: `[${p.level}] ${p.name}`, link: p.link }))));

    if (include("account_learning_paths"))
      sections.push(fmt("Account-Specific Learning Paths", ACCOUNT_LEARNING_PATHS.map(p => ({ name: p.accountName, link: p.link }))));

    if (include("well_architected"))
      sections.push(fmt("Well Architected Framework", WELL_ARCHITECTED_SESSIONS.map(s => ({ name: s.name, link: s.link, notes: s.notes ?? "" }))));

    if (include("blogs"))
      sections.push(fmt("IBM Blogs", IBM_BLOGS.map(b => ({ name: b.title, link: b.link, authors: b.authors }))));

    const output = sections.filter(Boolean).join("\n\n");
    if (!output.trim()) return { content: [{ type: "text", text: "No resources matched." }] };
    return { content: [{ type: "text", text: output }] };
  }
);

// ════════════════════════════════════════════════════════════════════════════
//  TOOL 6 — recommend_learning_path
// ════════════════════════════════════════════════════════════════════════════

server.tool(
  "recommend_learning_path",
  "Recommend an AWS learning path based on a user's role, experience level, and goal.",
  {
    role:      z.string().describe("User's role, e.g. Developer, Architect, Data Scientist, Consultant, Designer, Sales, SysOps, DevOps"),
    level:     z.enum(["beginner", "intermediate", "expert"]).describe("Experience level"),
    goal:      z.string().optional().describe("Specific goal or topic of interest, e.g. 'Gen AI', 'migration', 'security', 'certification'"),
  },
  async ({ role, level, goal }) => {
    const lines: string[] = [`Recommended AWS learning path for: ${role} (${level})${goal ? ` — focus: ${goal}` : ""}\n`];

    const roleLower = role.toLowerCase();
    const goalLower = (goal ?? "").toLowerCase();

    // Always recommend foundation for beginners
    if (level === "beginner") {
      lines.push("▶ START HERE — Foundation Level:");
      lines.push("  • AWS Certified Cloud Practitioner\n    IBM: https://yourlearning.ibm.com/activity/PLAN-0149BED84CC5\n    AWS: https://aws.amazon.com/certification/certified-cloud-practitioner/");
      lines.push("  • Cloud Practitioner Essentials Bootcamp (13 recorded modules)\n    Start: https://w3.ibm.com/services/lighthouse/videos/109763");
    }

    // Gen AI track
    if (goalLower.includes("gen ai") || goalLower.includes("genai") || goalLower.includes("generative")) {
      lines.push("\n▶ Gen AI Path:");
      if (roleLower.includes("developer") || roleLower.includes("architect")) {
        lines.push("  • AWS Certified Generative AI Developer - Professional\n    IBM: https://yourlearning.ibm.com/activity/UDEMY-6928347");
        lines.push("  • IBM Generative AI Developer / Architect learning plans\n    IBM: https://yourlearning.ibm.com");
      }
      if (roleLower.includes("data")) {
        lines.push("  • IBM Generative AI Data Scientist\n    IBM: https://yourlearning.ibm.com");
      }
      if (roleLower.includes("sales") || roleLower.includes("consultant") || roleLower.includes("pm")) {
        lines.push("  • AWS Partner: Generative AI Sales (2h 30m)\n  • IBM Generative AI Consultant/PM");
      }
      lines.push("  • AWS Discovery Series - Gen AI\n    Link: https://ec.yourlearning.ibm.com/w3/playback/10421379");
      lines.push("  • IBM AWS Gen AI Gamethon (Tournament)\n    Link: https://w3.ibm.com/services/lighthouse/videos/144370");
    }

    // Architect track
    if (roleLower.includes("architect")) {
      lines.push("\n▶ Architecture Path:");
      if (level === "beginner" || level === "intermediate") {
        lines.push("  • AWS Certified Solution Architect - Associate\n    IBM: https://yourlearning.ibm.com/activity/PLAN-9CA8E9AAA409");
      }
      if (level === "intermediate" || level === "expert") {
        lines.push("  • AWS Certified Solutions Architect - Professional\n    IBM: https://yourlearning.ibm.com/activity/PLAN-14CA33A3EC94");
        lines.push("  • Solution Architect Partner Learning Plan\n    Link: https://explore.skillbuilder.aws/learn/learning_plan/view/104/solution-architect-partner-learning-plan");
      }
      lines.push("  • Well-Architected Framework PartnerCast\n    Link: https://ibm.biz/wellarchitectedpractice (Password: AWSTraining2023)");
    }

    // Developer track
    if (roleLower.includes("developer")) {
      lines.push("\n▶ Developer Path:");
      if (level !== "expert") lines.push("  • AWS Certified Developer - Associate\n    IBM: https://yourlearning.ibm.com/activity/PLAN-D7A55914AB99");
      if (level === "expert")  lines.push("  • AWS Certified DevOps Engineer - Professional\n    IBM: https://yourlearning.ibm.com/activity/PLAN-09619BF9E491");
      lines.push("  • AWS Developer Associate Partner Learning Plan\n    Link: https://explore.skillbuilder.aws/learn/learning_plan/view/920/AWS-Developer-Associate-Certification-Partner-Learning-Plan");
      lines.push("  • AWS FullStack Reskilling Track\n    Link: https://lksprod.dst.ibm.com/lkw/v0/xapp/mp/?v=27637420&id=775");
    }

    // Data / ML track
    if (roleLower.includes("data") || roleLower.includes("ml") || roleLower.includes("machine learning")) {
      lines.push("\n▶ Data & ML Path:");
      lines.push("  • AWS Certified Machine Learning Engineer - Associate\n    IBM: https://yourlearning.ibm.com/activity/PLAN-C5498711CF81");
      if (level === "expert") lines.push("  • AWS Certified Machine Learning - Specialty\n    IBM: https://yourlearning.ibm.com/activity/PLAN-42E4D536A9E1");
      lines.push("  • AWS Discovery Series - Machine Learning\n    Link: https://ec.yourlearning.ibm.com/w3/playback/10425337");
    }

    // Security track
    if (goalLower.includes("security")) {
      lines.push("\n▶ Security Path:");
      lines.push("  • AWS Certified Security - Specialty\n    IBM: https://yourlearning.ibm.com/activity/PLAN-2D05C80F7472");
      lines.push("  • Security Engineer Partner Learning Plan\n    Link: https://explore.skillbuilder.aws/learn/learning_plan/view/112/security-engineer-partner-learning-plan");
    }

    // Migration track
    if (goalLower.includes("migration") || goalLower.includes("migrate")) {
      lines.push("\n▶ Migration Path:");
      lines.push("  • AWS Migration Reskilling for Application Architects\n    Link: https://lksprod.dst.ibm.com/collection/goto?id=667");
      lines.push("  • AWS Discovery Series - Migration\n    Link: https://ec.yourlearning.ibm.com/w3/playback/10419633");
      lines.push("  • Tech Talk: Migrate on-prem data pipelines to AWS\n    Link: https://ec.yourlearning.ibm.com/w3/playback/10354622");
    }

    lines.push("\n▶ Always useful:");
    lines.push("  • AWS Workshops: https://workshops.aws/");
    lines.push("  • AWS AI Explorer: https://aiexplorer.aws.amazon.com/?lang=en");
    lines.push("  • AWS What's New: https://aws.amazon.com/new/");

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ════════════════════════════════════════════════════════════════════════════
//  TOOL 7 — query_faq
// ════════════════════════════════════════════════════════════════════════════

server.tool(
  "query_faq",
  "Search the IBM AWS certification FAQ. Find answers about LRT, vouchers, CAP, Credly, exam scheduling, Skill Builder, HCAM, and more. Supports keyword search or tag filtering.",
  {
    keyword: z.string().optional()
               .describe("Case-insensitive keyword to match against question or answer text"),
    tag:     z.string().optional()
               .describe("Filter by a specific tag, e.g. 'voucher', 'lrt', 'credly', 'scheduling', 'cap'"),
    id:      z.number().int().optional()
               .describe("Return a specific FAQ entry by its ID"),
  },
  async ({ keyword, tag, id }) => {
    if (id !== undefined) {
      const entry = FAQS.find(f => f.id === id);
      if (!entry) return { content: [{ type: "text", text: `No FAQ with ID ${id}.` }] };
      return { content: [{ type: "text", text: `Q${entry.id}: ${entry.question}\nA: ${entry.answer}\nTags: ${entry.tags.join(", ")}` }] };
    }

    let results = [...FAQS];

    if (tag) {
      const t = tag.toLowerCase();
      results = results.filter(f => f.tags.some(tg => tg.toLowerCase().includes(t)));
    }

    if (keyword) {
      const kw = keyword.toLowerCase();
      results = results.filter(f =>
        f.question.toLowerCase().includes(kw) ||
        f.answer.toLowerCase().includes(kw) ||
        f.tags.some(t => t.toLowerCase().includes(kw))
      );
    }

    if (!results.length) return { content: [{ type: "text", text: "No FAQ entries matched your query." }] };

    const lines = results.map(f =>
      `Q${f.id}: ${f.question}\n  A: ${f.answer}\n  Tags: ${f.tags.join(", ")}`
    );

    return { content: [{ type: "text", text: `${results.length} FAQ result(s):\n\n${lines.join("\n\n")}` }] };
  }
);

// ════════════════════════════════════════════════════════════════════════════
//  Boot
// ════════════════════════════════════════════════════════════════════════════

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("aws-training-agent v0.2.0 running on stdio");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
