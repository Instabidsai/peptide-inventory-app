import "@testing-library/jest-dom";

// Polyfill IntersectionObserver for jsdom (used by landing page Nav, recharts, etc.)
if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = class IntersectionObserver {
    readonly root: Element | null = null;
    readonly rootMargin: string = '';
    readonly thresholds: ReadonlyArray<number> = [];
    constructor(_cb: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] { return []; }
  };
}

// Polyfill ResizeObserver for jsdom (used by recharts ResponsiveContainer)
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    constructor(_cb: ResizeObserverCallback) {}
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Stub scrollTo for jsdom (used by landing page, chat components)
window.scrollTo = (() => {}) as any;
Element.prototype.scrollTo = (() => {}) as any;
Element.prototype.scrollIntoView = (() => {}) as any;

// Stub URL.createObjectURL for jsdom (used by media-encoder-host / AudioRecorder)
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = () => 'blob:mock';
  URL.revokeObjectURL = () => {};
}

// Stub Worker for jsdom (used by media-encoder-host-broker for audio encoding)
if (typeof globalThis.Worker === 'undefined') {
  globalThis.Worker = class Worker {
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: ((e: ErrorEvent) => void) | null = null;
    constructor(_url: string | URL) {}
    postMessage() {}
    terminate() {}
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() { return false; }
  } as any;
}

// Stub matchMedia for jsdom (used by useIsMobile)
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
