"""
Find when each song in playlist_songs.json was first released, using MusicBrainz.

Spotify dates a song by the album it's on, so a 2009 remaster on a 1973
compilation shows up as 1973 even though the song came out in 1969. This looks
for the same recording on MusicBrainz (same title, same artist, official
releases, about the same length) and keeps the earliest release date.

Results go to musicbrainz_songs.json. Later runs only look up new songs.
MusicBrainz allows one request per second, so the first run takes a few minutes.

Run (after spotify_playlist_export.py):
  python musicbrainz_songs.py
"""

import json
import os
import re
import sys
import unicodedata

from musicbrainz_artists import mb_get

SONGS_FILE = "playlist_songs.json"
OUTPUT_FILE = "musicbrainz_songs.json"
# Progress goes here while running; OUTPUT_FILE is written once at the end
# so the app doesn't reload after every song.
PARTIAL_FILE = "musicbrainz_songs.partial.json"
LENGTH_SLACK_MS = 8000  # remasters are usually within a few seconds of the original

# Suffixes Spotify adds that aren't part of the song's real title:
# " - Remastered 2009", " - 2012 - Remaster", " - Single Version", "(2015 Remaster)" ...
EXTRA = r"(remaster(ed)?|mono|stereo|single version|album version|radio edit|\d{4} mix)"
EXTRA_DASH = re.compile(r"\s+-\s+(\d{4}\s+-\s+)?[^-]*" + EXTRA + r".*$", re.I)
EXTRA_PAREN = re.compile(r"\s*[(\[][^)\]]*" + EXTRA + r"[^)\]]*[)\]]", re.I)
FEAT = re.compile(r"\s*[(\[]?\b(feat|ft|with)\.?\s[^)\]]*[)\]]?", re.I)


def clean_title(title):
    title = EXTRA_DASH.sub("", title)
    title = EXTRA_PAREN.sub("", title)
    return title.strip()


def compare_key(title):
    """For checking two titles are the same song: no featured artists, accents, case or punctuation."""
    title = FEAT.sub("", clean_title(title))
    title = re.sub(r"['’`]", "", title)  # "Don’t" and "Don't" are the same word
    title = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()


def lucene_phrase(text):
    text = text.replace("\\", " ").replace('"', " ")
    if "'" in text or "’" in text:
        # MusicBrainz titles use both straight and curly apostrophes; search for either.
        straight, curly = text.replace("’", "'"), text.replace("'", "’")
        return '("' + straight + '" OR "' + curly + '")'
    return '"' + text + '"'


def first_release(song):
    title = clean_title(song["title"])
    artist = song["artists"][0]["name"]
    query = "recording:" + lucene_phrase(title) + " AND artist:" + lucene_phrase(artist) + " AND status:official"
    if song.get("duration_ms"):
        ms = song["duration_ms"]
        query += " AND dur:[" + str(ms - LENGTH_SLACK_MS) + " TO " + str(ms + LENGTH_SLACK_MS) + "]"
    found = mb_get("/recording", {"query": query, "limit": 50}) or {}

    want = compare_key(song["title"])
    best = None
    for rec in found.get("recordings", []):
        date = rec.get("first-release-date")
        if not date or compare_key(rec.get("title", "")) != want:
            continue
        if best is None or date < best["first_release_date"]:
            best = {"first_release_date": date, "mbid": rec["id"],
                    "title": rec.get("title"), "disambiguation": rec.get("disambiguation") or ""}
    return best


def main():
    if not os.path.exists(SONGS_FILE):
        sys.exit("Run spotify_playlist_export.py first; " + SONGS_FILE + " is missing.")
    with open(SONGS_FILE, encoding="utf-8") as f:
        songs = json.load(f)["songs"]

    saved = {}
    for path in (OUTPUT_FILE, PARTIAL_FILE):
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                saved.update(json.load(f))

    todo = [s for s in songs if s.get("id") and s.get("artists") and s["id"] not in saved]
    print(str(len(saved)) + " songs already looked up, " + str(len(todo)) + " to go.", flush=True)

    for number, song in enumerate(todo, start=1):
        result = first_release(song)
        saved[song["id"]] = {"title": song["title"], **(result or {"first_release_date": None})}
        spotify = song["album"].get("release_date") or ""
        note = ""
        if result and result["first_release_date"][:4] < spotify[:4]:
            note = "  first released " + result["first_release_date"] + ", Spotify says " + spotify
        if number % 25 == 0 or note:
            print("  " + str(number) + "/" + str(len(todo)) + "  " + song["title"] + note, flush=True)
        with open(PARTIAL_FILE, "w", encoding="utf-8") as f:
            json.dump(saved, f, ensure_ascii=False, indent=2)

    if todo or not os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE + ".tmp", "w", encoding="utf-8") as f:
            json.dump(saved, f, ensure_ascii=False, indent=2)
        os.replace(OUTPUT_FILE + ".tmp", OUTPUT_FILE)
    if os.path.exists(PARTIAL_FILE):
        os.remove(PARTIAL_FILE)

    found = sum(1 for e in saved.values() if e.get("first_release_date"))
    print("Done. Found a first release date for " + str(found) + " of " + str(len(saved)) + " songs. Saved to " + OUTPUT_FILE)


if __name__ == "__main__":
    main()
