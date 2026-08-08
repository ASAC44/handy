/**
 * Design languages ("learnable styles") + themed prototype builders.
 * Shared so the server can stream a themed prototype in mock mode, and so the
 * web app can describe what was rendered. In live mode the same token set is
 * injected into the prototype agent's system prompt (real preference learning).
 */

export type ThemeKey = "midnight" | "warm" | "neon";
export type PrototypeKey = "kanban" | "dashboard" | "landing";

export interface ThemeTokens {
  key: ThemeKey;
  name: string;
  bg: string;
  surface: string;
  surface2: string;
  ink: string;
  mut: string;
  border: string;
  accent: string;
  accent2: string;
  radius: string;
  pad: string;
  font: string;
  shadow: string;
  density: string;
  typeLabel: string;
}

export const THEMES: Record<ThemeKey, ThemeTokens> = {
  midnight: { key: "midnight", name: "Midnight", bg: "#0e1320", surface: "#1a2236", surface2: "#121829", ink: "#e8edf7", mut: "#8d9bb5", border: "#232c44", accent: "#6ee7b7", accent2: "#7c9cff", radius: "8px", pad: "8px", font: 'system-ui,"Segoe UI",sans-serif', shadow: "0 1px 0 #0c1120", density: "Cozy", typeLabel: "Geometric sans" },
  warm: { key: "warm", name: "Warm", bg: "#f6efe4", surface: "#fffaf2", surface2: "#efe5d5", ink: "#3a322a", mut: "#9b8b76", border: "#e3d6c2", accent: "#e8883a", accent2: "#cf6a4c", radius: "16px", pad: "11px", font: '"Iowan Old Style",Palatino,Georgia,serif', shadow: "0 2px 6px rgba(120,90,50,.12)", density: "Airy", typeLabel: "Editorial serif" },
  neon: { key: "neon", name: "Neon", bg: "#080611", surface: "#160f29", surface2: "#0f0b1f", ink: "#eef0ff", mut: "#9a90c8", border: "#2a1f4d", accent: "#c77dff", accent2: "#3fe0ff", radius: "4px", pad: "7px", font: '"SF Mono",ui-monospace,Menlo,monospace', shadow: "0 0 12px rgba(199,125,255,.25)", density: "Compact", typeLabel: "Mono" },
};

/** Order the prototype agent fans out, and the variant it recommends. */
export const FANOUT: ThemeKey[] = ["midnight", "warm", "neon"];
export const RECOMMENDED: ThemeKey = "warm";

function rootCss(t: ThemeTokens): string {
  return `:root{--bg:${t.bg};--surface:${t.surface};--surface2:${t.surface2};--ink:${t.ink};--mut:${t.mut};--border:${t.border};--ac:${t.accent};--ac2:${t.accent2};--rad:${t.radius};--pad:${t.pad};--font:${t.font};--shadow:${t.shadow};}`;
}

function kanban(t: ThemeTokens): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${rootCss(t)}*{box-sizing:border-box;font-family:var(--font)}body{margin:0;background:var(--bg);color:var(--ink);padding:14px}h1{font-size:14px;margin:0 0 2px}.sub{color:var(--mut);font-size:11px;margin:0 0 12px}.board{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.col{background:var(--surface2);border:1px solid var(--border);border-radius:var(--rad);padding:7px;min-height:124px}.col h2{font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:var(--mut);margin:3px 5px 7px;display:flex;justify-content:space-between}.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--rad);padding:var(--pad);margin:5px 0;font-size:12px;cursor:grab;box-shadow:var(--shadow)}.card .tag{display:inline-block;font-size:9px;padding:1px 6px;border-radius:99px;background:var(--ac);color:var(--bg);margin-bottom:4px;font-weight:700}.card.b .tag{background:var(--ac2)}.chart{margin-top:10px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--rad);padding:9px}.chart h2{font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:var(--mut);margin:0 0 6px}</style></head><body><h1>Q3 Planning — Sprint Board</h1><p class="sub">drag cards across columns</p><div class="board"><div class="col" data-c="todo"><h2>To Do <span id="n0">0</span></h2></div><div class="col" data-c="doing"><h2>In Progress <span id="n1">0</span></h2></div><div class="col" data-c="done"><h2>Done <span id="n2">0</span></h2></div></div><div class="chart"><h2>Sprint burndown</h2><svg id="bd" viewBox="0 0 320 66" width="100%" height="66"></svg></div><script>var AC="${t.accent}",GR="${t.border}";var data=[["todo","Auth flow","feat"],["todo","Billing API","feat"],["doing","Dashboard UI","feat","b"],["doing","WS event bus","feat","b"],["done","DB schema","feat"]];var cols={};document.querySelectorAll(".col").forEach(function(c){cols[c.dataset.c]=c});var drag=null;data.forEach(function(d){var el=document.createElement("div");el.className="card"+(d[3]?" "+d[3]:"");el.draggable=true;el.innerHTML="<span class='tag'>"+d[2]+"</span><div>"+d[1]+"</div>";el.addEventListener("dragstart",function(){drag=el});cols[d[0]].appendChild(el)});document.querySelectorAll(".col").forEach(function(c){c.addEventListener("dragover",function(e){e.preventDefault()});c.addEventListener("drop",function(e){e.preventDefault();if(drag){c.appendChild(drag);count()}})});function count(){["todo","doing","done"].forEach(function(k,i){document.getElementById("n"+i).textContent=cols[k].querySelectorAll(".card").length})}count();var ideal=[60,48,36,24,12,0],actual=[60,53,45,31,21,9];function pts(a){return a.map(function(v,i){return (i*60+10)+","+(58-v*0.8).toFixed(0)}).join(" ")}document.getElementById("bd").innerHTML='<polyline fill="none" stroke="'+GR+'" stroke-dasharray="4 4" stroke-width="2" points="'+pts(ideal)+'"/><polyline fill="none" stroke="'+AC+'" stroke-width="2.5" points="'+pts(actual)+'"/>';</script></body></html>`;
}

function dashboard(t: ThemeTokens): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${rootCss(t)}*{box-sizing:border-box;font-family:var(--font)}body{margin:0;background:var(--bg);color:var(--ink);padding:14px}h1{font-size:14px;margin:0 0 2px}.sub{color:var(--mut);font-size:11px;margin:0 0 12px}.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:11px}.kpi{background:var(--surface);border:1px solid var(--border);border-radius:var(--rad);padding:11px}.kpi .l{font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:var(--mut)}.kpi .v{font-size:20px;font-weight:700;margin-top:3px}.kpi .d{font-size:10px;margin-top:2px}.up{color:var(--ac)}.down{color:#ff8b6b}.chart{background:var(--surface);border:1px solid var(--border);border-radius:var(--rad);padding:11px}.chart h2{font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:var(--mut);margin:0 0 9px}.bars{display:flex;align-items:flex-end;gap:7px;height:80px}.bars .b{flex:1;background:linear-gradient(180deg,var(--ac2),var(--ac));border-radius:var(--rad) var(--rad) 0 0;min-height:4px;transition:height .4s}</style></head><body><h1>Growth Dashboard</h1><p class="sub">live · updated just now</p><div class="kpis"><div class="kpi"><div class="l">MRR</div><div class="v">$142k</div><div class="d up">&#9650; 9% MoM</div></div><div class="kpi"><div class="l">Churn</div><div class="v">4.1%</div><div class="d down">&#9650; 0.6 pts</div></div><div class="kpi"><div class="l">WAU</div><div class="v">12.0k</div><div class="d up">&#9650; 4% WoW</div></div></div><div class="chart"><h2>Weekly active users</h2><div class="bars" id="bars"></div></div><script>var d=[7.8,8.4,9.1,9.6,10.3,11.1,11.6,12.0],m=12.6;var w=document.getElementById("bars");d.forEach(function(v){var b=document.createElement("div");b.className="b";b.style.height=(v/m*100)+"%";w.appendChild(b)});</script></body></html>`;
}

function landing(t: ThemeTokens): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${rootCss(t)}*{box-sizing:border-box;font-family:var(--font)}body{margin:0;background:radial-gradient(120% 80% at 50% -10%,var(--surface),var(--bg) 62%);color:var(--ink);padding:20px;text-align:center}.badge{display:inline-block;font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--ac2);border:1px solid var(--border);border-radius:99px;padding:4px 11px;margin-bottom:12px}h1{font-size:23px;line-height:1.15;margin:0 0 9px;letter-spacing:-.5px}h1 b{background:linear-gradient(90deg,var(--ac),var(--ac2));-webkit-background-clip:text;background-clip:text;color:transparent}p.s{color:var(--mut);font-size:13px;max-width:330px;margin:0 auto 15px}.cta{display:flex;gap:8px;max-width:320px;margin:0 auto 20px}.cta input{flex:1;background:var(--surface2);border:1px solid var(--border);border-radius:var(--rad);padding:9px 12px;color:var(--ink);font-size:12px}.cta button{background:linear-gradient(90deg,var(--ac),var(--ac2));border:0;border-radius:var(--rad);padding:9px 15px;font-weight:700;font-size:12px;color:var(--bg);cursor:pointer}.feat{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;max-width:370px;margin:0 auto}.f{background:var(--surface2);border:1px solid var(--border);border-radius:var(--rad);padding:11px 9px}.f .i{font-size:16px;color:var(--ac2)}.f .t{font-size:11px;font-weight:600;margin:5px 0 3px}.f .d{font-size:10px;color:var(--mut);line-height:1.35}</style></head><body><div class="badge">&#9670; launching soon</div><h1>Ship ideas <b>while they&#39;re still spoken</b></h1><p class="s">A panel of AI agents that turns your meeting into working prototypes — live.</p><div class="cta"><input placeholder="you@work.com"><button>Join waitlist</button></div><div class="feat"><div class="f"><div class="i">&#9889;</div><div class="t">Instant</div><div class="d">Idea to artifact in ~2s</div></div><div class="f"><div class="i">&#9673;</div><div class="t">Screen-aware</div><div class="d">Reads your slides</div></div><div class="f"><div class="i">&#8734;</div><div class="t">Ambient</div><div class="d">No prompting needed</div></div></div></body></html>`;
}

const BUILDERS: Record<PrototypeKey, (t: ThemeTokens) => string> = { kanban, dashboard, landing };

/** Render a themed prototype document (used by the mock prototype agent). */
export function buildPrototype(key: PrototypeKey, theme: ThemeTokens): string {
  return (BUILDERS[key] ?? kanban)(theme);
}
