import { useEffect, useMemo, useState } from "react";

// ---- tiny styling so it looks decent without Tailwind ----
const S = {
  page: { fontFamily: "system-ui, sans-serif", lineHeight: 1.4, padding: 16, maxWidth: 980, margin: "0 auto" },
  h1: { margin: "0 0 12px 0" },
  row: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" },
  input: { padding: "8px 10px", border: "1px solid #ccc", borderRadius: 6, fontSize: 14 },
  btn: { padding: "8px 12px", border: "1px solid #888", borderRadius: 6, background: "#111", color: "#fff", cursor: "pointer" },
  btnGhost: { padding: "8px 12px", border: "1px solid #bbb", borderRadius: 6, background: "#fff", color: "#111", cursor: "pointer" },
  textarea: { width: "100%", minHeight: 120, padding: 10, border: "1px solid #ccc", borderRadius: 6, fontSize: 14, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" },
  card: { border: "1px solid #ddd", borderRadius: 10, padding: 12, marginBottom: 10, background: "#fafafa" },
  small: { fontSize: 12, color: "#666" },
  tag: { display: "inline-block", padding: "2px 8px", border: "1px solid #aaa", borderRadius: 999, marginRight: 6, marginTop: 6, fontSize: 12, background: "#fff" },
};

const STORAGE_KEY = "beato-study-lessons-v1";
const BASE_URL = "https://learn.beatobook.com/";
const PARAM = "beato"; // hash/query param carrying the lesson title

// Suggested learning buckets (ordered). Each bucket is matched by tag/keyword.
const ORDER_BUCKETS = [
  { key: "fundamentals", match: ["pitch", "notation", "accidental", "enharmonic", "rhythm", "meter"] },
  { key: "intervals", match: ["interval", "naming intervals", "inversion", "compound"] },
  { key: "major-scale", match: ["major scale", "w-w-h", "construction"] },
  { key: "keys-circle", match: ["key signature", "circle of fifths", "circle of 5ths"] },
  { key: "diatonic-triads", match: ["triads", "diatonic triads"] },
  { key: "diatonic-7ths", match: ["seventh", "7th", "sevenths"] },
  { key: "cadences", match: ["cadence", "voice-leading"] },
  { key: "modes", match: ["mode", "ionian", "dorian", "phrygian", "lydian", "mixolydian", "aeolian", "locrian"] },
  { key: "secondary", match: ["secondary dominant", "v/v", "leading-tone"] },
  { key: "borrowed", match: ["borrowed", "modal mixture", "♭", "bVII"] },
  { key: "progressions", match: ["progression", "ii-v-i", "i–v–vi–iv", "form"] },
  { key: "ear", match: ["ear training", "application", "repertoire"] },
];

function normalize(s) { return (s || "").toLowerCase(); }

function bucketIndex(lesson) {
  const hay = normalize(lesson.title + " " + (lesson.tags || []).join(" "));
  for (let i = 0; i < ORDER_BUCKETS.length; i++) {
    const any = ORDER_BUCKETS[i].match.some(k => hay.includes(normalize(k)));
    if (any) return i;
  }
  if (hay.includes("intro") || hay.includes("overview")) return 0;
  return Math.floor(ORDER_BUCKETS.length / 2);
}

function parseTOC(text) {
  // Lines like: Title | https://url | tag1, tag2
  return text
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean)
    .map((line, idx) => {
      const parts = line.split("|").map(x => x.trim());
      let [title, urlMaybe, tagCsv] = parts;

      if (urlMaybe && !/^https?:\/\//i.test(urlMaybe)) {
        tagCsv = [urlMaybe, tagCsv].filter(Boolean).join(",");
        urlMaybe = "";
      }

      const tags = (tagCsv || "")
        .split(/[,;]/)
        .map(t => t.trim())
        .filter(Boolean);

      return {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + "-" + idx),
        title: title || `Lesson ${idx + 1}`,
        // IMPORTANT: always point to BASE_URL, carry the lesson title in the hash
        url: `${BASE_URL}#${PARAM}=${encodeURIComponent(title || `Lesson ${idx + 1}`)}`,
        tags,
        notes: "",
        done: false,
      };
    });
}

// --- Bookmarklet (drag to bookmarks bar). After Beato loads, click it to jump to the lesson in the hash.
function bookmarkletHref() {
  const code = `(function(){try{var p=new URLSearchParams(location.search||location.hash.slice(1)),w=p.get('${PARAM}');if(!w){alert('No ${PARAM}=… in URL');return;}var q=function(s,t){return new Promise(function(r,j){var t0=performance.now(),f=function(){var e=document.querySelector(s);if(e)return r(e);if(performance.now()-t0>t)return j(new Error('timeout'));requestAnimationFrame(f)};f()})};var byText=function(t){t=(t||'').trim();var A=[...document.querySelectorAll('button')];return A.find(b=>b.textContent.trim()===t)};var sr=()=>[...document.querySelectorAll('button .sr-only')].find(s=>/Open Table of Contents/i.test(s.textContent))?.closest('button');sr()?.click();q('[role="dialog"]',10000).then(function(){['Theory and Harmony','Chord Forms','Scales and Arpeggios','Linear Studies','Technique and Practice'].forEach(function(n){var b=byText(n);if(b&&b.getAttribute('aria-expanded')==='false')b.click()});var L=byText(w);if(L){L.click()}else{alert('Could not find: '+w)}}).catch(console.warn)}catch(e){console.error(e);alert('Bookmarklet error: '+e.message)}})();`;
  return `javascript:${encodeURIComponent(code)}`;
}

function App() {
  const [lessons, setLessons] = useState([]);
  const [pasteBox, setPasteBox] = useState("");
  const [filter, setFilter] = useState("");
  const [dirty, setDirty] = useState(false);

  // Load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setLessons(JSON.parse(raw));
    } catch (err) {
      console.error(err);
    }
  }, []);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lessons));
    setDirty(false);
  }, [lessons]);

  // --- If this code runs on the Beato domain (e.g., via userscript), auto-click the lesson carried in hash/query.
  useEffect(() => {
    if (!/learn\.beatobook\.com$/.test(location.host)) return;
    const params = new URLSearchParams(location.search || location.hash.slice(1));
    const wanted = params.get(PARAM);
    if (!wanted) return;

    const waitFor = (sel, timeout = 10000) =>
      new Promise((res, rej) => {
        const t0 = performance.now();
        const tick = () => {
          const el = document.querySelector(sel);
          if (el) return res(el);
          if (performance.now() - t0 > timeout) return rej(new Error("timeout"));
          requestAnimationFrame(tick);
        };
        tick();
      });

    const findButtonByText = (txt) =>
      [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === txt);

    (async () => {
      const tocBtn = [...document.querySelectorAll("button .sr-only")]
        .find((s) => /Open Table of Contents/i.test(s.textContent))
        ?.closest("button");
      tocBtn?.click();

      await waitFor('[role="dialog"]');

      const sections = [
        "Theory and Harmony",
        "Chord Forms",
        "Scales and Arpeggios",
        "Linear Studies",
        "Technique and Practice",
      ];
      for (const name of sections) {
        const secBtn = findButtonByText(name);
        if (secBtn && secBtn.getAttribute("aria-expanded") === "false") secBtn.click();
      }

      const lessonBtn = findButtonByText(wanted);
      if (lessonBtn) lessonBtn.click();

      history.replaceState({}, "", location.pathname); // clean hash
    })().catch(console.warn);
  }, []);

  const filtered = useMemo(() => {
    const q = normalize(filter);
    if (!q) return lessons;
    return lessons.filter(l =>
      normalize(l.title).includes(q) ||
      (l.tags || []).some(t => normalize(t).includes(q))
    );
  }, [lessons, filter]);

  function addFromPaste() {
    const newOnes = parseTOC(pasteBox);
    if (newOnes.length === 0) return;
    setLessons(prev => [...prev, ...newOnes]);
    setPasteBox("");
  }

  function applySuggestedOrder() {
    const next = [...lessons].map(l => ({ ...l, _bucket: bucketIndex(l) }));
    next.sort((a, b) => a._bucket - b._bucket || a.title.localeCompare(b.title));
    next.forEach(n => delete n._bucket);
    setLessons(next);
  }

  function move(id, dir) {
    const idx = lessons.findIndex(l => l.id === id);
    if (idx < 0) return;
    const j = dir === "up" ? idx - 1 : idx + 1;
    if (j < 0 || j >= lessons.length) return;
    const next = [...lessons];
    const tmp = next[idx]; next[idx] = next[j]; next[j] = tmp;
    setLessons(next);
  }

  function toggleDone(id) {
    setLessons(lessons.map(l => l.id === id ? { ...l, done: !l.done } : l));
  }

  function updateNotes(id, notes) {
    setDirty(true);
    setLessons(lessons.map(l => l.id === id ? { ...l, notes } : l));
  }

  function removeLesson(id) {
    setLessons(lessons.filter(l => l.id !== id));
  }

  async function askGPT(lesson) {
    const prompt =
`I'm studying a music theory lesson titled "${lesson.title}" (${lesson.url || "no link"}).

Please explain this topic clearly for a guitarist at an intermediate level. 
1) Start with a one-paragraph overview. 
2) Give the definitions and the minimal rules. 
3) Show 2-3 practical fretboard examples in C and G (ASCII tab okay). 
4) Common mistakes & quick checks. 
5) One drill I can do in 5 minutes.

If helpful, relate it to earlier topics (intervals → scales → diatonic triads → sevenths → modes).`;

    try {
      await navigator.clipboard.writeText(prompt);
      alert("Prompt copied to clipboard. Paste it into your GPT chat 👍");
    } catch {
      const blob = new Blob([prompt], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    }
  }

  function exportJson() {
    const data = JSON.stringify(lessons, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "beato-study-plan.json";
    a.click(); URL.revokeObjectURL(url);
  }

  function importJson(ev) {
    const file = ev.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const arr = JSON.parse(String(reader.result || "[]"));
        if (Array.isArray(arr)) setLessons(arr);
      } catch {
        alert("Invalid JSON");
      }
    };
    reader.readAsText(file);
  }

  // seed demo if empty
  useEffect(() => {
    if (lessons.length) return;
    const demo = parseTOC(
`Introduction | ${BASE_URL} |
How to Use This Book | ${BASE_URL} |
Chapter Video | ${BASE_URL} |
Theory and Harmony | ${BASE_URL} | theory, harmony
Naming Intervals | ${BASE_URL} | intervals
Enharmonic Intervals | ${BASE_URL} | intervals
The Circle of 5ths | ${BASE_URL} | key signature, circle of fifths
Chords and Their Formulas | ${BASE_URL} | chords
Major Scale (Triads and Sevenths) | ${BASE_URL} | triads,sevenths
Major Scale Modal Sounds | ${BASE_URL} | modes`
    );
    setLessons(demo);
  }, []); // run once

  return (
    <div style={S.page}>
      <h1 style={S.h1}>Beato Study Planner</h1>

      <div style={{ ...S.card }}>
        <div style={{ ...S.row, marginBottom: 8 }}>
          <input
            style={{ ...S.input, flex: "1 1 240px" }}
            placeholder="Filter (title or tag)…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
          <button style={S.btn} onClick={applySuggestedOrder}>Apply suggested order</button>
          <button style={S.btnGhost} onClick={exportJson}>Export JSON</button>
          <label style={{ ...S.btnGhost, display: "inline-block" }}>
            Import JSON
            <input type="file" accept="application/json" onChange={importJson} style={{ display: "none" }} />
          </label>
        </div>

        <details>
          <summary style={{ cursor: "pointer", marginBottom: 8 }}>
            Paste TOC lines <span style={S.small}>(Title | URL | tags,comma)</span>
          </summary>
          <textarea
            style={S.textarea}
            placeholder={`Naming Intervals | https://... | intervals\nMajor Scale (Triads and Sevenths) | https://... | triads,sevenths`}
            value={pasteBox}
            onChange={e => setPasteBox(e.target.value)}
          />
          <div style={{ marginTop: 8 }}>
            <button style={S.btn} onClick={addFromPaste}>Add lessons</button>
          </div>
        </details>
      </div>

      {/* Bookmarklet helper */}
      <div style={{ ...S.card }}>
        <div style={{ marginBottom: 6, fontWeight: 600 }}>Jump-to-lesson helper</div>
        <div style={S.small}>
          1) Click a lesson below (opens Beato with <code>#{PARAM}=…</code>). 2) On the Beato page, click this{" "}
          <a href={bookmarkletHref()} title="Drag this to your bookmarks bar">
            <b>Beato Jump</b>
          </a>{" "}
          bookmarklet to auto-open the exact lesson.
        </div>
      </div>

      <ol style={{ paddingLeft: 0, listStyle: "none", marginTop: 12 }}>
        {filtered.map((l, i) => (
          <li key={l.id} style={S.card}>
            <div style={{ ...S.row, justifyContent: "space-between" }}>
              <div style={{ flex: "1 1 auto" }}>
                <div style={{ fontWeight: 600, fontSize: 16 }}>
                  {i + 1}.{" "}
                  <a href={l.url || BASE_URL} target="_blank" rel="noreferrer">
                    {l.title}
                  </a>
                </div>
                <div style={{ marginTop: 4 }}>
                  {(l.tags || []).map(t => (
                    <span key={t} style={S.tag}>{t}</span>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", gap: 6 }}>
                <button style={S.btnGhost} onClick={() => move(l.id, "up")}>↑</button>
                <button style={S.btnGhost} onClick={() => move(l.id, "down")}>↓</button>
                <button style={S.btnGhost} onClick={() => askGPT(l)}>Ask GPT</button>
                <button style={S.btnGhost} onClick={() => toggleDone(l.id)}>
                  {l.done ? "✅ Done" : "Mark done"}
                </button>
                <button style={{ ...S.btnGhost, borderColor: "#e55", color: "#b00" }} onClick={() => removeLesson(l.id)}>
                  Delete
                </button>
              </div>
            </div>

            <div style={{ marginTop: 8 }}>
              <textarea
                style={{ ...S.textarea, minHeight: 80 }}
                placeholder="Your notes on this lesson…"
                value={l.notes || ""}
                onChange={e => updateNotes(l.id, e.target.value)}
              />
              <div style={{ ...S.row, justifyContent: "space-between" }}>
                <span style={S.small}>{l.url}</span>
                {dirty ? <span style={S.small}>Saving…</span> : <span style={S.small}>Saved</span>}
              </div>
            </div>
          </li>
        ))}
      </ol>

      {filtered.length === 0 && (
        <p style={S.small}>No lessons yet. Paste a TOC above to get started.</p>
      )}

      <div style={{ ...S.card, marginTop: 24 }}>
        <b>Suggested order logic</b>
        <p style={S.small}>
          Intervals → Major scale → Key signatures/Circle → Diatonic triads → Sevenths → Cadences →
          Modes → Secondary dominants → Borrowed chords → Progressions/Form → Ear training.
        </p>
      </div>
    </div>
  );
}

export default App;
