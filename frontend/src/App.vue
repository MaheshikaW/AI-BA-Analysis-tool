<template>
  <div class="app">
    <header class="header">
      <h1>Feature scoring, customer insights & competitor analysis</h1>
    </header>
    <main class="main">
      <Dashboard />
    </main>
  </div>
</template>

<script setup>
import Dashboard from './components/Dashboard.vue';
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
.app { max-width: 1200px; margin: 0 auto; padding: 1.5rem; }
.header { margin-bottom: 2rem; }
.header h1 { font-size: 1.75rem; font-weight: 700; margin: 0 0 0.25rem 0; }
.tagline { color: var(--muted); margin: 0; font-size: 0.95rem; }
.main { min-height: 60vh; }
</style>
