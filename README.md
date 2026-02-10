# RefactorBot

RefactorBot is an AI-powered code refactoring assistant. This scaffold includes a Vite + React client and an Express server with a stubbed refactor endpoint.

## Structure
- client: Vite + React app
- server: Express API

## Configure Gemini
Create a server/.env file (see server/.env.example) with your Gemini API key:

```
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash
```

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
- Add a real diff viewer
- Improve language-aware refactoring prompts
