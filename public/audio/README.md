# Ambient audio

The focus chamber loops ambient tracks through Howler
(`src/hooks/use-ambient-audio.ts`). The files are not committed — they are large
and their licences vary — so add your own here, matching the ids in
`src/stores/audio-store.ts`:

```
public/audio/
  rain.mp3
  cafe.mp3
  white-noise.mp3
  forest.mp3
  fireplace.mp3
```

Requirements that matter in practice:

- **Seamless loop.** Howler is used instead of `<audio loop>` precisely to avoid
  the gap at the loop point, but that only helps if the file itself loops
  cleanly — trim on a zero crossing.
- **Mono, 96–128 kbps, 60–120 seconds.** Ambient noise gains nothing from
  stereo or a high bitrate, and a 2 MB file on an Iranian mobile connection is a
  real cost.
- **Normalised to about −20 LUFS.** Tracks at different loudness make the
  selector feel broken.

With a file missing, the track's button is still shown and simply plays nothing;
the rest of the timer is unaffected. Good public-domain sources: freesound.org
(CC0 filter) and archive.org.
