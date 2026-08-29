const greetings = [
  "Hello, World!",
  "Hallo, Welt!",
  "Bonjour, le monde !",
  "Hola, mundo!",
  "Ciao, mondo!",
  "こんにちは世界",
];

let index = 0;

document.getElementById("greet").addEventListener("click", () => {
  index = (index + 1) % greetings.length;
  document.getElementById("output").textContent = greetings[index];
});

const rows = document.getElementById("rows");
const total = document.getElementById("total");
const status = document.getElementById("status");
const interval = document.getElementById("interval");

function render(data) {
  total.textContent = `${data.total} row${data.total === 1 ? "" : "s"}`;
  const seconds = Math.round(data.intervalMs / 1000);
  interval.textContent = `${seconds} second${seconds === 1 ? "" : "s"}`;

  rows.replaceChildren();

  if (data.ticks.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "empty";
    const td = document.createElement("td");
    td.colSpan = 2;
    td.textContent = "No rows yet.";
    tr.append(td);
    rows.append(tr);
    return;
  }

  for (const tick of data.ticks) {
    const tr = document.createElement("tr");
    const id = document.createElement("td");
    id.textContent = tick.id;
    const time = document.createElement("td");
    time.textContent = tick.recorded_at.replace("T", " ").replace("Z", "");
    tr.append(id, time);
    rows.append(tr);
  }
}

async function refresh() {
  try {
    const response = await fetch("/api/ticks?limit=100", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    render(await response.json());
    status.textContent = `Last refreshed ${new Date().toLocaleTimeString()}`;
  } catch (error) {
    status.textContent = `Could not reach the server: ${error.message}`;
  }
}

refresh();
setInterval(refresh, 5000);
