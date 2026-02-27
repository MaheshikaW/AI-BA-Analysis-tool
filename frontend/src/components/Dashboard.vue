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
        <span class="sheet-note">Data from Google Sheet — edit the sheet to add or change features.</span>
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
    <table v-else class="table">
      <thead>
        <tr>
          <th>Module</th>
          <th>Feature Name</th>
          <th>Feature Description</th>
          <th>Client Tiers</th>
          <th class="num">Number of Client Requests</th>
          <th>Requested Client(s)</th>
          <th class="num">Score</th>
          <th>Point of Contact</th>
          <th class="actions-col">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="f in features" :key="f.id">
          <td>{{ f.module || '—' }}</td>
          <td><strong>{{ f.name }}</strong></td>
          <td class="desc">{{ f.description || '—' }}</td>
          <td class="tiers">{{ formatClientTiers(f.tier_breakdown) }}</td>
          <td class="num">{{ f.total_requests ?? 0 }}</td>
          <td class="requested-clients">{{ f.requested_clients || '—' }}</td>
          <td class="num">{{ formatScore(f.weighted_score) }}</td>
          <td>{{ f.point_of_contact || '—' }}</td>
          <td class="actions-col">
            <div class="action-btns">
              <button class="btn-action btn-insights" @click="requestInsights(f)" :disabled="insightsLoading === f.id">
                {{ insightsLoading === f.id ? '…' : 'Customer insights' }}
              </button>
              <button class="btn-action btn-competitor" @click="requestCompetitorAnalysis(f)" :disabled="analysisLoading === f.id">
                {{ analysisLoading === f.id ? '…' : 'Competitor analysis' }}
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <CompetitorModal
      v-if="competitorResult"
      :result="competitorResult"
      @close="competitorResult = null"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import * as api from '../api';
import CompetitorModal from './CompetitorModal.vue';

const features = ref([]);
const modules = ref([]);
const loading = ref(true);
const error = ref('');
const filterModule = ref('');
const sort = ref('score');
const recalculating = ref(false);
const insightsLoading = ref(null);
const analysisLoading = ref(null);
const competitorResult = ref(null);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const params = {};
    if (filterModule.value) params.module = filterModule.value;
    if (sort.value) params.sort = sort.value;
    features.value = await api.getFeatures(params);
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
    error.value = e.message || 'Failed to load';
  } finally {
    loading.value = false;
  }
}

function formatScore(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(1) : '0';
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

async function requestInsights(f) {
  insightsLoading.value = f.id;
  try {
    const result = await api.requestCustomerInsights(f.id);
    if (result.stub) alert('Customer Insights: stub. Configure Google API to create real docs.');
    else if (result.docUrl) window.open(result.docUrl);
  } catch (e) {
    error.value = e.message || 'Request failed';
  } finally {
    insightsLoading.value = null;
  }
}

async function requestCompetitorAnalysis(f) {
  analysisLoading.value = f.id;
  competitorResult.value = null;
  try {
    const result = await api.requestCompetitorAnalysis(f.id);
    competitorResult.value = { feature: f, ...result };
  } catch (e) {
    error.value = e.message || 'Analysis failed';
  } finally {
    analysisLoading.value = null;
  }
}

onMounted(load);
</script>

<style scoped>
.dashboard { display: flex; flex-direction: column; gap: 1rem; }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; }
.filters { display: flex; gap: 0.5rem; }
.filters select { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 0.5rem 0.75rem; border-radius: var(--radius); font-size: 0.9rem; }
.actions { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.sheet-note { font-size: 0.8rem; color: var(--muted); }
.btn { padding: 0.5rem 1rem; border-radius: var(--radius); font-weight: 600; font-size: 0.875rem; cursor: pointer; border: none; font-family: inherit; }
.btn.primary { background: var(--accent); color: #fff; }
.btn.primary:hover { background: var(--accent-dim); }
.btn.secondary { background: var(--surface); color: var(--text); border: 1px solid var(--border); }
.btn.secondary:hover { background: var(--border); }
.btn.small { padding: 0.35rem 0.6rem; font-size: 0.8rem; }
.btn.accent { background: var(--accent); color: #fff; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
.action-btns { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
.btn-action { padding: 0.5rem 0.85rem; font-size: 0.8rem; font-weight: 600; border-radius: 8px; cursor: pointer; border: none; font-family: inherit; white-space: nowrap; transition: background 0.15s, color 0.15s; }
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
.table { width: 100%; border-collapse: collapse; background: var(--surface); border-radius: var(--radius); overflow: hidden; }
.table th, .table td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid var(--border); }
.table th { background: rgba(0,0,0,0.2); font-weight: 600; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
.table .num { text-align: right; }
.table .desc { max-width: 420px; min-width: 200px; white-space: normal; line-height: 1.4; }
.table .tiers { font-size: 0.85rem; color: var(--muted); max-width: 180px; }
.table .requested-clients { max-width: 200px; font-size: 0.9rem; }
.table .actions-col { min-width: 260px; }
.table .actions-col .action-btns { max-width: 100%; }
</style>
