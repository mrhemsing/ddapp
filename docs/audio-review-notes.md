# Audio Review / ElevenLabs Notes

Developer review page:

- Local: `http://localhost:3002/dev/audio`
- Tunnel: `https://soma2.b-average.com/dev/audio`
- Production: hidden unless `ENABLE_DEV_AUDIO_REVIEW=true`

The page lists:

- route intro and outro audio
- each stop's narration
- drive-to-next leg audio
- ambient bed
- current review script
- safety note
- ritual cue/payoff audio
- Cache API asset manifest

ElevenLabs draft generation from PowerShell:

```bash
$env:ELEVENLABS_API_KEY="..."
npm run generate:elevenlabs
```

The default voice is `Daniel - Steady Broadcaster`:

```text
onwK4e9ZLuTAKqWW03F9
```

Override it with `DARK_DRIVES_VOICE_ID` if needed.

Generated files are written to:

```text
public/audio/elevenlabs-review/
```

Ritual cue/payoff generation:

```bash
npm run generate:rituals
```

Generated ritual files are written to:

```text
public/audio/rituals/
```

The review page automatically shows generated drafts when these files exist:

- `intro.mp3`
- `01-woodlawn.mp3`
- `leg-woodlawn-to-university-bridge.mp3`
- `02-university-bridge.mp3`
- `leg-university-bridge-to-james-anderson.mp3`
- `03-james-anderson.mp3`
- `outro.mp3`

Do not commit API keys. Keep them in local env or deployment secrets only.
