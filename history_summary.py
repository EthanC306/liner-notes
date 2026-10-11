"""
Summarize your Spotify streaming history for the app: how long you've listened to each
artist, and your most-played songs by them. Saves listening_history.json.

Get the history from Spotify: Account -> Privacy settings -> Download your data ->
"Extended streaming history". Put the Streaming_History_Audio_*.json files in
data/history/ (that folder is kept out of git: the raw files include your IP address
on every play). The summary keeps none of that, just artists, songs and times.

Run:
  python history_summary.py
"""

import glob
import json
import os
import sys

HISTORY_GLOB = os.path.join("data", "history", "Streaming_History_Audio_*.json")
OUTPUT_FILE = "listening_history.json"
# A play counts as a listen once it lasts 30 seconds, the same line Spotify uses.
COUNTED_PLAY_MS = 30_000
TOP_SONGS = 5


def summarize(plays):
    """Totals per artist from a list of history rows. Podcasts and audiobooks are skipped."""
    artists = {}
    first = last = None
    for row in plays:
        artist = row.get("master_metadata_album_artist_name")
        track = row.get("master_metadata_track_name")
        if not artist or not track:
            continue  # a podcast episode, an audiobook, or a row with no song
        ms = int(row.get("ms_played") or 0)
        ts = row.get("ts")
        a = artists.setdefault(artist, {"ms": 0, "plays": 0, "first": ts, "last": ts, "songs": {}})
        a["ms"] += ms
        if ms >= COUNTED_PLAY_MS:
            a["plays"] += 1
        if ts and (not a["first"] or ts < a["first"]):
            a["first"] = ts
        if ts and (not a["last"] or ts > a["last"]):
            a["last"] = ts
        a["songs"][track] = a["songs"].get(track, 0) + ms
        if ts:
            first = ts if not first or ts < first else first
            last = ts if not last or ts > last else last

    out = {}
    for name, a in artists.items():
        songs = sorted(a["songs"].items(), key=lambda kv: -kv[1])[:TOP_SONGS]
        out[name] = {
            "hours": round(a["ms"] / 3_600_000, 3),
            "plays": a["plays"],
            "first": a["first"],
            "last": a["last"],
            "top_songs": [{"name": t, "hours": round(ms / 3_600_000, 3)} for t, ms in songs],
        }
    return {"from": first, "to": last, "artists": out}


def main():
    files = sorted(glob.glob(HISTORY_GLOB))
    if not files:
        sys.exit("No history files in data/history/. See the note at the top of this script.")
    plays = []
    for path in files:
        with open(path, encoding="utf-8") as f:
            plays.extend(json.load(f))
    summary = summarize(plays)
    with open(OUTPUT_FILE + ".tmp", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=1)
    os.replace(OUTPUT_FILE + ".tmp", OUTPUT_FILE)
    hours = sum(a["hours"] for a in summary["artists"].values())
    print("Read " + str(len(plays)) + " plays from " + str(len(files)) + " files: "
          + str(len(summary["artists"])) + " artists, " + str(round(hours)) + " hours, "
          + str(summary["from"])[:10] + " to " + str(summary["to"])[:10] + ". Saved to " + OUTPUT_FILE)


if __name__ == "__main__":
    main()
