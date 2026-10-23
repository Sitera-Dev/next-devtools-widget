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
  broadcaster
};
//# sourceMappingURL=chunk-SG7GSHLZ.mjs.map