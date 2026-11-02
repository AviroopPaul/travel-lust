# Travelust

A travel agent you talk to. Tell it the trip in your own words. It asks for what is missing, shows live fares, and waits for your choice at each step. It plans your days, adds your flights in either order, gives you the link to book, and exports the whole trip as a PDF.

Travelust does not suggest hotels. Where you sleep is personal, and many other services already do it. The product puts its work into the two hard parts: flights and days.

## How it works

- **Agent:** LangGraph, in `server/app/graph.py`. It pauses with `interrupt()` at every choice, and checkpoints let a conversation survive a reload.
- **Model:** Gemini reads typed messages and turns them into trip details and filters. It never produces a flight fact. Tapping an option costs no Gemini request.
- **Fares:** live from Google Flights, read directly in `server/app/flights/google.py`. This is unofficial, so it can break if Google changes the page or blocks a server IP.
- **Sellers:** with `SERPAPI_API_KEY` set, the booking step lists sellers with the cheapest first. SerpApi is also the backup for search. Without the key, the booking link opens the chosen flights on Google Flights.
- **Day plan:** the agent asks about pace, famous or little-known places, and interests. Places come from Wikivoyage's API and a Google Search run by Gemini's search tool (`server/app/places/`). Gemini suggests which place goes on which day. Times, order, travel estimates and swaps are plain code in `server/app/trip.py`, and a swap costs no Gemini request.
- **PDF:** `server/app/pdf.py` draws the same data the plan screen shows, with ReportLab and the Geist font.
- **Home page:** `/` is the landing page (`components/home/`). `/plan` is the app. The screenshots in `public/landing/` are real captures of a Dubai trip and a Kyoto trip, in light and dark.
- **UI:** React and Tailwind, in `frontend/`. Every decision happens in the chat (`components/chat/`), including flights and filters. The finished plan opens beside it as one story, with flights on the days they happen and one map that follows the day you read (`components/trip/`, Leaflet and OpenStreetMap tiles).

## Run it

```bash
cd server
python3.12 -m venv venv
venv/bin/pip install -r requirements-dev.txt
GOOGLE_API_KEY=... venv/bin/uvicorn app.main:app --port 8020 --reload
```

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5180.

## Test it

```bash
cd server
venv/bin/python -m pytest -q
```

## Deploy

It runs on Vercel as two services, set up in `vercel.json`. A push to `main` deploys.

- **Database:** set `DATABASE_URL` to a Postgres URL for saved trips and rate limits. Without it, the app uses local SQLite and has no rate limits.
- **Keys:** set `GOOGLE_API_KEY`. `SERPAPI_API_KEY` is optional.

## License

MIT. See [LICENSE](LICENSE).
