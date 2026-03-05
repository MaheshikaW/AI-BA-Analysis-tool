<template>
  <div class="dashboard">
    <div class="toolbar">
      <div class="filters">
        <select v-model="filterModule" @change="load">
          <option value="">All modules</option>
          <option v-for="m in modules" :key="m" :value="m">{{ m }}</option>
        </select>
        <select v-model="sort" @change="load">
          <option value="score">Sort by score</option>
          <option value="name">Sort by name</option>
          <option value="module">Sort by module</option>
        </select>
      </div>
      <div class="actions">
        <button class="btn secondary" @click="recalculateScores" :disabled="recalculating">
          {{ recalculating ? '…' : 'Refresh' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="message error">{{ error }}</div>
    <div v-if="loading" class="loading">Loading…</div>
    <div v-else-if="!features.length" class="empty">
      No features in the sheet, or sheet could not be loaded. Publish the Google Sheet to web (File → Share → Publish to web).
    </div>
    <div v-else>
    <div class="table-wrap">
    <table class="table">
      <thead>
        <tr>
          <th class="num">ID</th>
          <th>Module</th>
          <th>Feature Name</th>
          <th>Feature Description</th>
          <th>Client Tiers</th>
          <th class="num">Number of Client Requests</th>
          <th>Requested Client(s)</th>
          <th class="num">Score</th>
          <th>Verdict</th>
          <th>Point of Contact</th>
          <th class="actions-col">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="f in paginatedFeatures" :key="f.id">
          <td class="num">{{ f.id }}</td>
          <td>{{ f.module || '—' }}</td>
          <td><strong>{{ f.name }}</strong></td>
          <td class="desc-cell" :title="f.description || '—'"><span class="desc">{{ f.description || '—' }}</span></td>
          <td class="tiers-cell" :title="formatClientTiers(f.tier_breakdown)"><span class="tiers">{{ formatClientTiers(f.tier_breakdown) }}</span></td>
          <td class="num">{{ f.total_requests ?? 0 }}</td>
          <td class="requested-cell" :title="f.requested_clients || '—'"><span class="requested-clients">{{ f.requested_clients || '—' }}</span></td>
          <td class="num">{{ formatScore(f.weighted_score) }}</td>
          <td class="verdict-cell">
            <button type="button" class="btn-verdict" :class="getVerdictClass(f.id)" @click="openVerdictModal(f)">
              {{ verdictLabels[f.id] || 'Assess' }}
            </button>
          </td>
          <td>{{ f.point_of_contact || '—' }}</td>
          <td class="actions-col">
            <div class="action-btns">
              <button type="button" class="btn-action btn-insights" @click="openInsightsModal(f)">
                Customer insights
              </button>
              <button class="btn-action btn-competitor" @click="goToCompetitorAnalysis(f)">
                Competitor analysis
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    </div>
    <div v-if="features.length > 0" class="pagination">
      <span class="pagination-info">Showing {{ paginationFrom }}–{{ paginationTo }} of {{ features.length }}</span>
      <div class="pagination-btns">
        <button class="btn small" :disabled="currentPage <= 1" @click="currentPage = 1">First</button>
        <button class="btn small" :disabled="currentPage <= 1" @click="currentPage--">Previous</button>
        <span class="pagination-page">Page {{ currentPage }} of {{ totalPages }}</span>
        <button class="btn small" :disabled="currentPage >= totalPages" @click="currentPage++">Next</button>
        <button class="btn small" :disabled="currentPage >= totalPages" @click="currentPage = totalPages">Last</button>
      </div>
    </div>
    </div>
  </div>

  <!-- Customer insights modal -->
  <div v-if="insightsModalOpen" class="modal-overlay" @click.self="closeInsightsModal">
    <div class="modal-card">
      <div class="modal-header">
        <h3>{{ insightsModalFeature?.name || '…' }}</h3>
        <button type="button" class="modal-close" aria-label="Close" @click="closeInsightsModal">×</button>
      </div>
      <div class="modal-body">
        <div v-if="insightsModalLoading" class="modal-loading">Loading…</div>
        <div v-else class="insights-list">
          <div v-for="(item, i) in insightsModalInsights" :key="i" class="insight-item">
            <strong class="insight-client">{{ item.client || '—' }}</strong>
            <p class="insight-text">{{ item.insight }}</p>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <a
          v-if="insightsModalFeature"
          :href="`/api/features/${insightsModalFeature.id}/customer-insights-html`"
          target="_blank"
          rel="noopener noreferrer"
          class="btn primary"
        >Export</a>
      </div>
    </div>
  </div>

  <!-- Verdict modal (Are We Solving The Right Problem?) -->
  <div v-if="verdictModalOpen" class="modal-overlay" @click.self="closeVerdictModal">
    <div class="modal-card verdict-modal">
      <div class="modal-header">
        <h3>Verdict – {{ verdictModalFeature?.name || '…' }}</h3>
        <button type="button" class="modal-close" aria-label="Close" @click="closeVerdictModal">×</button>
      </div>
      <div class="modal-body">
        <div v-if="verdictModalLoading" class="modal-loading">Assessing…</div>
        <template v-else-if="verdictModalData">
          <p class="verdict-label" :class="getVerdictClassFromLabel(verdictModalData.verdict)">
              <strong>Verdict:</strong> {{ verdictModalData.verdict }}
            </p>
          <div class="verdict-questions">
            <div class="verdict-q"><strong>1. Is there a real problem here?</strong><p>{{ verdictModalData.problemReal }}</p></div>
            <div class="verdict-q"><strong>2. Is it well enough understood to scope?</strong><p>{{ verdictModalData.wellUnderstood }}</p></div>
            <div class="verdict-q"><strong>3. Is it the right time to solve it?</strong><p>{{ verdictModalData.rightTime }}</p></div>
          </div>
          <div class="verdict-next-steps">
            <strong>Suggested next steps for BAs:</strong>
            <p class="next-steps-text">{{ verdictModalData.nextSteps }}</p>
          </div>
        </template>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn secondary" @click="closeVerdictModal">Close</button>
        <button type="button" class="btn secondary" @click="refreshVerdictModal" :disabled="verdictModalLoading">Re-assess</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { navigate } from '../router/index.js';
import * as api from '../api';

const features = ref([]);
const modules = ref([]);
const loading = ref(true);
const error = ref('');
const filterModule = ref('');
const sort = ref('score');
const recalculating = ref(false);
const insightsModalOpen = ref(false);
const insightsModalFeature = ref(null);
const insightsModalInsights = ref([]);
const insightsModalMeta = ref(null);
const insightsModalLoading = ref(false);

const verdictModalOpen = ref(false);
const verdictModalFeature = ref(null);
const verdictModalData = ref(null);
const verdictModalLoading = ref(false);
/** Full verdict payload by feature id (for modal content). */
const verdictCache = ref({});
/** Verdict label only by feature id – used for button text so Vue tracks updates. */
const verdictLabels = ref({});

const PAGE_SIZE = 10;
const currentPage = ref(1);

const totalPages = computed(() => Math.max(1, Math.ceil(features.value.length / PAGE_SIZE)));
const paginatedFeatures = computed(() => {
  const list = features.value;
  const start = (currentPage.value - 1) * PAGE_SIZE;
  return list.slice(start, start + PAGE_SIZE);
});
const paginationFrom = computed(() => (currentPage.value - 1) * PAGE_SIZE + 1);
const paginationTo = computed(() => Math.min(currentPage.value * PAGE_SIZE, features.value.length));

/** Poll interval (ms) to refetch from sheet so daily updates appear without manual refresh. */
const SHEET_POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes
let sheetPollTimer = null;

async function load(silent = false) {
  if (!silent) loading.value = true;
  if (!silent) error.value = '';
  try {
    const params = {};
    if (filterModule.value) params.module = filterModule.value;
    if (sort.value) params.sort = sort.value;
    features.value = await api.getFeatures(params);
    currentPage.value = 1;
    if (!modules.value.length) {
      try {
        modules.value = await api.getModules();
      } catch {
        modules.value = [...new Set(features.value.map((f) => f.module).filter(Boolean))].sort();
      }
    }
    if (!modules.value.length && features.value.length) {
      modules.value = [...new Set(features.value.map((f) => f.module).filter(Boolean))].sort();
    }
  } catch (e) {
    if (!silent) error.value = e.message || 'Failed to load';
  } finally {
    if (!silent) loading.value = false;
  }
  fetchVerdictsForCurrentPage();
}

/** Fetch verdict for one feature and update cache/labels (no modal). */
function fetchAndCacheVerdict(featureId) {
  const key = String(featureId);
  if (verdictLabels.value[key]) return Promise.resolve();
  return api.getFeatureVerdict(featureId).then((data) => {
    const label = (data && data.verdict) ? String(data.verdict).trim() : null;
    if (label) {
      verdictCache.value[key] = data;
      verdictLabels.value = { ...verdictLabels.value, [key]: label };
    }
  }).catch(() => {});
}

/** Pre-fetch verdicts for all features on the current page. */
function fetchVerdictsForCurrentPage() {
  const list = paginatedFeatures.value;
  list.forEach((f) => fetchAndCacheVerdict(f.id));
}

function startSheetPolling() {
  sheetPollTimer = setInterval(() => load(true), SHEET_POLL_INTERVAL);
}

function stopSheetPolling() {
  if (sheetPollTimer) {
    clearInterval(sheetPollTimer);
    sheetPollTimer = null;
  }
}

function formatScore(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(1) : '0';
}

/** CSS class for verdict button/label color from verdict text. */
function getVerdictClassFromLabel(label) {
  const s = (label || '').toLowerCase();
  if (s.includes('clear to proceed')) return 'verdict-clear';
  if (s.includes('needs clarity')) return 'verdict-needs-clarity';
  if (s.includes('not right time')) return 'verdict-not-right-time';
  if (s.includes('review')) return 'verdict-review';
  return 'verdict-assess';
}
function getVerdictClass(featureId) {
  return getVerdictClassFromLabel(verdictLabels.value[featureId]);
}

function openVerdictModal(f) {
  verdictModalFeature.value = f;
  verdictModalOpen.value = true;
  const key = String(f.id);
  verdictModalData.value = verdictCache.value[key] || null;
  verdictModalLoading.value = true;
  api.getFeatureVerdict(f.id)
    .then((data) => {
      verdictModalData.value = data;
      const label = (data && data.verdict) ? String(data.verdict).trim() : null;
      if (label) {
        verdictCache.value[key] = data;
        verdictLabels.value = { ...verdictLabels.value, [key]: label };
      }
    })
    .catch(() => {
      verdictModalData.value = null;
    })
    .finally(() => {
      verdictModalLoading.value = false;
    });
}

function closeVerdictModal() {
  verdictModalOpen.value = false;
  verdictModalFeature.value = null;
  verdictModalData.value = null;
}

function refreshVerdictModal() {
  if (!verdictModalFeature.value) return;
  const key = String(verdictModalFeature.value.id);
  verdictModalLoading.value = true;
  api.getFeatureVerdict(verdictModalFeature.value.id, true)
    .then((data) => {
      verdictModalData.value = data;
      const label = (data && data.verdict) ? String(data.verdict).trim() : null;
      if (label) {
        verdictCache.value[key] = data;
        verdictLabels.value = { ...verdictLabels.value, [key]: label };
      }
    })
    .finally(() => {
      verdictModalLoading.value = false;
    });
}

function formatClientTiers(tierBreakdown) {
  if (!tierBreakdown) return '—';
  try {
    const o = typeof tierBreakdown === 'string' ? JSON.parse(tierBreakdown) : tierBreakdown;
    const parts = Object.entries(o).map(([tier, data]) => {
      const reqs = data?.requests ?? data;
      return `${tier} (${reqs})`;
    });
    return parts.length ? parts.join(', ') : '—';
  } catch {
    return '—';
  }
}

async function recalculateScores() {
  recalculating.value = true;
  try {
    await api.recalculateScores();
    await load();
  } catch (e) {
    error.value = e.message || 'Refresh failed';
  } finally {
    recalculating.value = false;
  }
}

async function openInsightsModal(f) {
  insightsModalFeature.value = f;
  insightsModalOpen.value = true;
  insightsModalInsights.value = [];
  insightsModalLoading.value = true;
  try {
    const data = await api.getFeatureInsights(f.id, true);
    insightsModalInsights.value = data.insights || [];
    insightsModalMeta.value = data._meta || null;
  } catch (e) {
    insightsModalInsights.value = [];
    insightsModalMeta.value = null;
    error.value = e.message || 'Could not load insights';
  } finally {
    insightsModalLoading.value = false;
  }
}

async function refreshInsightsModal() {
  if (!insightsModalFeature.value) return;
  insightsModalLoading.value = true;
  try {
    const data = await api.getFeatureInsights(insightsModalFeature.value.id, true);
    insightsModalInsights.value = data.insights || [];
    insightsModalMeta.value = data._meta || null;
    error.value = '';
  } catch (e) {
    insightsModalInsights.value = [];
    insightsModalMeta.value = null;
    error.value = e.message || 'Could not load insights';
  } finally {
    insightsModalLoading.value = false;
  }
}

function closeInsightsModal() {
  insightsModalOpen.value = false;
  insightsModalFeature.value = null;
  insightsModalInsights.value = [];
  insightsModalMeta.value = null;
}

function goToCompetitorAnalysis(f) {
  navigate(`/feature/${f.id}/competitor-analysis`);
}


watch(currentPage, fetchVerdictsForCurrentPage);

onMounted(() => {
  load();
  startSheetPolling();
});
onUnmounted(stopSheetPolling);
</script>

<style scoped>
.dashboard { display: flex; flex-direction: column; gap: 1rem; }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; }
.filters { display: flex; gap: 0.5rem; }
.filters select { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 0.5rem 0.75rem; border-radius: var(--radius); font-size: 0.9rem; }
.actions { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.btn { padding: 0.5rem 1rem; border-radius: var(--radius); font-weight: 600; font-size: 0.875rem; cursor: pointer; border: none; font-family: inherit; }
.btn.primary { background: var(--accent); color: #fff; }
.btn.primary:hover { background: var(--accent-dim); }
.btn.secondary { background: var(--surface); color: var(--text); border: 1px solid var(--border); }
.btn.secondary:hover { background: var(--border); }
.btn.small { padding: 0.35rem 0.6rem; font-size: 0.8rem; }
.btn.accent { background: var(--accent); color: #fff; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.action-btns { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
.btn-action { padding: 0.5rem 0.85rem; font-size: 0.8rem; font-weight: 600; border-radius: 8px; cursor: pointer; border: none; font-family: inherit; white-space: nowrap; transition: background 0.15s, color 0.15s; text-decoration: none; display: inline-block; }
a.btn-action { color: inherit; }
.btn-action:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-request { background: var(--surface); color: var(--text); border: 1px solid var(--border); }
.btn-request:hover:not(:disabled) { background: var(--border); }
.btn-insights { background: transparent; color: var(--muted); border: 1px solid var(--border); }
.btn-insights:hover:not(:disabled) { color: var(--text); background: rgba(255,255,255,0.05); }
.btn-competitor { background: var(--accent); color: #fff; }
.btn-competitor:hover:not(:disabled) { background: var(--accent-dim); }
.message { padding: 0.75rem; border-radius: var(--radius); }
.message.error { background: rgba(239,68,68,0.15); color: #fca5a5; }
.loading, .empty { color: var(--muted); padding: 2rem; text-align: center; }
.table-wrap { width: 100%; }
.table { width: 100%; border-collapse: collapse; background: var(--surface); border-radius: var(--radius); overflow: hidden; table-layout: fixed; }
.table th, .table td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid var(--border); overflow: hidden; }
.table th { background: rgba(0,0,0,0.2); font-weight: 600; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
.table .num { text-align: right; }
.table th:nth-child(1) { width: 4%; }   /* ID */
.table th:nth-child(2) { width: 6%; }   /* Module */
.table th:nth-child(3) { width: 11%; }  /* Feature Name */
.table th:nth-child(4) { width: 28%; }  /* Feature Description */
.table th:nth-child(5) { width: 9%; }  /* Client Tiers */
.table th:nth-child(6) { width: 5%; }   /* Number of Client Requests */
.table th:nth-child(7) { width: 13%; }  /* Requested Client(s) */
.table th:nth-child(8) { width: 4%; }   /* Score */
.table th:nth-child(9) { width: 10%; }  /* Verdict */
.table th:nth-child(10) { width: 7%; }  /* Point of Contact */
.table th:nth-child(11) { width: 13%; }  /* Actions */
.verdict-cell { overflow: hidden; }
.btn-verdict { padding: 0.35rem 0.6rem; font-size: 0.8rem; border-radius: 6px; cursor: pointer; font-family: inherit; white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; border: 1px solid transparent; font-weight: 500; }
.btn-verdict:hover { filter: brightness(1.1); }
.btn-verdict.verdict-assess { background: transparent; color: var(--muted); border-color: var(--border); }
.btn-verdict.verdict-assess:hover { color: var(--text); background: rgba(255,255,255,0.05); }
.btn-verdict.verdict-clear { background: rgba(34,197,94,0.2); color: #86efac; border-color: rgba(34,197,94,0.4); }
.btn-verdict.verdict-needs-clarity { background: rgba(245,158,11,0.2); color: #fcd34d; border-color: rgba(245,158,11,0.4); }
.btn-verdict.verdict-not-right-time { background: rgba(239,68,68,0.2); color: #fca5a5; border-color: rgba(239,68,68,0.4); }
.btn-verdict.verdict-review { background: rgba(148,163,184,0.2); color: #cbd5e1; border-color: rgba(148,163,184,0.4); }
.table .desc-cell { overflow: hidden; }
.table .desc { display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; cursor: help; line-height: 1.4; word-break: break-word; }
.table .tiers-cell { overflow: hidden; cursor: help; }
.table .tiers { font-size: 0.85rem; color: var(--muted); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; line-height: 1.35; }
.table .requested-cell { overflow: hidden; cursor: help; }
.table .requested-clients { font-size: 0.9rem; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; line-height: 1.35; }
.table .actions-col .action-btns { max-width: 100%; }
.pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; margin-top: 1rem; padding: 0.75rem 0; border-top: 1px solid var(--border); }
.pagination-info { font-size: 0.9rem; color: var(--muted); }
.pagination-btns { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.pagination-page { font-size: 0.9rem; color: var(--muted); padding: 0 0.5rem; }

/* Customer insights modal */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1rem; }
.modal-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; max-width: 560px; width: 100%; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 20px 40px rgba(0,0,0,0.3); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); }
.modal-header h3 { margin: 0; font-size: 1.1rem; font-weight: 600; color: var(--text); }
.modal-close { background: none; border: none; font-size: 1.5rem; line-height: 1; color: var(--muted); cursor: pointer; padding: 0.25rem; }
.modal-close:hover { color: var(--text); }
.modal-body { padding: 1.25rem; overflow-y: auto; flex: 1; }
.modal-loading { color: var(--muted); text-align: center; padding: 1.5rem; }
.modal-empty { color: var(--muted); margin: 0; font-size: 0.9rem; }
.modal-empty .btn-link { background: none; border: none; padding: 0; color: var(--accent); cursor: pointer; text-decoration: underline; font-size: inherit; font-family: inherit; }
.modal-empty .btn-link:hover { color: var(--text); }
.insights-list { display: flex; flex-direction: column; gap: 1rem; }
.insight-item { padding: 0.75rem; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid var(--border); }
.insight-client { display: block; font-size: 0.85rem; color: var(--accent); margin: 0 0 0.35rem 0; }
.insight-text { margin: 0; font-size: 0.9rem; line-height: 1.5; color: var(--text); }
.modal-footer { display: flex; gap: 0.75rem; justify-content: flex-end; padding: 1rem 1.25rem; border-top: 1px solid var(--border); }
.modal-footer .btn.primary { text-decoration: none; }

/* Verdict modal */
.verdict-modal .modal-card { max-width: 560px; }
.verdict-label { margin: 0 0 1rem 0; font-size: 1rem; padding: 0.5rem 0.75rem; border-radius: 8px; border-left: 4px solid var(--border); }
.verdict-label.verdict-clear { background: rgba(34,197,94,0.15); border-left-color: rgba(34,197,94,0.6); color: #86efac; }
.verdict-label.verdict-needs-clarity { background: rgba(245,158,11,0.15); border-left-color: rgba(245,158,11,0.6); color: #fcd34d; }
.verdict-label.verdict-not-right-time { background: rgba(239,68,68,0.15); border-left-color: rgba(239,68,68,0.6); color: #fca5a5; }
.verdict-label.verdict-review { background: rgba(148,163,184,0.15); border-left-color: rgba(148,163,184,0.5); color: #cbd5e1; }
.verdict-label.verdict-assess { border-left-color: var(--border); }
.verdict-questions { display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1.25rem; }
.verdict-q { padding: 0.75rem; background: rgba(255,255,255,0.03); border-radius: var(--radius); border-left: 3px solid var(--border); }
.verdict-q strong { display: block; margin-bottom: 0.35rem; font-size: 0.9rem; }
.verdict-q p { margin: 0; font-size: 0.9rem; color: var(--muted); line-height: 1.45; white-space: pre-wrap; }
.verdict-next-steps { padding: 0.75rem; background: rgba(249,115,22,0.08); border-radius: var(--radius); border-left: 3px solid var(--accent); }
.verdict-next-steps strong { font-size: 0.9rem; }
.next-steps-text { margin: 0.5rem 0 0 0; font-size: 0.9rem; color: var(--text); line-height: 1.5; white-space: pre-wrap; }
</style>
