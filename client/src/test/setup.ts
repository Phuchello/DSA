// Mock browser APIs needed by jsdom for CodeMirror and ResizeObserver
if (typeof window !== 'undefined') {
  window.ResizeObserver =
    window.ResizeObserver ||
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };

  if (!document.createRange) {
    document.createRange = () => {
      const range = new Range();
      range.getBoundingClientRect = () => ({
        x: 0,
        y: 0,
        bottom: 0,
        height: 0,
        left: 0,
        right: 0,
        top: 0,
        width: 0,
        toJSON: () => {},
      });
      range.getClientRects = () => {
        const arr: DOMRect[] = [];
        return {
          item: () => null,
          length: 0,
          [Symbol.iterator]: () => arr[Symbol.iterator](),
        } as DOMRectList;
      };
      return range;
    };
  }
}
