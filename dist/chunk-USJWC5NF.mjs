var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/server/event-broadcaster.ts
var KEY = /* @__PURE__ */ Symbol.for("next-devtools.broadcaster");
var g = globalThis;
var state = g[KEY] || (g[KEY] = { listeners: /* @__PURE__ */ new Set() });
var broadcaster = {
  subscribe(listener) {
    state.listeners.add(listener);
    return () => {
      state.listeners.delete(listener);
    };
  },
  hasListeners() {
    return state.listeners.size > 0;
  },
  broadcast(entry) {
    for (const listener of state.listeners) {
      try {
        listener(entry);
      } catch {
      }
    }
  }
};

export {
  __require,
  broadcaster
};
//# sourceMappingURL=chunk-USJWC5NF.mjs.map