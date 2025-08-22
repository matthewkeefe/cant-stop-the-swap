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
