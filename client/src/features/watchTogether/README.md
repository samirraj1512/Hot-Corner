# Watch Together configuration

The feature is self-contained in this folder. Add the following values to the existing environment files before using Google Drive or deploying calls.

Client `.env`:

```env
VITE_GOOGLE_CLIENT_ID=your-google-oauth-web-client-id
# Optional. Use TURN credentials in production; the app falls back to a public STUN server locally.
VITE_WATCH_TOGETHER_ICE_SERVERS=[{"urls":"turn:turn.example.com:3478","username":"user","credential":"password"}]
```

Server `.env`:

```env
# Comma-separated browser origins allowed to call the API and Socket.IO server.
CLIENT_URL=http://localhost:5173
# Rooms are automatically removed after this many hours (1-168).
WATCH_ROOM_TTL_HOURS=24
```

The Google OAuth client needs an authorized JavaScript origin for the client URL. When the room owner enables the Drive sharing checkbox, the selected file receives Google Drive's "anyone with the link" reader permission so invited guests can load it.
