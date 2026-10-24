import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { mswServer } from './fake-server';

beforeAll(() => mswServer.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  cleanup();
  mswServer.resetHandlers();
  window.localStorage.clear();
});
afterAll(() => mswServer.close());

// jsdom lacks these; the app guards for them but Radix and the clock use them.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
if (typeof window.matchMedia === 'undefined') {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
// jsdom ships window.scrollTo as a 'not implemented' stub that logs on every call (TanStack
// Router's scroll restoration triggers it), so it must be replaced, not merely defaulted.
window.scrollTo = () => {};
Element.prototype.scrollIntoView ??= function () {};
Element.prototype.scrollTo ??= function () {};
Element.prototype.setPointerCapture ??= function () {};
Element.prototype.releasePointerCapture ??= function () {};
Element.prototype.hasPointerCapture ??= function () {
  return false;
};
