# Travel Lust

A travel agent you talk to. Tell it the trip in your own words. It asks for what is missing, shows live fares, and waits for your choice at each step. Then it gives you the link to book.

Flights only for now. Hotels and itineraries come next.

## How it works

- **Agent:** LangGraph, in `server/app/graph.py`. It pauses with `interrupt()` at every choice, and checkpoints let a conversation survive a reload.
- **Model:** Gemini reads typed messages and turns them into trip details and filters. It never produces a flight fact. Tapping an option costs no Gemini request.
- **Fares:** live from Google Flights, read directly in `server/app/flights/google.py`. This is unofficial, so it can break if Google changes the page or blocks a server IP.
- **Sellers:** with `SERPAPI_API_KEY` set, the booking step lists sellers with the cheapest first. SerpApi is also the backup for search. Without the key, the booking link opens the chosen flights on Google Flights.
- **UI:** React and Tailwind, in `frontend/`.

## Run it

```bash
cd server
python3.12 -m venv venv
venv/bin/pip install -r requirements.txt
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

## License

MIT. See [LICENSE](LICENSE).
