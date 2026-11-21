// The page reaches this module only through `React.lazy(() => import(...))` and `import type`:
// a value import from outside would pull three.js into the main bundle.
export { Universe as default } from './Universe';
export type * from './types';
