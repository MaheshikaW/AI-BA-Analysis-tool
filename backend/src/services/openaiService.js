import OpenAI from 'openai';
import { config } from '../config.js';

const openai = config.openai.apiKey ? new OpenAI({ apiKey: config.openai.apiKey }) : null;

function getCompetitors() {
  return config.openai.competitors?.length ? config.openai.competitors : ['BambooHR', 'Workday', 'HiBOB', 'SAP SuccessFactors', 'ADP'];
}

/**
 * Map OrangeHRM feature name to competitor-equivalent feature names (AI classification).
 */
export async function mapToCompetitorTerms(featureName, featureDescription = '') {
  const COMPETITORS = getCompetitors();
  if (!openai) {
    return {
      ok: false,
      stub: true,
      competitors: Object.fromEntries(COMPETITORS.map(c => [c, `${c} equivalent of "${featureName}"`])),
    };
  }
  const prompt = `You are an HR software expert. For the OrangeHRM feature below, give the exact or closest feature name/term used by each competitor. Reply with a short phrase per competitor, nothing else.

OrangeHRM feature: ${featureName}
Description: ${featureDescription}

Competitors: ${COMPETITORS.join(', ')}

Reply in JSON only, one key per competitor, e.g. {"BambooHR":"Time Off Restrictions","Workday":"Leave Blackout Dates",...}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });
  const text = completion.choices[0]?.message?.content || '{}';
  let parsed = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  return { ok: true, competitors: parsed };
}

/**
 * Generate competitor analysis in a single OpenAI call (mapping + full analysis).
 * Faster than mapToCompetitorTerms + second call.
 */
export async function generateCompetitorAnalysis(featureName, featureDescription = '') {
  const COMPETITORS = getCompetitors();

  if (!openai) {
    const terms = Object.fromEntries(COMPETITORS.map((c) => [c, `${c} equivalent of "${featureName}"`]));
    return {
      ok: true,
      stub: true,
      featureName,
      featureDescription,
      competitors: Object.entries(terms).map(([name, term]) => ({
        name,
        term,
        howItWorks: `Configured under their Time Off / Leave settings. (Stub: add OPENAI_API_KEY for real analysis.)`,
        helpArticleTitle: null,
        helpArticleUrl: null,
        helpSearchQuery: `${name} ${term} help`,
      })),
      similarities: [],
      differences: [],
    };
  }

  const prompt = `You are an HR software expert. For the OrangeHRM feature below, do BOTH steps in one reply.

OrangeHRM feature: ${featureName}
Description: ${featureDescription}
Competitors to analyze: ${COMPETITORS.join(', ')}

1. For each competitor, give the exact or closest feature name/term they use (e.g. "Time Off Restrictions").
2. For each competitor: write 1-2 sentences on how that product implements this capability; set helpArticleTitle (short doc page title), helpSearchQuery (search phrase to find their doc); set helpArticleUrl to "" unless you know the exact https URL.

3. Add "similarities": array of 2-5 short bullet points on how OrangeHRM and these competitors are similar for this feature.
4. Add "differences": array of 2-5 short bullet points on how they differ (scope, configuration, terminology).

Reply in JSON only with this exact structure:
{ "similarities": ["...", "..."], "differences": ["...", "..."], "competitors": [
  { "name": "BambooHR", "term": "their feature name", "howItWorks": "1-2 sentences", "helpArticleTitle": "Doc title", "helpArticleUrl": "https://... or \"\"", "helpSearchQuery": "BambooHR ... documentation" }
] }
Include all competitors: ${COMPETITORS.join(', ')}. Required: similarities, differences, and for each competitor: name, term, howItWorks, helpArticleTitle, helpSearchQuery.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });
  const text = completion.choices[0]?.message?.content || '{}';
  let data = { competitors: [] };
  try {
    data = JSON.parse(text);
  } catch {
    data = { competitors: [], raw: text };
  }
  const competitors = (data.competitors || []).map((c) => {
    const name = c.name || '';
    const term = c.term || '';
    const fallbackQuery = `${name} ${term} documentation`.trim();
    return {
      ...c,
      helpArticleTitle: c.helpArticleTitle && String(c.helpArticleTitle).trim() ? c.helpArticleTitle : 'Search docs',
      helpArticleUrl: c.helpArticleUrl && String(c.helpArticleUrl).startsWith('http') ? c.helpArticleUrl : null,
      helpSearchQuery: c.helpSearchQuery && String(c.helpSearchQuery).trim() ? c.helpSearchQuery : fallbackQuery,
    };
  });
  const arr = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : []);
  const rawSim = data.similarities ?? data.Similarities ?? [];
  const rawDiff = data.differences ?? data.Differences ?? [];
  const similarities = arr(rawSim).map((s) => String(s).trim()).filter(Boolean);
  const differences = arr(rawDiff).map((d) => String(d).trim()).filter(Boolean);
  return { ok: true, featureName, featureDescription, competitors, similarities, differences };
}

/**
 * Generate a descriptive use case for a feature (objective, actors, preconditions, flow, postconditions, acceptance criteria).
 */
export async function generateUseCaseSections(featureName, featureDescription = '') {
  if (!openai) {
    return {
      objective: `Enable the organization to use the capability: ${featureName}.`,
      actors: 'HR Administrator, relevant employees (role depends on feature).',
      preconditions: 'Feature is enabled and configured in the system; user has appropriate permissions.',
      basicFlow: [
        'User navigates to the relevant module or screen.',
        'User performs the actions required for this feature according to the product design.',
        'System validates input and applies business rules.',
        'Outcome is saved and reflected in the system.',
      ],
      postconditions: 'The intended outcome is achieved and data is consistent; any dependent processes are updated as needed.',
      acceptanceCriteria: [
        'Feature behaves as described in the feature description.',
        'User can complete the flow without errors under valid input.',
        'Results are visible and auditable where applicable.',
      ],
    };
  }
  const prompt = `You are a business analyst writing a use case for an HR software feature. Write a clear, descriptive use case for the following feature. Be specific to this feature (refer to "${featureName}" and its description), not generic.

Feature: ${featureName}
Description: ${featureDescription}

Reply in JSON only with this exact structure (use arrays for basicFlow and acceptanceCriteria):
{
  "objective": "1-2 sentences describing the business goal of this use case",
  "actors": "Comma-separated list of who performs this use case (e.g. HR Admin, Manager, Employee)",
  "preconditions": "What must be true before the use case can start (system state, permissions, data)",
  "basicFlow": ["Step 1 in imperative mood", "Step 2", "Step 3", "..."],
  "postconditions": "What is true after a successful run (system state, data updated)",
  "acceptanceCriteria": ["Criterion 1", "Criterion 2", "..."]
}
Write 4-8 steps for basicFlow and 3-5 acceptance criteria. Be concrete and specific to this feature.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });
  const text = completion.choices[0]?.message?.content || '{}';
  try {
    const data = JSON.parse(text);
    const arr = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : []);
    return {
      objective: data.objective && String(data.objective).trim() ? data.objective : `Enable the organization to use: ${featureName}.`,
      actors: data.actors && String(data.actors).trim() ? data.actors : 'HR Administrator, relevant users.',
      preconditions: data.preconditions && String(data.preconditions).trim() ? data.preconditions : 'Feature is enabled and user has permissions.',
      basicFlow: arr(data.basicFlow).filter(Boolean).length ? arr(data.basicFlow) : ['User performs the feature actions.', 'System processes and persists the outcome.'],
      postconditions: data.postconditions && String(data.postconditions).trim() ? data.postconditions : 'Outcome is achieved and reflected in the system.',
      acceptanceCriteria: arr(data.acceptanceCriteria).filter(Boolean).length ? arr(data.acceptanceCriteria) : ['Feature works as described.', 'User can complete the flow successfully.'],
    };
  } catch {
    return {
      objective: `Enable the organization to use the capability: ${featureName}.`,
      actors: 'HR Administrator, relevant employees.',
      preconditions: 'Feature is enabled and configured; user has appropriate permissions.',
      basicFlow: ['User navigates to the feature.', 'User performs the required actions.', 'System validates and saves the outcome.'],
      postconditions: 'The intended outcome is achieved and data is updated.',
      acceptanceCriteria: ['Feature behaves as per the description.', 'Flow completes successfully for valid input.'],
    };
  }
}

/**
 * Generate mock UI spec for OrangeHRM-style screens (config form, list, widgets) using OpenAI.
 * Returns { config: { breadcrumb, title, description, fields }, list: { title, columns, rows }, widgets }.
 */
export async function generateMockUISpec(featureName, featureDescription = '', moduleName = '') {
  const mod = moduleName || 'Module';
  const fallback = () => ({
    config: {
      breadcrumb: `${mod} › Configure › ${featureName}`,
      title: featureName,
      description: featureDescription || `Configure ${featureName}.`,
      fields: [
        { label: 'Name', type: 'text', value: featureName },
        { label: 'Status', type: 'chip', value: 'Active' },
      ],
    },
    list: {
      title: `${featureName} List`,
      columns: ['Name', mod, 'Status', 'Date'],
      rows: [
        { cells: ['Sample 1', mod, 'Active', '01 Dec 2025'] },
        { cells: ['Sample 2', mod, 'Pending', '05 Dec 2025'] },
      ],
    },
    widgets: [
      { title: `Total ${featureName}`, value: '24' },
      { title: 'Active', value: '18' },
      { title: 'Pending', value: '6' },
    ],
  });

  if (!openai) return fallback();

  const prompt = `You are designing a mock UI that must match REAL OrangeHRM (OHRM) screens. Generate a spec for the exact OHRM screen(s) where this feature would appear.

OrangeHRM screen reference (use these names and flows):
- Leave: Leave List, Configure › Leave Period, Configure › Leave Type, Configure › Work Week, Configure › Holidays, Leave Entitlements, Leave Assign; fields like From Date, To Date, Leave Type, Employee, Days.
- Time: Employee Timesheets, My Timesheets, Projects, Project Activities, Attendance; fields like Date, Project, Activity, Duration, In/Out.
- Recruitment: Vacancies, Candidates, Add Candidate, Interview; fields like Vacancy, Candidate Name, Date of Application, Status, Interviewer.
- Admin: Organization › Locations, Organization › Units, Job › Job Titles, Job › Pay Grades, Qualifications › Education/Skills/Licenses, Nationalities; fields like Name, Description, Code.
- Reports: Report List, Run Report; fields like Report Name, Date From, Date To, Format (PDF/Excel).
- Dashboard: widgets like Pending Leave Requests, On Leave Today, Pending Approvals, etc.

Feature: ${featureName}
Module: ${mod}
Description: ${featureDescription || 'No description.'}

Return a mock UI spec that matches the REAL OrangeHRM screen for this feature. Use actual OHRM breadcrumbs (e.g. "Leave › Configure › Leave Period"), screen titles, and field names. Reply with ONLY valid JSON, no markdown:

{"config":{"breadcrumb":"Exact OHRM breadcrumb e.g. Leave › Configure › Leave Type","title":"Exact OHRM screen title","description":"One sentence as shown in OHRM","fields":[{"label":"Exact OHRM field label","type":"text|date|chip|chips","value":"example value"}]},"list":{"title":"Exact OHRM list screen title e.g. Leave List","columns":["OHRM column names"],"rows":[{"cells":["sample","values"]}]},"widgets":[{"title":"OHRM dashboard widget title","value":"number"}]}

Rules: config.fields 2-5; types: text, date, chip, chips. list: 3-5 columns, 2 sample rows. widgets: 2-4. Match real OHRM screens for this feature's module.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });
    const text = completion.choices[0]?.message?.content || '{}';
    const data = JSON.parse(text);
    const cfg = data.config || {};
    const list = data.list || {};
    const widgets = Array.isArray(data.widgets) ? data.widgets : [];
    return {
      config: {
        breadcrumb: cfg.breadcrumb || `${mod} › Configure › ${featureName}`,
        title: cfg.title || featureName,
        description: cfg.description || featureDescription || `Configure ${featureName}.`,
        fields: Array.isArray(cfg.fields) ? cfg.fields : [{ label: 'Name', type: 'text', value: featureName }],
      },
      list: {
        title: list.title || `${featureName} List`,
        columns: Array.isArray(list.columns) ? list.columns : ['Name', 'Status', 'Date'],
        rows: Array.isArray(list.rows) ? list.rows : [{ cells: ['Sample 1', 'Active', '01 Dec 2025'] }, { cells: ['Sample 2', 'Pending', '05 Dec 2025'] }],
      },
      widgets: widgets.slice(0, 4).map((w) => ({ title: String(w.title || '—'), value: String(w.value ?? '0') })),
    };
  } catch (e) {
    console.warn('Mock UI spec generation failed:', e.message);
    return fallback();
  }
}

/**
 * Use AI to match a dashboard feature to sheet "Feature" names from Sample Client Insights.
 * Returns the list of sheet feature names that refer to the same feature (handles different wording).
 */
export async function matchInsightsToFeature(featureName, featureDescription, sheetFeatureNames) {
  const names = [...new Set((sheetFeatureNames || []).map((s) => String(s).trim()).filter(Boolean))];
  if (names.length === 0) return [];
  if (!openai) return [];

  const prompt = `You are matching HR product feature names. The dashboard has this feature:
Name: ${featureName}
Description: ${featureDescription}

A separate "Client Insights" sheet has rows with these feature labels (exact strings from the sheet):
${names.map((n, i) => `${i + 1}. ${n}`).join('\n')}

Which of those sheet labels (by number) refer to THE SAME feature as the dashboard feature above? Include every label that describes the same capability, even if worded differently (e.g. "Leave Blackout Period" and "Blackout periods for leave"). Reply with a JSON object: { "matchNumbers": [1, 3, 5] } using the numbers from the list above. If none match, use { "matchNumbers": [] }. No other text.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });
    const text = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(text);
    const matchNumbers = Array.isArray(parsed.matchNumbers) ? parsed.matchNumbers : [];
    return matchNumbers
      .map((num) => {
        const idx = Number(num);
        return idx >= 1 && idx <= names.length ? names[idx - 1] : null;
      })
      .filter(Boolean);
  } catch (e) {
    console.warn('matchInsightsToFeature failed:', e.message);
    return [];
  }
}

/**
 * Use AI to match insights by meaning: given a feature and full insight rows (with client + insight text),
 * return the 0-based indices of rows that are about this feature. Uses the meaning of the insight text,
 * not just the "Feature" label, so different wording still matches.
 */
export async function matchInsightsByMeaning(featureName, featureDescription, insightRows) {
  if (!openai || !insightRows?.length) return [];

  const list = insightRows.slice(0, 80).map((r, i) => {
    const feat = (r.feature || '').trim() || '—';
    const client = (r.client || '').trim() || '—';
    const insight = (r.insight || '').trim().slice(0, 400) || '—';
    return `[${i}] Feature: ${feat} | Client: ${client} | Insight: ${insight}`;
  }).join('\n');

  const prompt = `You are matching client insights to an HR product feature by meaning.

Dashboard feature:
Name: ${featureName}
Description: ${featureDescription}

Below are rows from a "Client Insights" sheet. Each row has: Feature (label), Client, Insight (quote from a client). Decide which rows are about THE SAME feature/capability as the dashboard feature above, using the meaning of the Insight text (not only the Feature label). Include every row where the client is clearly talking about this capability.

Rows (index in brackets):
${list}

Reply with a JSON object: { "matchIndices": [0, 1, 3] } — the 0-based indices of rows that match. If none match, use { "matchIndices": [] }. No other text.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });
    const text = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(text);
    const indices = Array.isArray(parsed.matchIndices) ? parsed.matchIndices : [];
    return indices
      .map((i) => Number(i))
      .filter((i) => i >= 0 && i < insightRows.length);
  } catch (e) {
    console.warn('matchInsightsByMeaning failed:', e.message);
    return [];
  }
}

/**
 * "Are We Solving The Right Problem?" – Evaluate a feature request with 3 questions.
 * Returns verdict label + answers and suggested next steps for BAs.
 */
export async function generateVerdict(featureName, featureDescription = '') {
  const stub = () => ({
    verdict: 'Review',
    problemReal: 'Not assessed (add OPENAI_API_KEY for AI verdict).',
    wellUnderstood: '—',
    rightTime: '—',
    nextSteps: 'Configure OpenAI to get an assessment.',
  });
  if (!openai) return stub();

  const prompt = `You are a product/Business Analysis advisor. Evaluate this feature request using "Are We Solving The Right Problem?" — answer these 3 questions and give a verdict.

Feature: ${featureName}
Description: ${featureDescription || 'No description provided.'}

1. Is there a real problem here? (Yes/No/Unclear + 1–2 sentence explanation)
2. Is it well enough understood to scope? (Yes/No/Unclear + 1–2 sentence explanation)
3. Is it the right time to solve it? (Yes/No/Unclear + 1–2 sentence explanation)

Then set a verdict: "Clear to proceed" (all three are clearly Yes), "Needs clarity" (one or more Unclear/No that BAs can resolve), or "Not right time" (right time is No). Suggest 1–3 concrete next steps for BAs.

Reply with JSON only:
{
  "verdict": "Clear to proceed" | "Needs clarity" | "Not right time",
  "problemReal": "your answer for question 1",
  "wellUnderstood": "your answer for question 2",
  "rightTime": "your answer for question 3",
  "nextSteps": "1. ... 2. ... 3. ..."
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });
    const text = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(text);
    return {
      verdict: String(parsed.verdict || 'Review').trim(),
      problemReal: String(parsed.problemReal || '—').trim(),
      wellUnderstood: String(parsed.wellUnderstood || '—').trim(),
      rightTime: String(parsed.rightTime || '—').trim(),
      nextSteps: String(parsed.nextSteps || '—').trim(),
    };
  } catch (e) {
    console.warn('generateVerdict failed:', e.message);
    return stub();
  }
}
