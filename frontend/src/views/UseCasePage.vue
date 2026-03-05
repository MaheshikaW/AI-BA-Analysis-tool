<template>
  <div class="use-case-page">
    <div class="page-header">
      <a href="#/" class="back-link">← Back to feature list</a>
      <h2>Use case – {{ feature?.name || '…' }}</h2>
    </div>

    <div v-if="loading" class="loading">
      <p>Loading use case…</p>
      <p class="loading-hint">First time may take a few seconds (AI-generated).</p>
    </div>
    <div v-else-if="error" class="message error">{{ error }}</div>
    <div v-else class="use-case-content">
      <section v-if="feature?.description" class="section">
        <h3>Feature description</h3>
        <p>{{ feature.description }}</p>
      </section>
      <section v-if="useCase" class="section">
        <h3>Use case</h3>
        <p><strong>Objective:</strong> {{ useCase.objective || '—' }}</p>
        <p><strong>Actors:</strong> {{ useCase.actors || '—' }}</p>
        <p><strong>Preconditions:</strong> {{ useCase.preconditions || '—' }}</p>
        <p><strong>Basic flow:</strong></p>
        <ol v-if="useCase.basicFlow?.length">
          <li v-for="(step, i) in useCase.basicFlow" :key="i">{{ step }}</li>
        </ol>
        <p v-else class="muted">—</p>
        <p><strong>Postconditions:</strong> {{ useCase.postconditions || '—' }}</p>
        <p v-if="useCase.acceptanceCriteria?.length"><strong>Acceptance criteria:</strong></p>
        <ul v-if="useCase.acceptanceCriteria?.length">
          <li v-for="(c, i) in useCase.acceptanceCriteria" :key="i">{{ c }}</li>
        </ul>
      </section>
      <div class="page-actions">
        <a href="#/" class="btn primary">Back to list</a>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import * as api from '../api';

const props = defineProps({ id: { type: [String, Number], required: true } });
const feature = ref(null);
const useCase = ref(null);
const loading = ref(true);
const error = ref('');

async function load() {
  const id = Number(props.id);
  if (!id) return;
  loading.value = true;
  error.value = '';
  feature.value = null;
  useCase.value = null;
  try {
    const [featureRes, useCaseRes] = await Promise.all([
      api.getFeature(id),
      api.getUseCase(id),
    ]);
    feature.value = featureRes;
    useCase.value = useCaseRes.useCase || null;
  } catch (e) {
    error.value = e.message || 'Failed to load use case';
  } finally {
    loading.value = false;
  }
}

watch(() => props.id, load);
onMounted(load);
</script>

<style scoped>
.use-case-page { max-width: 900px; }
.page-header { margin-bottom: 1.5rem; }
.back-link { display: inline-block; margin-bottom: 0.5rem; color: var(--accent); text-decoration: none; font-size: 0.9rem; }
.back-link:hover { text-decoration: underline; }
.page-header h2 { margin: 0; font-size: 1.35rem; }
.loading, .message.error { padding: 2rem; text-align: center; }
.loading-hint { margin-top: 0.5rem; font-size: 0.9rem; color: var(--muted); }
.message.error { background: rgba(239,68,68,0.15); color: #fca5a5; border-radius: var(--radius); }
.use-case-content .section { margin-bottom: 1.5rem; }
.use-case-content h3 { font-size: 1rem; margin: 1rem 0 0.5rem 0; color: var(--muted); }
.use-case-content p { margin: 0.5rem 0; }
.use-case-content ol, .use-case-content ul { margin: 0.5rem 0; padding-left: 1.5rem; }
.use-case-content li { margin-bottom: 0.25rem; }
.muted { color: var(--muted); }
.page-actions { margin-top: 1.5rem; display: flex; gap: 0.5rem; flex-wrap: wrap; }
.btn { padding: 0.5rem 1rem; border-radius: var(--radius); font-weight: 600; cursor: pointer; border: none; font-family: inherit; text-decoration: none; display: inline-block; font-size: 0.9rem; }
.btn.primary { background: var(--accent); color: #fff; }
.btn.secondary { background: var(--surface); color: var(--text); border: 1px solid var(--border); }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
