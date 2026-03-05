<template>
  <div class="app">
    <header class="header">
      <div class="header-brand">
        <div class="header-logo-block">
          <img src="/logo.png" alt="FeatureFlow" class="header-logo" />
          <p class="tagline">
          <span class="tagline-part">Standardizing feature research. Automating prioritization.</span>
          <span class="tagline-part">Accelerating roadmap decisions.</span>
        </p>
        </div>
      </div>
    </header>
    <main class="main">
      <Dashboard v-if="route.name === 'dashboard'" />
      <CompetitorAnalysisPage
        v-else-if="route.name === 'competitor-analysis' && route.params?.id"
        :id="route.params.id"
      />
      <UseCasePage
        v-else-if="route.name === 'use-case' && route.params?.id"
        :id="route.params.id"
      />
      <div v-else class="loading">Loading…</div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { getRouteFromHash } from './router/index.js';
import Dashboard from './components/Dashboard.vue';
import CompetitorAnalysisPage from './views/CompetitorAnalysisPage.vue';
import UseCasePage from './views/UseCasePage.vue';

const route = ref(getRouteFromHash());

function updateRoute() {
  route.value = getRouteFromHash();
}

onMounted(() => {
  window.addEventListener('hashchange', updateRoute);
  updateRoute();
});
</script>

<style>
:root {
  --bg: #0f0f12;
  --surface: #18181c;
  --border: #2a2a30;
  --text: #e4e4e7;
  --muted: #71717a;
  --accent: #f97316;
  --accent-dim: #ea580c;
  --green: #22c55e;
  --radius: 10px;
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font-family: 'DM Sans', system-ui, sans-serif; min-height: 100vh; }
.app { max-width: 1800px; margin: 0 auto; padding: 1.5rem; }
.header { margin-bottom: 2rem; }
.header-brand { display: flex; align-items: center; gap: 1.25rem; flex-wrap: wrap; }
.header-logo { height: 64px; width: auto; display: block; object-fit: contain; }
.tagline { color: var(--muted); margin: 0; font-size: 0.95rem; line-height: 1.4; max-width: 560px; }
.tagline-part { display: block; }
.main { min-height: 60vh; }
</style>
