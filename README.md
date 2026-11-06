# Plateload

A one-person, offline workout logger for the year-long strength and aesthetics plan.
Open it, do the set, tap the check. That's the whole job.

## Using it

- **Today** opens the right session for the day. Weights and reps are already filled in from last time.
- **Log a set:** tap the check. Tap it again to undo.
- **Change a number:** tap the weight × reps to open − and + for that set, or tap the number inside to type it. Changing set 1 updates the sets below it.
- **Add weight:** a yellow +5 kg badge means you earned it; the new weight is already filled in.
- **Heavy lifts** show warm-up weights and the plates to load on each side.
- **Rest-pause sets:** after logging the last set, log your mini-set reps underneath.
- **Rest timer** starts on its own: 30 s between superset A and B, then the full rest.
- **Week** shows the whole week and where you are in the 13-week quarter. Tap any session to do it today instead.
- **Progress** shows estimated maxes for the four benchmark lifts, bodyweight and measurements.
- **Settings:** theme (auto, light, dark), deload this week, drop Sunday lateral raises, barbell weight, backup and restore.

## Files

```
index.html   app shell
app.js       screens and taps
logic.js     weeks, blocks and progression (no UI, unit tested)
plan.js      the program (v7). Edit this to change exercises.
store.js     saves to localStorage and IndexedDB, heals one from the other
styles.css   styling (chalk light theme, graphite dark theme)
fonts/       Archivo, bundled so it works offline (SIL Open Font License)
sw.js        offline support
manifest.json, icons/   home screen app
```

Logs are keyed by exercise id, so renaming an exercise in `plan.js` keeps its history.

## Deploy to GitHub Pages

Replace the files in your repo with these, then:

```
git add -A
git commit -m "Plateload: new app for the year-long plan"
git push
```

Open the app once, close it, and open it again so the new version takes over the old offline cache.

To change the web address to `/plateload/`, rename the repo on GitHub (Settings, Repository name). Your log carries over, because it's stored per site (shubh0614.github.io), not per repo. Remove the old home screen icon and add the app again from the new address.

## Backups

Your log lives on the phone. Use Settings, Back up log, about once a week and keep the file somewhere safe. The app reminds you after 7 days.

The old app's data is untouched; this version stores its log under new keys.
