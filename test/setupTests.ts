// Minimal test setup for jsdom to provide canvas and audio shims used by the app

// Shim getContext on canvas elements to provide a minimal 2D context
// Avoid pulling in node-canvas for tests; provide no-op implementations used by renderer.
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: function (type: string) {
    if (type === '2d') {
      return {
        canvas: this,
        fillRect: () => {},
        clearRect: () => {},
        getImageData: (x: number, y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: () => {},
        createImageData: () => ({ width: 0, height: 0, data: new Uint8ClampedArray(0) }),
        setTransform: () => {},
        drawImage: () => {},
        save: () => {},
        restore: () => {},
        translate: () => {},
        scale: () => {},
        rotate: () => {},
        beginPath: () => {},
        closePath: () => {},
        moveTo: () => {},
        lineTo: () => {},
  setLineDash: () => {},
  arc: () => {},
  strokeRect: () => {},
        stroke: () => {},
        fillText: () => {},
        measureText: () => ({ width: 0 }),
        globalCompositeOperation: 'source-over',
  // Provide arcTo and styling props used by the renderer
  arcTo: () => {},
  lineJoin: 'round',
  lineCap: 'round',
      } as unknown;
    }
    return null;
  },
  configurable: true,
});

// Provide Image.decode shim used by the atlas loader
// In jsdom, Image is a function. Ensure decode returns resolved promise.
if (typeof (globalThis as typeof globalThis).Image !== 'undefined') {
  (globalThis as typeof globalThis).Image.prototype.decode = function () {
    return Promise.resolve();
  };
}

// Stub audio play/pause to no-op and avoid "Not implemented" errors
HTMLMediaElement.prototype.play = function (): Promise<void> {
  // return a resolved promise like browsers
  return Promise.resolve();
};
HTMLMediaElement.prototype.pause = function () {
  return undefined;
};

// Prevent requestAnimationFrame loop from running endlessly in tests by
// providing a simple, controllable implementation that delegates to setTimeout.
globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
  return setTimeout(() => cb(performance.now()), 16) as unknown as number;
};
globalThis.cancelAnimationFrame = (id: number) => {
  clearTimeout(id as unknown as NodeJS.Timeout);
};

// Silence specific noisy warnings during test runs without hiding other logs.
// We only filter well-known messages that are safe to ignore in tests.
const _origWarn = console.warn.bind(console);
const _origError = console.error.bind(console);

console.warn = (...args: unknown[]) => {
  try {
    const text = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    // React Router future-flag warnings are noisy in tests; filter them.
    if (/React Router Future Flag Warning|v7_startTransition|v7_relativeSplatPath/.test(text)) {
      return;
    }
  } catch {
    // fall through to original warn
  }
  _origWarn(...(args as unknown[]));
};

console.error = (...args: unknown[]) => {
  try {
    const text = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    // Suppress the common React "not wrapped in act(...)" warning in tests
    // which is benign for our environment and triggers many false positives.
    if (/not wrapped in act\(|wrap-tests-with-act|An update to .* inside a test was not wrapped in act/.test(text)) {
      return;
    }
  } catch {
    // fall through to original error
  }
  _origError(...(args as unknown[]));
};
