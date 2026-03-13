# RefactorBot

RefactorBot is an AI-powered code refactoring assistant built with a Vite + React client and an Express server.

## Structure
- client: Vite + React app
- server: Express API

## Configure Gemini
Create a server/.env file (see server/.env.example) with your Gemini API key:

```
GEMINI_API_KEY=your_key_here
```

Model selection is handled in the app UI. If no model is specified in environment variables,
the server defaults to `gemini-2.5-flash-lite`.

## Run (dev)
1) In one terminal:
   cd client
   npm install
   npm run dev

2) In another terminal:
   cd server
   npm install
   npm run dev

The client proxies /api requests to http://localhost:3001.

## Current features
- Paste code and upload a source file
- Refactor via Gemini API
- Streaming response handling
- Explanation panel with concise bullets
- Git-style split diff view
- Copy original and copy refactored output
