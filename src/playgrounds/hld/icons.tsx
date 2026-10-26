import type { HldNodeType } from './types';

// Small 20×20 line icons. They use currentColor so they follow the surrounding text token.
const PATHS: Record<HldNodeType, string> = {
  client: 'M3 4h14v9H3z M7 16h6 M10 13v3',
  dns: 'M10 3a7 7 0 1 0 0 14a7 7 0 1 0 0-14 M3 10h14 M10 3c-3 3-3 11 0 14 M10 3c3 3 3 11 0 14',
  cdn: 'M5 14a3.5 3.5 0 0 1 .5-7A5 5 0 0 1 15 7.5a3 3 0 0 1 0 6.5z M8 17h4',
  'load-balancer': 'M10 3v5 M10 8l-6 5 M10 8l6 5 M10 8v5 M3 13h2v3H3z M9 13h2v3H9z M15 13h2v3h-2z',
  'api-gateway': 'M3 17V8l7-5l7 5v9 M7 17v-6h6v6',
  'app-server': 'M4 3h12v6H4z M4 11h12v6H4z M7 6h.01 M7 14h.01',
  worker: 'M10 6.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7 M10 2v3 M10 15v3 M2 10h3 M15 10h3 M4.5 4.5l2 2 M13.5 13.5l2 2 M4.5 15.5l2-2 M13.5 6.5l2-2',
  database: 'M4 5c0-1.7 12-1.7 12 0v10c0 1.7-12 1.7-12 0z M4 5c0 1.7 12 1.7 12 0 M4 10c0 1.7 12 1.7 12 0',
  'read-replica': 'M6 6c0-1.3 9-1.3 9 0v9c0 1.3-9 1.3-9 0z M6 6c0 1.3 9 1.3 9 0 M3 4v9 M3 4c0-1 2-1.4 3-1.5',
  cache: 'M11 2L4 11h5l-1 7l7-9h-5z',
  queue: 'M2 7h16v6H2z M6 7v6 M10 7v6 M14 7v6',
  stream: 'M2 6c3-2 5 2 8 0s5 2 8 0 M2 10c3-2 5 2 8 0s5 2 8 0 M2 14c3-2 5 2 8 0s5 2 8 0',
  'object-storage': 'M3 6l7-3l7 3v8l-7 3l-7-3z M3 6l7 3l7-3 M10 9v8',
  search: 'M8.5 3a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11 M12.5 12.5L17 17',
  monitoring: 'M2 10h4l2-5l4 10l2-5h4',
  external: 'M11 3h6v6 M17 3l-8 8 M14 12v5H3V6h5',
  'websocket-gateway': 'M3 7h11 M11 4l3 3l-3 3 M17 13H6 M9 10l-3 3l3 3',
  scheduler: 'M10 3a7 7 0 1 0 0 14a7 7 0 1 0 0-14 M10 6v4l3 2',
  'rate-limiter': 'M3 14a7 7 0 0 1 14 0 M10 14l3-4 M2 17h16',
  'service-registry': 'M3 4h14v12H3z M6 8h8 M6 11h8 M6 14h5',
};

export function NodeIcon({ type, size = 18, className }: { type: HldNodeType; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d={PATHS[type]} />
    </svg>
  );
}
