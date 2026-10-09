"""
Look up every artist in playlist_songs.json on MusicBrainz and save their
genres, where they're from and when they started to musicbrainz_artists.json.

Spotify no longer returns genres for apps in Development Mode, so this fills
that gap. No login needed. MusicBrainz allows one request per second, so the
first run takes a few minutes; later runs only look up artists that are new.

Run (after spotify_playlist_export.py):
  python musicbrainz_artists.py
"""

import json
import os
import sys
import time
from datetime import datetime, timezone

import requests

SONGS_FILE = "playlist_songs.json"
OUTPUT_FILE = "musicbrainz_artists.json"
# Progress is saved here while running, and OUTPUT_FILE is written once at the end.
# The app reloads whenever OUTPUT_FILE changes, so writing it after every artist
# would reload the page every second.
PARTIAL_FILE = "musicbrainz_artists.partial.json"
API = "https://musicbrainz.org/ws/2"
# MusicBrainz asks every app to name itself.
HEADERS = {"User-Agent": "playlist-stat/0.1 (personal playlist stats script)", "Accept": "application/json"}

last_request = 0.0


def mb_get(path, params):
    """GETs one MusicBrainz url, at most once a second. Returns None for 404."""
    global last_request
    while True:
        wait = 1.1 - (time.time() - last_request)
        if wait > 0:
            time.sleep(wait)
        last_request = time.time()
        response = requests.get(API + path, params={**params, "fmt": "json"}, headers=HEADERS, timeout=30)
        if response.status_code == 404:
            return None
        if response.status_code == 503:  # asked too fast, wait and retry
            time.sleep(5)
            continue
        response.raise_for_status()
        return response.json()


def find_artist(spotify_url, name):
    """Finds the MusicBrainz artist id, first through the Spotify link, then by exact name."""
    if spotify_url:
        found = mb_get("/url", {"resource": spotify_url, "inc": "artist-rels"})
        for relation in (found or {}).get("relations", []):
            if relation.get("artist"):
                return relation["artist"]["id"], "spotify link"

    # By name only when exactly one MusicBrainz artist has this name. With several
    # (there are 8 bands called "Airbag") picking one is a guess, so take none.
    found = mb_get("/artist", {"query": 'artist:"' + name.replace('"', "") + '"', "limit": 25})
    same = [a for a in (found or {}).get("artists", []) if a.get("name", "").casefold() == name.casefold()]
    if len(same) == 1:
        return same[0]["id"], "name"
    return None, None


def details(mbid):
    artist = mb_get("/artist/" + mbid, {"inc": "genres tags"})
    by_count = lambda items: [i["name"] for i in sorted(items or [], key=lambda i: -i.get("count", 0))]
    life = artist.get("life-span") or {}
    return {
        "type": artist.get("type"),                        # Group, Person, ...
        "country": artist.get("country"),
        "area": (artist.get("area") or {}).get("name"),
        "begin_area": (artist.get("begin-area") or {}).get("name"),
        "begin": life.get("begin"),
        "end": life.get("end"),
        "ended": life.get("ended"),
        "disambiguation": artist.get("disambiguation") or "",
        "genres": by_count(artist.get("genres")),
        "tags": by_count(artist.get("tags"))[:10],
    }


def main():
    if not os.path.exists(SONGS_FILE):
        sys.exit("Run spotify_playlist_export.py first; " + SONGS_FILE + " is missing.")
    with open(SONGS_FILE, encoding="utf-8") as f:
        data = json.load(f)

    saved = {}
    for path in (OUTPUT_FILE, PARTIAL_FILE):  # the partial file holds a run that was stopped
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                saved.update(json.load(f))

    todo = [(artist_id, a) for artist_id, a in data.get("artists", {}).items() if artist_id not in saved]
    # Artists from song_corrections.json that aren't on Spotify are saved under "mb:<MusicBrainz id>".
    if os.path.exists("song_corrections.json"):
        with open("song_corrections.json", encoding="utf-8") as f:
            corrections = json.load(f)
        for fix in corrections.values():
            for a in (fix.get("artists") if isinstance(fix, dict) else None) or []:
                key = "mb:" + a["musicbrainz_id"] if a.get("musicbrainz_id") and not a.get("id") else None
                if key and key not in saved and all(k != key for k, _ in todo):
                    todo.append((key, {"name": a["name"], "url": None, "mbid": a["musicbrainz_id"]}))
    print(str(len(saved)) + " artists already looked up, " + str(len(todo)) + " to go.")

    for number, (artist_id, artist) in enumerate(todo, start=1):
        if artist.get("mbid"):
            mbid, matched_by = artist["mbid"], "song_corrections.json"
        else:
            mbid, matched_by = find_artist(artist.get("url"), artist["name"])
        entry = {"name": artist["name"], "mbid": mbid, "matched_by": matched_by,
                 "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
        if mbid:
            entry.update(details(mbid))
            entry["url"] = "https://musicbrainz.org/artist/" + mbid
        saved[artist_id] = entry

        print("  " + str(number) + "/" + str(len(todo)) + "  " + artist["name"] +
              ("  (not found)" if not mbid else "  " + ", ".join(entry["genres"][:3])))
        # Save as we go, so stopping halfway loses nothing.
        with open(PARTIAL_FILE, "w", encoding="utf-8") as f:
            json.dump(saved, f, ensure_ascii=False, indent=2)

    if todo or not os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE + ".tmp", "w", encoding="utf-8") as f:
            json.dump(saved, f, ensure_ascii=False, indent=2)
        os.replace(OUTPUT_FILE + ".tmp", OUTPUT_FILE)  # swap in one step so the app never reads half a file
    if os.path.exists(PARTIAL_FILE):
        os.remove(PARTIAL_FILE)

    found = sum(1 for e in saved.values() if e["mbid"])
    with_genres = sum(1 for e in saved.values() if e.get("genres"))
    print("Done. " + str(found) + " of " + str(len(saved)) + " artists found on MusicBrainz, "
          + str(with_genres) + " with genres. Saved to " + OUTPUT_FILE)


if __name__ == "__main__":
    main()
