<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="modal wide">
      <h2>Competitor analysis – {{ result.feature.name }}</h2>
      <p v-if="result.stub" class="stub-note">Stub output. Set OPENAI_API_KEY for real AI analysis.</p>
      <div class="analysis" v-else>
        <section v-if="result.analysis">
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
        <section v-if="result.analysis?.competitors?.length">
          <h3>Competitor mapping, how it works & source URLs</h3>
          <table class="compact">
            <thead>
              <tr><th>Competitor</th><th>Term</th><th>How it works</th><th>Source URLs</th></tr>
            </thead>
            <tbody>
              <tr v-for="c in result.analysis.competitors" :key="c.name">
                <td><strong>{{ c.name }}</strong></td>
                <td>{{ c.term || '—' }}</td>
                <td>{{ c.howItWorks || '—' }}</td>
                <td class="source-urls">
                  <template v-for="(article, idx) in competitorHelpLinks(c)" :key="idx">
                    <div class="source-url-row">
                      <a :href="article.url" target="_blank" rel="noopener noreferrer">{{ article.title }}</a>
                      <a :href="article.url" target="_blank" rel="noopener noreferrer" class="source-url-exact">{{ article.url }}</a>
                    </div>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
        <section v-else-if="result.analysis?.competitors && typeof result.analysis.competitors === 'object'">
          <h3>Competitor terms (stub)</h3>
          <ul>
            <li v-for="(term, name) in result.analysis.competitors" :key="name"><strong>{{ name }}</strong>: {{ term }}</li>
          </ul>
        </section>
      </div>
      <div class="modal-actions">
        <button class="btn secondary" @click="downloadUseCasePdf" :disabled="pdfLoading">
          {{ pdfLoading ? 'Preparing…' : 'Download use case (PDF)' }}
        </button>
        <button class="btn primary" @click="$emit('close')">Close</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import * as api from '../api';

const props = defineProps({ result: { type: Object, required: true } });
defineEmits(['close']);
const pdfLoading = ref(false);

function competitorSearchUrl(c) {
  const q = c.helpSearchQuery || `${c.name || ''} ${c.term || ''} documentation`.trim();
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

/** Up to 2 help article links per competitor (no search links). */
function competitorHelpLinks(c) {
  const out = [];
  const articles = Array.isArray(c.helpArticles) ? c.helpArticles : [];
  for (const a of articles.slice(0, 2)) {
    if (a && a.url) out.push({ title: a.title || 'Help article', url: a.url });
  }
  if (out.length < 2 && c.helpArticleUrl && !articles.some((a) => a && a.url === c.helpArticleUrl)) {
    out.push({ title: c.helpArticleTitle || 'Help article', url: c.helpArticleUrl });
  }
  return out.slice(0, 2);
}

async function downloadUseCasePdf() {
  pdfLoading.value = true;
  try {
    const { html } = await api.getUseCaseDocument(props.result.feature.id, props.result.analysis || null);
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;width:100%;height:100%;top:0;left:0;border:none;z-index:99999;';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      alert('Could not open print preview. Try allowing pop-ups for this site.');
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
    alert(e.message || 'Failed to generate use case document');
  } finally {
    pdfLoading.value = false;
  }
}
</script>

<style scoped>
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 1rem; }
.modal { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.5rem; max-height: 90vh; overflow: auto; }
.modal.wide { min-width: 560px; max-width: 720px; }
.modal h2 { margin: 0 0 0.5rem 0; font-size: 1.25rem; }
.stub-note { color: var(--muted); font-size: 0.9rem; margin-bottom: 1rem; }
.analysis h3 { font-size: 1rem; margin: 1rem 0 0.5rem 0; color: var(--muted); }
.sim-diff { margin-bottom: 1rem; }
.sim-diff strong { display: block; margin-bottom: 0.25rem; }
.sim-diff ul { margin: 0 0 0.5rem 0; padding-left: 1.25rem; }
.sim-diff-empty { margin: 0 0 0.5rem 0; color: var(--muted); font-size: 0.9rem; }
.compact { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.compact th, .compact td { padding: 0.5rem; text-align: left; border-bottom: 1px solid var(--border); }
.compact th { color: var(--muted); font-weight: 600; }
.compact td:last-child { max-width: 320px; }
.compact .source-urls a { color: var(--accent); text-decoration: none; display: inline-block; margin-bottom: 0.25rem; }
.compact .source-urls a:hover { text-decoration: underline; }
.compact .source-url-row { margin-bottom: 0.5rem; }
.compact .source-url-row:last-child { margin-bottom: 0; }
.compact .source-url-exact { display: block; font-size: 0.75rem; color: var(--accent); word-break: break-all; line-height: 1.35; text-decoration: none; margin-top: 0.2rem; }
.compact .source-url-exact:hover { text-decoration: underline; }
.compact .source-url-empty { margin: 0; font-size: 0.85rem; color: var(--muted); }
.compact td:nth-child(4) { max-width: 320px; }
ul { margin: 0; padding-left: 1.25rem; }
li { margin-bottom: 0.25rem; }
.modal-actions { margin-top: 1.25rem; display: flex; gap: 0.5rem; flex-wrap: wrap; }
.btn { padding: 0.5rem 1rem; border-radius: var(--radius); font-weight: 600; cursor: pointer; border: none; font-family: inherit; }
.btn.primary { background: var(--accent); color: #fff; }
.btn.secondary { background: var(--surface); color: var(--text); border: 1px solid var(--border); }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
