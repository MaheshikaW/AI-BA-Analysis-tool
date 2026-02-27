<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="modal">
      <h2>Add feature</h2>
      <form @submit.prevent="submit">
        <label>Module <input v-model="form.module" required placeholder="e.g. Leave" /></label>
        <label>Feature name <input v-model="form.name" required placeholder="e.g. Blackout Period" /></label>
        <label>Description <textarea v-model="form.description" rows="2" placeholder="Short description"></textarea></label>
        <label>Point of contact <input v-model="form.point_of_contact" placeholder="Name or email" /></label>
        <div class="modal-actions">
          <button type="button" class="btn secondary" @click="$emit('close')">Cancel</button>
          <button type="submit" class="btn primary" :disabled="saving">{{ saving ? 'Saving…' : 'Save' }}</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue';
import * as api from '../api';

const emit = defineEmits(['close', 'saved']);
const saving = ref(false);
const form = reactive({ module: '', name: '', description: '', point_of_contact: '' });

async function submit() {
  saving.value = true;
  try {
    await api.createFeature(form);
    emit('saved');
  } catch (e) {
    alert(e.message || 'Failed to add feature');
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
form input, form textarea { width: 100%; margin-top: 0.25rem; padding: 0.5rem; background: var(--bg); border: 1px solid var(--border); color: var(--text); border-radius: 6px; font-family: inherit; }
.modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.25rem; }
.btn { padding: 0.5rem 1rem; border-radius: var(--radius); font-weight: 600; cursor: pointer; border: none; font-family: inherit; }
.btn.primary { background: var(--accent); color: #fff; }
.btn.secondary { background: var(--surface); color: var(--text); border: 1px solid var(--border); }
</style>
