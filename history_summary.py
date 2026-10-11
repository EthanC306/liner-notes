"""
Summarize your Spotify streaming history for the app: plays and hours for every artist
(all time and the last 12 months) and for every playlist song. Saves listening_history.json.

Get the history from Spotify: Account -> Privacy settings -> Download your data ->
"Extended streaming history". Put the Streaming_History_Audio_*.json files in
data/history/ (that folder is kept out of git: the raw files include your IP address
on every play). The summary keeps none of that, just artists, song IDs and totals.

A play shorter than 30 seconds is a skip: it doesn't count as a play, but the time
listened still counts toward hours. Plays are counted per year in your local time zone
(the computer's, or HISTORY_TZ, e.g. HISTORY_TZ=America/Chicago); Spotify's timestamps are UTC.
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
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

HISTORY_GLOB = os.path.join("data", "history", "Streaming_History_Audio_*.json")
PLAYLIST_FILE = "playlist_songs.json"
CORRECTIONS_FILE = "song_corrections.json"
OUTPUT_FILE = "listening_history.json"
# A play counts once it lasts 30 seconds, the same line Spotify uses for a stream.
COUNTED_PLAY_MS = 30_000
RECENT_DAYS = 365


def local_timezone_name():
    """HISTORY_TZ if set, else the computer's time zone (e.g. America/New_York), else UTC."""
    if os.environ.get("HISTORY_TZ"):
        return os.environ["HISTORY_TZ"]
    try:
        with open("/etc/timezone", encoding="utf-8") as f:
            name = f.read().strip()
            if name:
                return name
    except OSError:
        pass
    link = os.path.realpath("/etc/localtime")
    return link.split("zoneinfo/", 1)[1] if "zoneinfo/" in link else "UTC"


def to_local(ts, tz):
    """A Spotify UTC timestamp ("2023-12-31T23:30:00Z") as a time in the given zone."""
    return parse_ts(ts).replace(tzinfo=timezone.utc).astimezone(ZoneInfo(tz))


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


def top_artists(summary, limit=10):
    """Artist summary rows ordered by listening hours, then name for stable ties."""
    return sorted(summary.get("artists", {}).items(),
                  key=lambda item: (-item[1]["hours"], item[0].casefold()))[:limit]


def finish_range(total):
    """Compact range detail for Ghosts, including non-playlist tracks."""
    peak = sorted(total["years"], key=lambda y: (-total["years"][y], y))[0]
    tracks = sorted(total["tracks"].values(), key=lambda t: (-t["plays"], t["title"].casefold()))
    return {"hours": hours(total["ms"]), "plays": total["plays"],
            "last": total["last"], "peak_year": peak,
            "top_songs": [t for t in tracks if t["plays"] > 0][:3]}


def summarize(plays, playlist_songs=(), corrections=None, tz="UTC"):
    """Totals per artist, per playlist song and per year from a list of history rows.
    Podcasts and audiobooks are left out. Years and dates are in time zone `tz`."""
    music = [r for r in plays if r.get("master_metadata_album_artist_name")
             and r.get("master_metadata_track_name") and r.get("ts")]
    if not music:
        return {"timezone": tz, "from": None, "to": None, "recent_from": None, "years": {}, "artists": {}, "songs": {}}
    first = min(r["ts"] for r in music)
    last = max(r["ts"] for r in music)
    recent_from = (parse_ts(last) - timedelta(days=RECENT_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    by_id, by_name = playlist_index(playlist_songs, corrections)

    artists, songs, years = {}, {}, {}
    for row in music:
        name, ts = row["master_metadata_album_artist_name"], row["ts"]
        ms = int(row.get("ms_played") or 0)
        local = to_local(ts, tz)
        a = artists.setdefault(name, {"ms": 0, "plays": 0, "skips": 0, "recent_ms": 0,
                                      "recent_plays": 0, "first": local, "last": local, "ranges": {}})
        a["first"], a["last"] = min(a["first"], local), max(a["last"], local)
        key = match_song(row, by_id, by_name)
        s = songs.setdefault(key, {"ms": 0, "plays": 0, "skips": 0}) if key else None
        y = years.setdefault(str(local.year), {"ms": 0, "plays": 0, "skips": 0})
        played = ms >= COUNTED_PLAY_MS
        recent = ts >= recent_from
        year = str(local.year)
        for range_id in ["all", year] + (["recent"] if recent else []):
            detail = a["ranges"].setdefault(range_id, {"ms": 0, "plays": 0, "last": "", "years": {}, "tracks": {}})
            detail["ms"] += ms
            detail["plays"] += int(played)
            detail["last"] = max(detail["last"], local.date().isoformat())
            detail["years"][year] = detail["years"].get(year, 0) + ms
            title = row["master_metadata_track_name"]
            track = detail["tracks"].setdefault(normalize(title), {"title": title, "plays": 0})
            track["plays"] += int(played)
        # Time always counts toward hours; only plays of 30 seconds or more count as plays.
        for total in filter(None, (a, s, y)):
            total["ms"] += ms
            total["plays" if played else "skips"] += 1
        if recent:
            a["recent_ms"] += ms
            if played:
                a["recent_plays"] += 1

    return {
        "timezone": tz,
        "from": first,
        "to": last,
        "recent_from": recent_from,
        "years": {year: {"hours": hours(t["ms"]), "plays": t["plays"], "skips": t["skips"]}
                  for year, t in sorted(years.items())},
        "artists": {name: {"hours": hours(a["ms"]), "plays": a["plays"], "skips": a["skips"],
                           "recent_hours": hours(a["recent_ms"]), "recent_plays": a["recent_plays"],
                           "first": a["first"].date().isoformat(), "last": a["last"].date().isoformat(),
                           "ranges": {key: finish_range(value) for key, value in a["ranges"].items()}}
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
    tz = local_timezone_name()
    summary = summarize(plays, playlist, load_json(CORRECTIONS_FILE, {}), tz)
    with open(OUTPUT_FILE + ".tmp", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(OUTPUT_FILE + ".tmp", OUTPUT_FILE)

    matched = len({song_key(s) for s in playlist} & set(summary["songs"]))
    total = sum(a["hours"] for a in summary["artists"].values())
    plays_total = sum(a["plays"] for a in summary["artists"].values())
    print("Read " + str(len(plays)) + " rows from " + str(len(files)) + " files: "
          + str(len(summary["artists"])) + " artists, " + str(round(total)) + " hours, "
          + str(plays_total) + " plays (" + tz + "), "
          + str(summary["from"])[:10] + " to " + str(summary["to"])[:10] + ". "
          + str(matched) + " of " + str(len(playlist)) + " playlist entries have plays. Saved to "
          + OUTPUT_FILE + " (" + str(os.path.getsize(OUTPUT_FILE) // 1024) + " KB)")
    print("\nTotals\n  " + f"{total:,.2f} hours\n  {plays_total:,} plays")
    print("\nTop 10 artists by hours")
    for rank, (name, artist) in enumerate(top_artists(summary), 1):
        print(f"  {rank:2}. {name}: {artist['hours']:,.2f} hours ({artist['plays']:,} plays)")


if __name__ == "__main__":
    main()
