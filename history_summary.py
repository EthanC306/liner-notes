"""
Summarize your Spotify streaming history for the app: plays and hours for every artist
(all time and the last 12 months) and for every playlist song. Saves listening_history.json.

Get the history from Spotify: Account -> Privacy settings -> Download your data ->
"Extended streaming history". Put the Streaming_History_Audio_*.json files in
data/history/ (that folder is kept out of git: the raw files include your IP address
on every play). The summary keeps none of that, just artists, song IDs and totals.

A play shorter than 30 seconds is a skip: it counts toward neither plays nor hours.
History plays match playlist songs by Spotify ID first, then by title plus main artist,
the same way the app matches duplicate songs.

Run:
  python history_summary.py
"""

import glob
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timedelta

HISTORY_GLOB = os.path.join("data", "history", "Streaming_History_Audio_*.json")
PLAYLIST_FILE = "playlist_songs.json"
CORRECTIONS_FILE = "song_corrections.json"
OUTPUT_FILE = "listening_history.json"
# A play counts once it lasts 30 seconds, the same line Spotify uses for a stream.
COUNTED_PLAY_MS = 30_000
RECENT_DAYS = 365


def normalize(text):
    """Same as normalize() in src/build.js: no accents, case or punctuation."""
    text = re.sub(r"['’`]", "", str(text or ""))
    text = "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def name_key(title, artist):
    return normalize(title) + "|" + normalize(artist)


def song_key(song):
    """How the app looks a playlist song up in the summary: its Spotify ID, or its file title."""
    return song["id"] if song.get("id") else "local:" + song["title"]


def playlist_index(songs, corrections=None):
    """Lookup tables from Spotify ID and from title + main artist to each song's key.
    Local files are matched under their corrected title and artist when there is one.
    A duplicate song shares the key of its first copy, the one the app keeps."""
    corrections = corrections or {}
    by_id, by_name = {}, {}
    for s in songs:
        fix = corrections.get("local:" + s["title"]) if s.get("is_local") else None
        names = [name_key(src["title"], src["artists"][0]["name"]) for src in (s, fix)
                 if src and src.get("title") and src.get("artists") and src["artists"][0].get("name")]
        seen = [by_id.get(s.get("id"))] + [by_name.get(n) for n in names]
        key = next((k for k in seen if k), song_key(s))
        if s.get("id"):
            by_id.setdefault(s["id"], key)
        for n in names:
            by_name.setdefault(n, key)
    return by_id, by_name


def match_song(row, by_id, by_name):
    """The playlist song key a history row is a play of, or None."""
    uri = row.get("spotify_track_uri") or ""
    track_id = uri.rsplit(":", 1)[-1] if uri.startswith("spotify:track:") else None
    if track_id and track_id in by_id:
        return by_id[track_id]
    return by_name.get(name_key(row.get("master_metadata_track_name"),
                                row.get("master_metadata_album_artist_name")))


def parse_ts(ts):
    return datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ")


def hours(ms):
    return round(ms / 3_600_000, 2)


def summarize(plays, playlist_songs=(), corrections=None):
    """Totals per artist and per playlist song from a list of history rows.
    Podcasts and audiobooks are left out."""
    music = [r for r in plays if r.get("master_metadata_album_artist_name")
             and r.get("master_metadata_track_name") and r.get("ts")]
    if not music:
        return {"from": None, "to": None, "recent_from": None, "artists": {}, "songs": {}}
    first = min(r["ts"] for r in music)
    last = max(r["ts"] for r in music)
    recent_from = (parse_ts(last) - timedelta(days=RECENT_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    by_id, by_name = playlist_index(playlist_songs, corrections)

    artists, songs = {}, {}
    for row in music:
        name, ts = row["master_metadata_album_artist_name"], row["ts"]
        ms = int(row.get("ms_played") or 0)
        a = artists.setdefault(name, {"ms": 0, "plays": 0, "skips": 0, "recent_ms": 0,
                                      "recent_plays": 0, "first": ts, "last": ts})
        a["first"], a["last"] = min(a["first"], ts), max(a["last"], ts)
        key = match_song(row, by_id, by_name)
        s = songs.setdefault(key, {"ms": 0, "plays": 0, "skips": 0}) if key else None
        if ms < COUNTED_PLAY_MS:
            a["skips"] += 1
            if s:
                s["skips"] += 1
            continue
        a["ms"] += ms
        a["plays"] += 1
        if ts >= recent_from:
            a["recent_ms"] += ms
            a["recent_plays"] += 1
        if s:
            s["ms"] += ms
            s["plays"] += 1

    return {
        "from": first,
        "to": last,
        "recent_from": recent_from,
        "artists": {name: {"hours": hours(a["ms"]), "plays": a["plays"], "skips": a["skips"],
                           "recent_hours": hours(a["recent_ms"]), "recent_plays": a["recent_plays"],
                           "first": a["first"][:10], "last": a["last"][:10]}
                    for name, a in artists.items()},
        "songs": {key: {"hours": hours(s["ms"]), "plays": s["plays"], "skips": s["skips"]}
                  for key, s in songs.items()},
    }


def load_json(path, default):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def main():
    files = sorted(glob.glob(HISTORY_GLOB))
    if not files:
        sys.exit("No history files in data/history/. See the note at the top of this script.")
    plays = []
    for path in files:
        with open(path, encoding="utf-8") as f:
            plays.extend(json.load(f))
    playlist = load_json(PLAYLIST_FILE, {}).get("songs", [])
    summary = summarize(plays, playlist, load_json(CORRECTIONS_FILE, {}))
    with open(OUTPUT_FILE + ".tmp", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(OUTPUT_FILE + ".tmp", OUTPUT_FILE)

    matched = len({song_key(s) for s in playlist} & set(summary["songs"]))
    total = sum(a["hours"] for a in summary["artists"].values())
    print("Read " + str(len(plays)) + " rows from " + str(len(files)) + " files: "
          + str(len(summary["artists"])) + " artists, " + str(round(total)) + " hours, "
          + str(summary["from"])[:10] + " to " + str(summary["to"])[:10] + ". "
          + str(matched) + " of " + str(len(playlist)) + " playlist entries have plays. Saved to "
          + OUTPUT_FILE + " (" + str(os.path.getsize(OUTPUT_FILE) // 1024) + " KB)")


if __name__ == "__main__":
    main()
