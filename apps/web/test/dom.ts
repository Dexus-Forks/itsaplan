import { JSDOM } from 'jsdom';

export function createTestDom() {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: 'http://app.test/',
    pretendToBeVisual: true,
  });
  const names = [
    'window',
    'document',
    'navigator',
    'localStorage',
    'Node',
    'NodeFilter',
    'Element',
    'HTMLElement',
    'HTMLInputElement',
    'HTMLFormElement',
    'HTMLButtonElement',
    'SVGElement',
    'DocumentFragment',
    'Event',
    'MouseEvent',
    'KeyboardEvent',
    'CustomEvent',
    'MutationObserver',
    'getComputedStyle',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'IS_REACT_ACT_ENVIRONMENT',
    'fetch',
    'ResizeObserver',
  ];
  const originals = new Map(
    names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
  );
  for (const name of names) {
    if (!(name in dom.window)) continue;
    const value = dom.window[name as keyof typeof dom.window];
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: ['getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'].includes(name)
        ? (value as (...args: unknown[]) => unknown).bind(dom.window)
        : value,
    });
  }
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
    configurable: true,
    value: true,
  });
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
  Object.defineProperty(dom.window, '__ITSAPLAN_ENV__', {
    value: { apiUrl: 'http://api.test', privacyUrl: '', termsUrl: '' },
  });
  Object.defineProperty(dom.window, 'matchMedia', {
    value: (media: string) => ({
      matches: false,
      media,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  return {
    restore() {
      dom.window.close();
      for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    },
  };
}
