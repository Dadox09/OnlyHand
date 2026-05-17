// Hash router: maps #/path → handler({ params })
const routes = [];

export function route(pattern, handler) {
  // Convert "/games/:id" → regex with named groups
  const keys = [];
  const re = new RegExp(
    "^" +
      pattern.replace(/:(\w+)/g, (_, k) => {
        keys.push(k);
        return "([^/]+)";
      }) +
      "$"
  );
  routes.push({ re, keys, handler });
}

export function navigate(path) {
  location.hash = path;
}

function dispatch() {
  const path = location.hash.slice(1) || "/";
  for (const { re, keys, handler } of routes) {
    const m = path.match(re);
    if (m) {
      const params = {};
      keys.forEach((k, i) => (params[k] = m[i + 1]));
      handler({ params });
      return;
    }
  }
}

export function startRouter() {
  window.addEventListener("hashchange", dispatch);
  dispatch();
}
