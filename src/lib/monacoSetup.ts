// Monaco is bundled locally (no CDN). The SQL playground owns the shared setup; reuse it so the editor
// worker and loader are configured exactly once.
export { monaco } from '../playgrounds/sql/monacoSetup';
