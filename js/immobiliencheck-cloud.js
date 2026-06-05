/**
 * Cloud-Speicher für Immobiliencheck: PostgreSQL + Object Storage via REST API.
 * Wird vor app.js geladen. Aktiviert sich automatisch, wenn /api/v1/health erreichbar ist.
 */
(function (global) {
  const TOKEN_KEY = "immobiliencheck-cloud-token";
  const SESSION_KEY = "immobiliencheck-cloud-session";
  const DATA_KEYS = [
    "immobiliencheck-submissions-v1",
    "immobiliencheck-daily-attendance-v1",
    "immobiliencheck-staff-schedule-v1",
    "immobiliencheck-recurring-schedule-rules-v1",
    "immobiliencheck-work-orders-v1",
    "immobiliencheck-customer-db-v1",
    "immobiliencheck-guide-db-v1",
    "immobiliencheck-checklist-templates-v2",
    "immobiliencheck-checkpoint-catalog-v1"
  ];

  const cache = Object.create(null);
  const versions = Object.create(null);
  const pendingSaveTimers = Object.create(null);
  const urlCache = Object.create(null);

  let enabled = false;
  let ready = false;
  let initPromise = null;
  let apiBase = "";

  function apiUrl(path) {
    const base = apiBase.replace(/\/$/, "");
    return `${base}${path.startsWith("/") ? path : `/${path}`}`;
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || "";
  }

  function setToken(token, remember) {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    if (!token) return;
    if (remember) localStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.setItem(TOKEN_KEY, token);
  }

  function authHeaders(extra) {
    const h = Object.assign({}, extra || {});
    const token = getToken();
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }

  async function detectCloud() {
    try {
      const res = await fetch(apiUrl("/api/v1/health"), { credentials: "same-origin" });
      if (!res.ok) return false;
      const contentType = String(res.headers.get("content-type") || "").toLowerCase();
      if (!contentType.includes("application/json")) return false;
      const data = await res.json();
      return Boolean(data && data.ok);
    } catch (e) {
      return false;
    }
  }

  async function init() {
    if (ready) return enabled;
    if (initPromise) return initPromise;
    initPromise = (async () => {
      apiBase = "";
      const meta = document.querySelector('meta[name="immobiliencheck-api-base"]');
      if (meta && meta.content) apiBase = String(meta.content).trim();
      enabled = await detectCloud();
      ready = true;
      return enabled;
    })();
    return initPromise;
  }

  function getItem(key) {
    if (!enabled) return localStorage.getItem(key);
    if (key === TOKEN_KEY || key === SESSION_KEY) {
      return sessionStorage.getItem(key) || localStorage.getItem(key);
    }
    if (Object.prototype.hasOwnProperty.call(cache, key)) {
      return cache[key] == null ? null : String(cache[key]);
    }
    return null;
  }

  function setItem(key, value) {
    if (!enabled) {
      localStorage.setItem(key, value);
      return;
    }
    if (key === TOKEN_KEY || key === SESSION_KEY) {
      sessionStorage.setItem(key, value);
      return;
    }
    cache[key] = value;
    scheduleSave(key);
  }

  function removeItem(key) {
    if (!enabled) {
      localStorage.removeItem(key);
      return;
    }
    delete cache[key];
    delete versions[key];
    scheduleSave(key, true);
  }

  function scheduleSave(key, immediate) {
    if (!DATA_KEYS.includes(key)) return;
    if (pendingSaveTimers[key]) clearTimeout(pendingSaveTimers[key]);
    const run = () => {
      pendingSaveTimers[key] = null;
      void flushDocument(key);
    };
    if (immediate) run();
    else pendingSaveTimers[key] = setTimeout(run, 450);
  }

  async function flushDocument(key) {
    if (!enabled || !getToken()) return;
    const raw = cache[key];
    let payload;
    try {
      payload = raw == null ? null : JSON.parse(raw);
    } catch (e) {
      console.error("[cloud] JSON parse failed for", key, e);
      return;
    }
    try {
      const processed = await uploadEmbeddedAssets(payload);
      const res = await fetch(apiUrl(`/api/v1/documents/${encodeURIComponent(key)}`), {
        method: "PUT",
        credentials: "same-origin",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          payload: processed,
          version: versions[key] != null ? versions[key] : null
        })
      });
      if (res.status === 409) {
        console.warn("[cloud] Versionskonflikt — Bootstrap neu laden empfohlen:", key);
        return;
      }
      if (!res.ok) {
        console.error("[cloud] save failed", key, await res.text());
        return;
      }
      const data = await res.json();
      if (data && data.version != null) versions[key] = data.version;
    } catch (e) {
      console.error("[cloud] flushDocument", key, e);
    }
  }

  async function flushAll() {
    await Promise.all(DATA_KEYS.map((key) => flushDocument(key)));
  }

  function isDataUrl(value) {
    return typeof value === "string" && value.startsWith("data:");
  }

  async function uploadDataUrl(dataUrl, nameHint) {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const form = new FormData();
    form.append("file", blob, nameHint || "upload.bin");
    const up = await fetch(apiUrl("/api/v1/files"), {
      method: "POST",
      credentials: "same-origin",
      headers: authHeaders(),
      body: form
    });
    if (!up.ok) throw new Error("upload_failed");
    const json = await up.json();
    return { storageId: json.file.id, name: json.file.name || nameHint || "file" };
  }

  async function transformNode(node) {
    if (node == null) return node;
    if (Array.isArray(node)) {
      const out = [];
      for (let i = 0; i < node.length; i += 1) out.push(await transformNode(node[i]));
      return out;
    }
    if (typeof node !== "object") return node;

    if (node.storageId && !node.data) {
      return node;
    }
    if (isDataUrl(node.data) && !node.storageId) {
      const ref = await uploadDataUrl(node.data, node.name || "upload.bin");
      const next = Object.assign({}, node, ref);
      delete next.data;
      return next;
    }

    const out = Array.isArray(node) ? [] : {};
    const keys = Object.keys(node);
    for (let ki = 0; ki < keys.length; ki += 1) {
      const k = keys[ki];
      out[k] = await transformNode(node[k]);
    }
    return out;
  }

  async function uploadEmbeddedAssets(payload) {
    if (!enabled || !getToken()) return payload;
    return transformNode(payload);
  }

  async function resolveFileUrl(storageId) {
    if (!storageId) return "";
    if (urlCache[storageId]) return urlCache[storageId];
    const res = await fetch(apiUrl(`/api/v1/files/${encodeURIComponent(storageId)}/url`), {
      credentials: "same-origin",
      headers: authHeaders()
    });
    if (!res.ok) return "";
    const data = await res.json();
    urlCache[storageId] = data.url || "";
    return urlCache[storageId];
  }

  async function fetchFileAsDataUrl(storageId) {
    if (!storageId || !enabled || !getToken()) return "";
    const res = await fetch(apiUrl(`/api/v1/files/${encodeURIComponent(storageId)}/content`), {
      credentials: "same-origin",
      headers: authHeaders()
    });
    if (!res.ok) return "";
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function hydrateDocumentAssets(node) {
    if (node == null) return node;
    if (Array.isArray(node)) {
      const out = [];
      for (let i = 0; i < node.length; i += 1) out.push(await hydrateDocumentAssets(node[i]));
      return out;
    }
    if (typeof node !== "object") return node;

    if (node.storageId && !node.data) {
      const url = await resolveFileUrl(node.storageId);
      if (url) return Object.assign({}, node, { data: url });
    }

    const out = {};
    const keys = Object.keys(node);
    for (let ki = 0; ki < keys.length; ki += 1) {
      const k = keys[ki];
      out[k] = await hydrateDocumentAssets(node[k]);
    }
    return out;
  }

  async function loadBootstrap() {
    const res = await fetch(apiUrl("/api/v1/bootstrap"), {
      credentials: "same-origin",
      headers: authHeaders()
    });
    if (res.status === 401) throw new Error("unauthorized");
    if (!res.ok) throw new Error("bootstrap_failed");
    const data = await res.json();
    for (const key of DATA_KEYS) {
      const doc = data.documents && data.documents[key];
      if (!doc) {
        cache[key] = null;
        versions[key] = null;
        continue;
      }
      const hydrated = await hydrateDocumentAssets(doc.payload);
      cache[key] = JSON.stringify(hydrated);
      versions[key] = doc.version;
    }
    if (data.user) {
      const session = {
        username: data.user.username,
        role: data.user.role,
        label: data.user.label,
        manageEmployeeUsernames: data.user.manageEmployeeUsernames || [],
        allowedChecklistTemplateIds: data.user.allowedChecklistTemplateIds || []
      };
      setItem(SESSION_KEY, JSON.stringify(session));
    }
    return data;
  }

  async function login(username, password, remember) {
    const res = await fetch(apiUrl("/api/v1/auth/login"), {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    setToken(data.token, remember);
    await loadBootstrap();
    return { ok: true, user: data.user };
  }

  async function logout() {
    setToken(null, false);
    for (const key of DATA_KEYS) {
      delete cache[key];
      delete versions[key];
    }
    removeItem(SESSION_KEY);
  }

  const api = {
    TOKEN_KEY,
    SESSION_KEY,
    DATA_KEYS,
    get enabled() {
      return enabled;
    },
    get ready() {
      return ready;
    },
    init,
    getItem,
    setItem,
    removeItem,
    getToken,
    setToken,
    login,
    logout,
    loadBootstrap,
    flushAll,
    flushDocument,
    resolveFileUrl,
    fetchFileAsDataUrl,
    isDataUrl
  };

  global.ImmobiliencheckCloudStorage = api;
})(typeof window !== "undefined" ? window : global);
