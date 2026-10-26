// Bundle Monaco locally (no CDN) and use only the base editor worker — SQL needs no language worker.
// Import this module once before rendering <Editor> from @monaco-editor/react.
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
// monaco-editor 0.5x maps "monaco-editor/*" to "./esm/vs/*.js" in its exports, so this is esm/vs/editor/editor.worker.js.
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';

self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

loader.config({ monaco });

export { monaco };
