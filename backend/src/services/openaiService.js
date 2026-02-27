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
 * Generate competitor analysis content for a feature (for Google Doc).
 */
export async function generateCompetitorAnalysis(featureName, featureDescription = '') {
  const mapping = await mapToCompetitorTerms(featureName, featureDescription);
  const terms = mapping.competitors || mapping.stub ? mapping.competitors : {};

  if (!openai) {
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

  const prompt = `For the OrangeHRM feature "${featureName}" (${featureDescription}), and the competitor terms below:
1. Write 1-2 sentences per competitor on how that product implements this capability. Be factual and concise.
2. For EACH competitor you MUST provide: helpArticleTitle (a short title for the relevant help/doc page, e.g. "Time off restrictions"), helpSearchQuery (a search phrase to find that doc, e.g. "BambooHR time off restrictions site:help.bamboohr.com" or "Workday leave blackout documentation"). If you know the exact official help URL, set helpArticleUrl (https only); otherwise use empty string "" for helpArticleUrl. Never leave helpArticleTitle or helpSearchQuery empty — always give a search query so users can find the article.
3. Add a "similarities" array: 2-5 short bullet points on how OrangeHRM and these competitors are similar for this feature (common concepts, UX, or capabilities).
4. Add a "differences" array: 2-5 short bullet points on how OrangeHRM and these competitors differ (scope, configuration, terminology, or limitations).

Competitor terms:
${Object.entries(terms).map(([c, t]) => `${c}: ${t}`).join('\n')}

Reply in JSON only. You MUST include "similarities" and "differences" arrays first, then "competitors":
{ "similarities": ["point 1", "point 2", "point 3"], "differences": ["point 1", "point 2", "point 3"], "competitors": [
  { "name": "BambooHR", "term": "...", "howItWorks": "...", "helpArticleTitle": "Doc page title", "helpArticleUrl": "https://... or \"\"", "helpSearchQuery": "BambooHR [feature] documentation" }
] }
Required: similarities (array of 2-5 strings), differences (array of 2-5 strings), and for each competitor: helpArticleTitle, helpSearchQuery.`;

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
