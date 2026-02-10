# RefactorBot

RefactorBot is an AI-powered code refactoring assistant. This scaffold includes a Vite + React client and an Express server with a stubbed refactor endpoint.

## Structure
- client: Vite + React app
- server: Express API

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

## Next steps
- Wire the /api/refactor endpoint to Gemini
- Add a real diff viewer
- Improve language-aware refactoring prompts
