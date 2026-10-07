# TourVista

AI-assisted travel and booking site with an Express backend, Leaflet maps, and OpenStreetMap services.
https://tourvista-em7p.onrender.com

## Run locally

1. Install Node.js 18 or newer.
2. Open PowerShell in `tourvista/backend`.
3. Copy the environment template: `Copy-Item .env.example .env`.
4. Run `npm ci` once, then `npm start`.
5. Open `http://localhost:5124` (or `http://localhost:5124/map.html`). Geolocation requires HTTPS or localhost.

Map services use public OpenStreetMap/Nominatim, Overpass, and OSRM endpoints by default and need no API keys. These public endpoints are fair-use services, have rate limits, and can be temporarily unavailable. To use Nominatim, set `GEO_USER_AGENT` in `backend/.env` to the app name plus a contact email. Search, route, nearby-place, and tile services require an internet connection.

## AI setup

The AI chat and itinerary planner use an OpenAI-compatible provider through the backend. The AI key is optional and is never stored in frontend code. To enable hosted AI, create a new key in [Groq Console](https://console.groq.com/keys), then set `AI_BASE_URL=https://api.groq.com/openai/v1`, `AI_MODEL=openai/gpt-oss-20b`, and `AI_API_KEY=<your new key>` in `backend/.env`, then restart the server. Never use a key pasted into a chat or commit `.env`. Groq currently has free-plan limits, and this model is also priced per token on paid use; check the [current Groq model pricing](https://console.groq.com/docs/model/openai/gpt-oss-20b) and [plan limits](https://console.groq.com/docs/rate-limits). Another option is an [OpenRouter API key](https://openrouter.ai/settings/keys) with the `https://openrouter.ai/api/v1` base URL and an available free model; free models and rate limits can change. Or use a local Ollama server at `http://localhost:11434/v1` with a locally pulled model; local inference has no API charge but requires suitable hardware. Without configuration, the AI endpoints return a setup message.

## Booking and payment status

Bookings and destination reviews/photos are saved in this browser's local storage and are not shared with other visitors. They are requests only; this project does not have a payment gateway or backend booking database. The displayed total is an estimate and no payment is collected or marked successful. Payment providers such as Razorpay, PhonePe, and Paytm require merchant onboarding and server-side credentials; none are configured here.

## Main folders

- `frontend/`: static HTML pages, styles, and browser modules.
- `backend/server.js`: serves the site and package/destination APIs.
- `backend/geo-ai.js`: place search, reverse geocoding, nearby attractions, routing, and AI proxy.
- `backend/.env.example`: local configuration template. Keep `.env` private.
