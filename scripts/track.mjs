import { readFileSync, writeFileSync, existsSync } from "node:fs";
const cfg = JSON.parse(readFileSync("config.json", "utf8"));
const KEY = process.env.IGNAV_API_KEY, TOPIC = process.env.NTFY_TOPIC;
if (!KEY) { console.error("Missing IGNAV_API_KEY secret"); process.exit(1); }
const db = existsSync("data/history.json") ? JSON.parse(readFileSync("data/history.json", "utf8")) : { routes: {}, alerts: [] };
const today = new Date().toISOString().slice(0, 10);
const stopsOf = l => (l ? Math.max(0, l.segments.length - 1) : 0);
const money = n => "$" + Math.round(n).toLocaleString();

function matches(it, r) {
  if (!(it.price?.amount > 0)) return false;
  const stops = Math.max(stopsOf(it.outbound), stopsOf(it.inbound));
  if (r.maxStops != null && stops > r.maxStops) return false;
  if (r.airlines?.length) {
    const codes = [...(it.outbound?.segments || []), ...(it.inbound?.segments || [])].map(s => s.marketing_carrier_code);
    if (!codes.every(c => r.airlines.includes(c))) return false;
  }
  return true;
}
async function search(r) {
  const rt = !!r.return_date;
  const res = await fetch("https://ignav.com/api/fares/" + (rt ? "round-trip" : "one-way"), {
    method: "POST",
    headers: { "X-Api-Key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ origin: r.origin, destination: r.destination, departure_date: r.departure_date, ...(rt && { return_date: r.return_date }) })
  });
  if (!res.ok) throw new Error(res.status + " " + (await res.text()));
  return (await res.json()).itineraries || [];
}
const pending = [];
async function notify(msg) {
  console.log("ALERT:", msg);
  pending.push(msg);
  db.alerts.unshift({ t: new Date().toISOString(), msg });
  db.alerts = db.alerts.slice(0, 50);
  if (TOPIC) await fetch("https://ntfy.sh/" + TOPIC, { method: "POST", headers: { Title: "Fare drop", Tags: "airplane" }, body: msg }).catch(() => {});
}

for (const r of cfg.routes) {
  if (r.departure_date < today) { console.log("Skipping past route", r.id); continue; }
  try {
    const best = (await search(r)).filter(it => matches(it, r)).sort((a, b) => a.price.amount - b.price.amount)[0];
    if (!best) { console.log("No matching fares for", r.id); continue; }
    const h = (db.routes[r.id] ||= []), p = best.price.amount;
    const prices = h.map(x => x.p), prev = prices.at(-1), low = Math.min(...prices);
    const label = `${r.origin} → ${r.destination}`;
    h.push({ t: new Date().toISOString(), p, cur: best.price.currency, air: best.outbound?.carrier || "", stops: Math.max(stopsOf(best.outbound), stopsOf(best.inbound)) });
    const drop = cfg.dropPercent ?? 5;
    if (prev && p <= prev * (1 - drop / 100)) await notify(`${label} dropped to ${money(p)} (was ${money(prev)}).`);
    if (prices.length >= 3 && p < low) await notify(`${label} hit a new low: ${money(p)}.`);
    if (r.target && p <= r.target && (!prev || prev > r.target)) await notify(`${label} is at or below your ${money(r.target)} target: ${money(p)}.`);
  } catch (e) { console.error("Route failed:", r.id, e.message); }
}
const { RESEND_API_KEY, EMAIL_TO, SITE_URL } = process.env;
if (pending.length && RESEND_API_KEY && EMAIL_TO) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Fare Watch <onboarding@resend.dev>",
      to: [EMAIL_TO],
      subject: `Fare alert: ${pending.length} price ${pending.length > 1 ? "changes" : "change"}`,
      text: pending.join("\n\n") + (SITE_URL ? "\n\nDashboard: " + SITE_URL : "")
    })
  });
  if (!res.ok) console.error("Email failed:", res.status, await res.text());
}
writeFileSync("data/history.json", JSON.stringify(db, null, 1));
