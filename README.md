# Personal-chat (NEXUS // Quantum Comms)

End-to-end encrypted (E2EE) real-time cybernetic communications terminal.

## Features
- Real-time messaging with Socket.io WebSockets
- Audio & Video WebRTC peer-to-peer calling
- Turso Cloud libSQL (SQLite) database with automatic 7-day retention cron
- Ephemeral in-memory media sharing (GIFs, images, audio telemetry)
- Responsive HUD UI with interactive emoji reactions and notifications
- Single-port deployment (Vite SPA + Express backend)

## Deployment on Render
1. Create a new **Web Service** on [Render](https://render.com).
2. Connect this repository.
3. Set **Build Command**: `npm install && npm run build`
4. Set **Start Command**: `npm start`
5. Configure Environment Variables:
   - `TURSO_DATABASE_URL`: your Turso database URL
   - `TURSO_AUTH_TOKEN`: your Turso auth token
   - `JWT_SECRET`: your secret key
   - `PORT`: 3000 (or Render default)
