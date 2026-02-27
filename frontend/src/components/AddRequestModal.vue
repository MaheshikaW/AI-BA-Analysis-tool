<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="modal">
      <h2>Add client request – {{ feature.name }}</h2>
      <form @submit.prevent="submit">
        <label>Client tier <input v-model="form.client_tier" required placeholder="e.g. enterprise, professional, starter" /></label>
        <label>Requested client(s) <input v-model="form.client_name" placeholder="e.g. Acme Corp, Client X" /></label>
        <label>Request count <input v-model.number="form.request_count" type="number" min="1" /></label>
        <label>Source <input v-model="form.source" placeholder="e.g. Product Board, email" /></label>
        <div class="modal-actions">
          <button type="button" class="btn secondary" @click="$emit('close')">Cancel</button>
          <button type="submit" class="btn primary" :disabled="saving">{{ saving ? 'Saving…' : 'Add' }}</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch } from 'vue';
import * as api from '../api';

const props = defineProps({ feature: { type: Object, required: true } });
const emit = defineEmits(['close', 'saved']);
const saving = ref(false);
const form = reactive({ client_tier: '', client_name: '', request_count: 1, source: '' });

watch(() => props.feature, () => {
  form.client_tier = '';
  form.client_name = '';
  form.request_count = 1;
  form.source = '';
}, { immediate: true });

async function submit() {
  saving.value = true;
  try {
    await api.addRequest(props.feature.id, { client_tier: form.client_tier, client_name: form.client_name || undefined, request_count: form.request_count, source: form.source });
    emit('saved');
  } catch (e) {
    alert(e.message || 'Failed to add request');
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.5rem; min-width: 360px; }
.modal h2 { margin: 0 0 1rem 0; font-size: 1.25rem; }
form label { display: block; margin-bottom: 0.75rem; font-size: 0.9rem; color: var(--muted); }
form input { width: 100%; margin-top: 0.25rem; padding: 0.5rem; background: var(--bg); border: 1px solid var(--border); color: var(--text); border-radius: 6px; font-family: inherit; }
.modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.25rem; }
.btn { padding: 0.5rem 1rem; border-radius: var(--radius); font-weight: 600; cursor: pointer; border: none; font-family: inherit; }
.btn.primary { background: var(--accent); color: #fff; }
.btn.secondary { background: var(--surface); color: var(--text); border: 1px solid var(--border); }
</style>
