<template>
  <div class="competitor-page">
    <div class="page-header">
      <a href="#/" class="back-link">← Back to feature list</a>
      <h2>{{ feature?.name || '…' }}</h2>
    </div>

    <div v-if="loading" class="loading">
      <p>Running competitor analysis…</p>
      <p class="loading-hint">First time can take 20–60 seconds (AI). Repeat views load from cache.</p>
    </div>
    <div v-else-if="error" class="message error">{{ error }}</div>
    <div v-else>
      <!-- OXD-style mock UI: Feature summary -->
      <div v-if="feature" class="feature-mock-oxd">
        <div class="feature-mock-card">
          <div class="feature-mock-header">
            <span class="feature-mock-badge">Feature</span>
            <h3 class="feature-mock-title">{{ feature.name }}</h3>
          </div>
          <div class="feature-mock-meta">
            <span class="feature-mock-meta-item">
              <span class="feature-mock-label">Module</span>
              <span class="feature-mock-value">{{ feature.module || '—' }}</span>
            </span>
            <span class="feature-mock-meta-item">
              <span class="feature-mock-label">Score</span>
              <span class="feature-mock-value">{{ feature.weighted_score ?? feature.total_requests ?? 0 }}</span>
            </span>
            <span class="feature-mock-meta-item" v-if="feature.point_of_contact">
              <span class="feature-mock-label">Point of contact</span>
              <span class="feature-mock-value">{{ feature.point_of_contact }}</span>
            </span>
          </div>
          <p v-if="feature.description" class="feature-mock-desc">{{ feature.description }}</p>
          <div v-if="feature.requested_clients" class="feature-mock-footer">
            <span class="feature-mock-label">Requested client(s)</span>
            <span class="feature-mock-value">{{ feature.requested_clients }}</span>
          </div>
        </div>
      </div>

      <div class="tabs">
        <button
          type="button"
          class="tab"
          :class="{ active: activeTab === 'competitor' }"
          @click="activeTab = 'competitor'"
        >
          Competitor analysis
        </button>
        <button
          type="button"
          class="tab"
          :class="{ active: activeTab === 'use-case' }"
          @click="selectUseCaseTab"
        >
          Use case
        </button>
        <button
          type="button"
          class="tab"
          :class="{ active: activeTab === 'ui-example' }"
          @click="selectUIExampleTab"
        >
          Mock UI
        </button>
      </div>

      <div v-show="activeTab === 'competitor'" class="tab-panel analysis-content">
        <p v-if="result?.stub" class="stub-note">Stub output. Set OPENAI_API_KEY for real AI analysis.</p>
        <template v-else>
          <section v-if="result?.analysis">
            <h3>Similarities & differences vs competitors</h3>
            <div class="sim-diff">
              <strong>Similarities</strong>
              <ul v-if="result.analysis.similarities?.length"><li v-for="(s, i) in result.analysis.similarities" :key="i">{{ s }}</li></ul>
              <p v-else class="sim-diff-empty">No similarities generated. Run analysis again with OPENAI_API_KEY set.</p>
            </div>
            <div class="sim-diff">
              <strong>Differences</strong>
              <ul v-if="result.analysis.differences?.length"><li v-for="(d, i) in result.analysis.differences" :key="i">{{ d }}</li></ul>
              <p v-else class="sim-diff-empty">No differences generated. Run analysis again with OPENAI_API_KEY set.</p>
            </div>
          </section>
          <section v-if="result?.analysis?.competitors?.length">
            <h3>Competitor mapping, how it works & help links</h3>
            <table class="compact">
              <thead>
                <tr><th>Competitor</th><th>Term</th><th>How it works</th><th>Help / links</th></tr>
              </thead>
              <tbody>
                <tr v-for="c in result.analysis.competitors" :key="c.name">
                  <td><strong>{{ c.name }}</strong></td>
                  <td>{{ c.term || '—' }}</td>
                  <td>{{ c.howItWorks || '—' }}</td>
                  <td class="help-links">
                    <template v-if="c.helpArticleUrl">
                      <a :href="c.helpArticleUrl" target="_blank" rel="noopener noreferrer">{{ c.helpArticleTitle || 'Help article' }}</a>
                    </template>
                    <template v-else>
                      <a :href="'https://www.google.com/search?q=' + encodeURIComponent(c.helpSearchQuery || (c.name + ' ' + (c.term || '') + ' documentation'))" target="_blank" rel="noopener noreferrer">{{ c.helpArticleTitle || 'Search docs' }}</a>
                    </template>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
          <section v-else-if="result?.analysis?.competitors && typeof result.analysis.competitors === 'object'">
            <h3>Competitor terms (stub)</h3>
            <ul>
              <li v-for="(term, name) in result.analysis.competitors" :key="name"><strong>{{ name }}</strong>: {{ term }}</li>
            </ul>
          </section>
        </template>
      </div>

      <div v-show="activeTab === 'use-case'" class="tab-panel use-case-content oxd-mock">
        <div v-if="useCaseLoading" class="loading-inline">Loading use case…</div>
        <template v-else-if="useCase">
          <!-- OXD-style: Feature description widget -->
          <section v-if="feature?.description" class="oxd-widget">
            <div class="oxd-widget-header">
              <span class="oxd-widget-icon">📋</span>
              <h3>Feature description</h3>
            </div>
            <div class="oxd-widget-body">
              <p class="oxd-text">{{ feature.description }}</p>
            </div>
          </section>
          <!-- OXD-style: Use case widgets grid -->
          <div class="oxd-widgets-grid">
            <div class="oxd-widget">
              <div class="oxd-widget-header">
                <span class="oxd-widget-icon">🎯</span>
                <h3>Objective</h3>
              </div>
              <div class="oxd-widget-body">
                <p class="oxd-text">{{ useCase.objective || '—' }}</p>
              </div>
            </div>
            <div class="oxd-widget">
              <div class="oxd-widget-header">
                <span class="oxd-widget-icon">👥</span>
                <h3>Actors</h3>
              </div>
              <div class="oxd-widget-body">
                <p class="oxd-text">{{ useCase.actors || '—' }}</p>
              </div>
            </div>
            <div class="oxd-widget">
              <div class="oxd-widget-header">
                <span class="oxd-widget-icon">✓</span>
                <h3>Preconditions</h3>
              </div>
              <div class="oxd-widget-body">
                <p class="oxd-text">{{ useCase.preconditions || '—' }}</p>
              </div>
            </div>
            <div class="oxd-widget">
              <div class="oxd-widget-header">
                <span class="oxd-widget-icon">✔</span>
                <h3>Postconditions</h3>
              </div>
              <div class="oxd-widget-body">
                <p class="oxd-text">{{ useCase.postconditions || '—' }}</p>
              </div>
            </div>
            <div class="oxd-widget oxd-widget-full">
              <div class="oxd-widget-header">
                <span class="oxd-widget-icon">→</span>
                <h3>Basic flow</h3>
              </div>
              <div class="oxd-widget-body">
                <ol v-if="useCase.basicFlow?.length" class="oxd-flow-list">
                  <li v-for="(step, i) in useCase.basicFlow" :key="i">
                    <span class="oxd-step-num">{{ i + 1 }}</span>
                    <span>{{ step }}</span>
                  </li>
                </ol>
                <p v-else class="oxd-text muted">—</p>
              </div>
            </div>
            <div class="oxd-widget oxd-widget-full">
              <div class="oxd-widget-header">
                <span class="oxd-widget-icon">☑</span>
                <h3>Acceptance criteria</h3>
              </div>
              <div class="oxd-widget-body">
                <ul v-if="useCase.acceptanceCriteria?.length" class="oxd-criteria-list">
                  <li v-for="(c, i) in useCase.acceptanceCriteria" :key="i">{{ c }}</li>
                </ul>
                <p v-else class="oxd-text muted">—</p>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- UI example tab: OpenAI-generated mock UIs per feature -->
      <div v-show="activeTab === 'ui-example'" class="tab-panel ui-example-panel">
        <p class="ui-example-intro">Mock UIs for <strong>{{ feature?.name || 'this feature' }}</strong>, based on OrangeHRM screens (generated by OpenAI when available).</p>

        <div v-if="mockUILoading" class="loading-inline">Generating mock UI…</div>
        <div v-else-if="mockUIError" class="ui-example-error">
          <p>{{ mockUIError }}</p>
          <button type="button" class="ui-example-btn ui-example-btn-primary" @click="loadMockUI">Retry</button>
        </div>
        <template v-if="feature && displayMockSpec">
          <div class="ohrm-mock-section">
            <h4 class="ohrm-mock-section-title">1. Configuration</h4>
            <div class="ui-example-mock ohrm-mock-card">
              <div class="ui-example-screen-header">
                <span class="ui-example-breadcrumb">{{ displayMockSpec.config.breadcrumb }}</span>
                <h3 class="ui-example-screen-title">{{ displayMockSpec.config.title }}</h3>
                <p class="ui-example-screen-desc">{{ displayMockSpec.config.description }}</p>
              </div>
              <div class="ui-example-form">
                <div v-for="(field, idx) in displayMockSpec.config.fields" :key="idx" class="ui-example-field">
                  <label class="ui-example-label">{{ field.label }}</label>
                  <div v-if="field.type === 'chip'" class="ui-example-select-wrap">
                    <span class="ui-example-chip">{{ field.value }}</span>
                  </div>
                  <div v-else-if="field.type === 'chips'" class="ui-example-select-wrap">
                    <span v-for="(chip, i) in (Array.isArray(field.value) ? field.value : (typeof field.value === 'string' ? field.value.split(',') : [field.value]))" :key="i" class="ui-example-chip">{{ typeof chip === 'string' ? chip.trim() : chip }}</span>
                  </div>
                  <div v-else class="ui-example-input">{{ field.value }}</div>
                </div>
              </div>
              <div class="ui-example-actions">
                <button type="button" class="ui-example-btn ui-example-btn-primary">Save</button>
                <button type="button" class="ui-example-btn ui-example-btn-secondary">Cancel</button>
              </div>
            </div>
          </div>

          <div class="ohrm-mock-section">
            <h4 class="ohrm-mock-section-title">2. List view</h4>
            <div class="ui-example-mock ohrm-mock-card ohrm-mock-table-wrap">
              <div class="ui-example-screen-header ohrm-mock-list-header">
                <h3 class="ui-example-screen-title">{{ displayMockSpec.list.title }}</h3>
                <button type="button" class="ui-example-btn ui-example-btn-primary ohrm-mock-add-btn">Add</button>
              </div>
              <div class="ohrm-mock-toolbar">
                <div class="ui-example-input ohrm-mock-search" style="max-width:200px;">Search…</div>
              </div>
              <table class="ohrm-mock-table">
                <thead>
                  <tr>
                    <th v-for="(col, i) in displayMockSpec.list.columns" :key="i">{{ col }}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, ri) in displayMockSpec.list.rows" :key="ri">
                    <td v-for="(cell, ci) in row.cells" :key="ci">{{ cell }}</td>
                    <td><a href="#" class="ohrm-mock-link">Edit</a></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="ohrm-mock-section">
            <h4 class="ohrm-mock-section-title">3. Dashboard widgets</h4>
            <div class="ohrm-mock-widgets">
              <div v-for="(w, i) in displayMockSpec.widgets" :key="i" class="ohrm-mock-widget">
                <div class="ohrm-mock-widget-title">{{ w.title }}</div>
                <div class="ohrm-mock-widget-value">{{ w.value }}</div>
              </div>
            </div>
          </div>
        </template>

        <p class="ui-example-footer">Generated by OpenAI. Based on <a href="https://oxd-int-infinity.orangehrm.com/" target="_blank" rel="noopener noreferrer">OXD</a>. Real UI may vary.</p>
      </div>

      <div class="page-actions">
        <button class="btn secondary" :disabled="pdfLoading || !feature" @click="exportThisFeaturePdf">
          {{ pdfLoading ? 'Preparing…' : 'Export (PDF)' }}
        </button>
        <a href="#/" class="btn primary">Back to list</a>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import * as api from '../api';

const props = defineProps({ id: { type: [String, Number], required: true } });
const feature = ref(null);
const result = ref(null);

const loading = ref(true);
const error = ref('');
const activeTab = ref('competitor');
const pdfLoading = ref(false);
const useCase = ref(null);
const useCaseLoading = ref(false);
const mockUISpec = ref(null);
const mockUILoading = ref(false);
const mockUIError = ref('');

/** Use API spec or build fallback from feature so UI always has something to show */
const displayMockSpec = computed(() => {
  const f = feature.value;
  if (mockUISpec.value && mockUISpec.value.config && mockUISpec.value.list && mockUISpec.value.widgets) {
    return mockUISpec.value;
  }
  if (!f) return null;
  const mod = f.module || 'Module';
  return {
    config: {
      breadcrumb: `${mod} › Configure › ${f.name}`,
      title: f.name,
      description: f.description || `Configure ${f.name} in OrangeHRM.`,
      fields: [
        { label: 'Name', type: 'text', value: f.name },
        { label: 'Status', type: 'chip', value: 'Active' },
        ...(f.point_of_contact ? [{ label: 'Point of contact', type: 'text', value: f.point_of_contact }] : []),
      ],
    },
    list: {
      title: `${f.name} List`,
      columns: ['Name', mod, 'Status', 'Date'],
      rows: [
        { cells: ['Sample 1', mod, 'Active', '01 Dec 2025'] },
        { cells: ['Sample 2', mod, 'Pending', '05 Dec 2025'] },
      ],
    },
    widgets: [
      { title: `Total ${f.name}`, value: '24' },
      { title: 'Active', value: '18' },
      { title: 'Pending', value: '6' },
    ],
  };
});

async function load() {
  const id = Number(props.id);
  if (!id) return;
  loading.value = true;
  error.value = '';
  result.value = null;
  feature.value = null;
  useCase.value = null;
  mockUISpec.value = null;
  mockUIError.value = '';
  activeTab.value = 'competitor';
  try {
    const [featureRes, analysisRes] = await Promise.all([
      api.getFeature(id),
      api.getCompetitorAnalysis(id),
    ]);
    feature.value = featureRes;
    result.value = analysisRes;
  } catch (e) {
    error.value = e.message || 'Failed to load analysis';
  } finally {
    loading.value = false;
  }
}

async function loadUseCase() {
  const id = Number(props.id);
  if (!id) return;
  useCaseLoading.value = true;
  try {
    const data = await api.getUseCase(id);
    useCase.value = data.useCase || null;
  } catch {
    useCase.value = null;
  } finally {
    useCaseLoading.value = false;
  }
}

function selectUseCaseTab() {
  activeTab.value = 'use-case';
  if (useCase.value == null && !useCaseLoading.value) loadUseCase();
}

async function loadMockUI() {
  const id = Number(props.id);
  if (!id || !feature.value) return;
  mockUILoading.value = true;
  mockUIError.value = '';
  mockUISpec.value = null;
  try {
    mockUISpec.value = await api.getMockUI(id);
  } catch (e) {
    mockUISpec.value = null;
    mockUIError.value = e.message || 'Could not load mock UI. You can retry or use the fallback below.';
  } finally {
    mockUILoading.value = false;
  }
}

function selectUIExampleTab() {
  activeTab.value = 'ui-example';
  if (mockUISpec.value == null && !mockUILoading.value) loadMockUI();
}

async function exportThisFeaturePdf() {
  if (!feature.value) return;
  pdfLoading.value = true;
  try {
    const competitorAnalysis = result.value?.analysis || null;
    const { html } = await api.getUseCaseDocument(feature.value.id, competitorAnalysis);
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;width:100%;height:100%;top:0;left:0;border:none;z-index:99999;';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      alert('Could not open print preview.');
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
    iframe.contentWindow?.focus();
    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 500);
    }, 300);
  } catch (e) {
    alert(e.message || 'Export failed');
  } finally {
    pdfLoading.value = false;
  }
}

watch(() => props.id, load);
onMounted(load);
</script>

<style scoped>
.competitor-page { max-width: 900px; }
.page-header { margin-bottom: 1rem; }
.back-link { display: inline-block; margin-bottom: 0.5rem; color: var(--accent); text-decoration: none; font-size: 0.9rem; }
.back-link:hover { text-decoration: underline; }
.page-header h2 { margin: 0; font-size: 1.35rem; }

/* OXD-style mock UI: Feature summary card */
.feature-mock-oxd { margin-bottom: 1.25rem; }
.feature-mock-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; overflow: hidden; padding: 1.25rem; }
.feature-mock-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem; flex-wrap: wrap; }
.feature-mock-badge { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--accent); background: rgba(249,115,22,0.15); padding: 0.25rem 0.5rem; border-radius: 6px; }
.feature-mock-title { margin: 0; font-size: 1.25rem; font-weight: 600; color: var(--text); }
.feature-mock-meta { display: flex; flex-wrap: wrap; gap: 1.25rem; margin-bottom: 0.75rem; }
.feature-mock-meta-item { display: flex; flex-direction: column; gap: 0.15rem; }
.feature-mock-label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; }
.feature-mock-value { font-size: 0.9rem; color: var(--text); }
.feature-mock-desc { margin: 0 0 0.75rem 0; font-size: 0.9rem; line-height: 1.5; color: var(--text); opacity: 0.95; }
.feature-mock-footer { padding-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.06); font-size: 0.85rem; }
.feature-mock-footer .feature-mock-value { margin-top: 0.2rem; }

.tabs { display: flex; gap: 0; margin-bottom: 1.25rem; border-bottom: 1px solid var(--border); }
.tab { padding: 0.6rem 1.25rem; font-size: 0.9rem; font-weight: 600; background: none; border: none; border-bottom: 2px solid transparent; color: var(--muted); cursor: pointer; font-family: inherit; margin-bottom: -1px; }
.tab:hover { color: var(--text); }
.tab.active { color: var(--accent); border-bottom-color: var(--accent); }

.tab-panel { min-height: 120px; }
.loading-inline { padding: 2rem; text-align: center; color: var(--muted); }

/* OXD-inspired Use case tab (ref: https://oxd-int-infinity.orangehrm.com/) */
.use-case-content.oxd-mock { --oxd-accent: #f97316; --oxd-card-bg: rgba(255,255,255,0.03); --oxd-border: rgba(255,255,255,0.08); }
.oxd-widgets-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-top: 0.5rem; }
.oxd-widget { background: var(--oxd-card-bg); border: 1px solid var(--oxd-border); border-radius: 12px; overflow: hidden; }
.oxd-widget-full { grid-column: 1 / -1; }
.oxd-widget-header { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1rem; background: rgba(0,0,0,0.15); border-bottom: 1px solid var(--oxd-border); }
.oxd-widget-header h3 { margin: 0; font-size: 0.875rem; font-weight: 600; color: var(--oxd-accent); text-transform: uppercase; letter-spacing: 0.02em; }
.oxd-widget-icon { font-size: 1rem; opacity: 0.9; }
.oxd-widget-body { padding: 1rem; }
.oxd-text { margin: 0; font-size: 0.9rem; line-height: 1.5; color: var(--text); }
.oxd-flow-list { list-style: none; margin: 0; padding: 0; counter-reset: step; }
.oxd-flow-list li { display: flex; align-items: flex-start; gap: 0.75rem; margin-bottom: 0.75rem; padding: 0.5rem 0; border-bottom: 1px solid var(--oxd-border); }
.oxd-flow-list li:last-child { border-bottom: none; margin-bottom: 0; }
.oxd-step-num { flex-shrink: 0; width: 1.5rem; height: 1.5rem; display: inline-flex; align-items: center; justify-content: center; background: var(--oxd-accent); color: #fff; border-radius: 50%; font-size: 0.75rem; font-weight: 700; }
.oxd-criteria-list { margin: 0; padding-left: 1.25rem; }
.oxd-criteria-list li { margin-bottom: 0.5rem; line-height: 1.45; }
.muted { color: var(--muted); }
@media (max-width: 640px) { .oxd-widgets-grid { grid-template-columns: 1fr; } }

/* UI example tab: OrangeHRM / OXD mock UI examples */
.ui-example-panel { padding-top: 0.25rem; min-height: 200px; }
.ui-example-intro { margin: 0 0 1.25rem 0; font-size: 0.9rem; color: var(--muted); }
.ui-example-error { padding: 1.5rem; text-align: center; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.3); border-radius: var(--radius); margin-bottom: 1rem; }
.ui-example-error p { margin: 0 0 0.75rem 0; color: #fca5a5; }
.ui-example-footer { margin: 1.5rem 0 0; font-size: 0.8rem; color: var(--muted); }
.ui-example-footer a { color: var(--accent); }

.ohrm-mock-section { margin-bottom: 1.5rem; }
.ohrm-mock-section-title { margin: 0 0 0.5rem 0; font-size: 0.85rem; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; }
.ohrm-mock-badge { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; margin-left: 0.5rem; padding: 0.15rem 0.4rem; background: rgba(249,115,22,0.2); color: var(--accent); border-radius: 4px; }

.ui-example-mock { background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; }
.ohrm-mock-card { max-width: 640px; }
.ui-example-screen-header { margin-bottom: 1.25rem; }
.ui-example-screen-header.ohrm-mock-list-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; }
.ohrm-mock-add-btn { flex-shrink: 0; }
.ui-example-breadcrumb { font-size: 0.75rem; color: var(--muted); }
.ui-example-screen-title { margin: 0.25rem 0 0.5rem 0; font-size: 1.2rem; font-weight: 600; color: var(--accent); }
.ui-example-screen-desc { margin: 0; font-size: 0.875rem; line-height: 1.5; color: var(--text); opacity: 0.9; }
.ui-example-form { display: flex; flex-direction: column; gap: 1rem; }
.ui-example-field { display: flex; flex-direction: column; gap: 0.35rem; }
.ui-example-label { font-size: 0.8rem; font-weight: 500; color: var(--muted); }
.ui-example-label .required { color: var(--accent); }
.ui-example-input { padding: 0.5rem 0.75rem; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; font-size: 0.9rem; color: var(--text); }
.ui-example-input-muted { color: var(--muted); font-style: italic; }
.ui-example-select-wrap { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.ui-example-chip { padding: 0.25rem 0.6rem; background: rgba(249,115,22,0.15); color: var(--accent); border-radius: 6px; font-size: 0.8rem; }
.ui-example-actions { margin-top: 1.25rem; display: flex; gap: 0.75rem; }
.ui-example-btn { padding: 0.5rem 1.25rem; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; border: none; font-family: inherit; }
.ui-example-btn-primary { background: var(--accent); color: #fff; }
.ui-example-btn-secondary { background: var(--surface); color: var(--text); border: 1px solid var(--border); }

.ohrm-mock-table-wrap { max-width: 100%; overflow-x: auto; }
.ohrm-mock-toolbar { display: flex; gap: 0.75rem; margin-bottom: 1rem; flex-wrap: wrap; }
.ohrm-mock-search, .ohrm-mock-select { min-width: 120px; }
.ohrm-mock-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.ohrm-mock-table th, .ohrm-mock-table td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid var(--border); }
.ohrm-mock-table th { background: rgba(0,0,0,0.2); color: var(--muted); font-weight: 600; }
.ohrm-mock-link { color: var(--accent); text-decoration: none; font-size: 0.85rem; }
.ohrm-mock-link:hover { text-decoration: underline; }

.ohrm-mock-widgets { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 1rem; max-width: 560px; }
.ohrm-mock-widget { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1rem; text-align: center; }
.ohrm-mock-widget-title { font-size: 0.8rem; color: var(--muted); margin-bottom: 0.35rem; }
.ohrm-mock-widget-value { font-size: 1.5rem; font-weight: 700; color: var(--accent); }

.loading, .message.error { padding: 2rem; text-align: center; }
.loading-hint { margin-top: 0.5rem; font-size: 0.9rem; color: var(--muted); }
.message.error { background: rgba(239,68,68,0.15); color: #fca5a5; border-radius: var(--radius); }
.stub-note { color: var(--muted); font-size: 0.9rem; margin-bottom: 1rem; }
.analysis-content section { margin-bottom: 1.5rem; }
.analysis-content h3 { font-size: 1rem; margin: 1rem 0 0.5rem 0; color: var(--muted); }
.sim-diff { margin-bottom: 1rem; }
.sim-diff strong { display: block; margin-bottom: 0.25rem; }
.sim-diff ul { margin: 0 0 0.5rem 0; padding-left: 1.25rem; }
.sim-diff-empty { margin: 0 0 0.5rem 0; color: var(--muted); font-size: 0.9rem; }
.compact { width: 100%; border-collapse: collapse; font-size: 0.9rem; background: var(--surface); border-radius: var(--radius); overflow: hidden; }
.compact th, .compact td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid var(--border); }
.compact th { background: rgba(0,0,0,0.2); color: var(--muted); font-weight: 600; }
.compact .help-links a { color: var(--accent); text-decoration: none; }
.compact .help-links a:hover { text-decoration: underline; }
ul { margin: 0; padding-left: 1.25rem; }
li { margin-bottom: 0.25rem; }
.page-actions { margin-top: 1.5rem; display: flex; gap: 0.5rem; flex-wrap: wrap; }
.btn { padding: 0.5rem 1rem; border-radius: var(--radius); font-weight: 600; cursor: pointer; border: none; font-family: inherit; text-decoration: none; display: inline-block; font-size: 0.9rem; }
.btn.primary { background: var(--accent); color: #fff; }
.btn.secondary { background: var(--surface); color: var(--text); border: 1px solid var(--border); }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
