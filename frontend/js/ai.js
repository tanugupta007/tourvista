import { aiChat, esc } from "./services/geo.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("aiPlannerForm");
  form?.addEventListener("submit", handleGenerateItinerary);
});

async function handleGenerateItinerary(event) {
  event.preventDefault();
  const destination = document.getElementById("aiDestination")?.value.trim();
  const days = Number(document.getElementById("aiDays")?.value);
  const budget = document.getElementById("aiBudget")?.value;
  const style = document.getElementById("aiStyle")?.value;
  const button = document.getElementById("generateBtn");
  const placeholder = document.getElementById("placeholderState");
  const result = document.getElementById("itineraryResult");
  if (!destination || !Number.isInteger(days) || days < 1 || days > 30 || !result) return;

  const original = button?.innerHTML;
  if (button) { button.disabled = true; button.textContent = "Generating itinerary…"; }
  if (placeholder) placeholder.hidden = true;
  result.style.display = "block";
  result.textContent = "TourVista AI is preparing your itinerary…";
  try {
    const prompt = `Create a practical ${days}-day ${style || "general"} itinerary for ${destination} in India. Budget: ${budget || "not specified"}. Include morning, afternoon, evening, local food ideas, and approximate INR budget guidance. State that prices and schedules must be verified.`;
    const data = await aiChat([{ role: "user", content: prompt }], {});
    result.innerHTML = `<h2>${days}-Day ${esc(style || "Travel")} Itinerary: ${esc(destination)}</h2><div class="ai-itinerary-copy">${esc(data.reply).replace(/\n/g, "<br>")}</div>`;
  } catch (error) {
    result.textContent = error.message || "The AI planner is unavailable. Please try again later.";
  } finally {
    if (button) { button.disabled = false; button.innerHTML = original || "Generate Itinerary"; }
  }
}
