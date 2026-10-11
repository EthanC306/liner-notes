"""
Ask Last.fm which artists are similar to each artist on the playlist, and what their top
songs are, for the Recommend page. Saves the raw answers to lastfm_similar.json; the app
does the scoring (src/recommend.js), so recommendations follow the page's filters.

Needs a free Last.fm API key: https://www.last.fm/api/account/create

Run (after spotify_playlist_export.py):
  LASTFM_API_KEY=your_key python lastfm_similar.py
  python lastfm_similar.py          (asks for the key)

It asks for each playlist artist's similar artists, then every similar artist's top songs
and listener count. The first full run is a few thousand requests (about 20-30 minutes;
Last.fm allows a few a second). It keeps what it already has, so later runs, or a run
that was stopped, only fetch what's missing.
"""

import json
import os
import re
import sys
import time
import unicodedata

import requests

SONGS_FILE = "playlist_songs.json"
CORRECTIONS_FILE = "song_corrections.json"
OUTPUT_FILE = "lastfm_similar.json"
PARTIAL_FILE = "lastfm_similar.partial.json"
API = "https://ws.audioscrobbler.com/2.0/"
SIMILAR_PER_ARTIST = 30
TRACKS_PER_ARTIST = 5


def normalize(text):
    text = re.sub(r"['’`]", "", text or "")
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def api_get(key, params):
    while True:
        response = requests.get(API, params={**params, "api_key": key, "format": "json", "autocorrect": 1}, timeout=30)
        if response.status_code == 429:
            time.sleep(5)
            continue
        data = response.json()
        if data.get("error") in (10, 26):
            sys.exit("Last.fm didn't accept that API key: " + data.get("message", ""))
        time.sleep(0.25)  # Last.fm asks for no more than a few requests a second
        return None if data.get("error") else data


def playlist_artists():
    """Main artists with their song counts (features don't count), and every artist name."""
    with open(SONGS_FILE, encoding="utf-8") as f:
        songs = json.load(f)["songs"]
    corrections = {}
    if os.path.exists(CORRECTIONS_FILE):
        with open(CORRECTIONS_FILE, encoding="utf-8") as f:
            corrections = json.load(f)
    mains, everyone = {}, set()
    for song in songs:
        fix = corrections.get("local:" + song["title"]) if song.get("is_local") else None
        names = [a["name"] for a in (fix["artists"] if fix else song["artists"]) if a.get("name")]
        everyone.update(names)
        if names:
            mains[names[0]] = mains.get(names[0], 0) + 1
    return mains, everyone


def load_saved():
    """What earlier runs fetched: the finished file, plus a stopped run's progress."""
    saved = {"similar": {}, "top_tracks": {}, "info": {}}
    for path in (OUTPUT_FILE, PARTIAL_FILE):
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            for part in saved:
                saved[part].update(data.get(part, {}))
    return saved


def main():
    key = os.environ.get("LASTFM_API_KEY") or input("Last.fm API key: ").strip()
    if not key:
        sys.exit("No API key given.")
    mains, everyone = playlist_artists()
    on_playlist = {normalize(n) for n in everyone}
    saved = load_saved()
    similar, top_tracks, info = saved["similar"], saved["top_tracks"], saved["info"]
    progress = {"since_save": 0}

    def checkpoint(force=False):
        # Progress goes to the partial file (the app doesn't read it, so no reloads);
        # a stopped run picks up from there.
        progress["since_save"] += 1
        if force or progress["since_save"] >= 100:
            with open(PARTIAL_FILE, "w", encoding="utf-8") as f:
                json.dump(saved, f, ensure_ascii=False)
            progress["since_save"] = 0

    seeds = [n for n in sorted(mains, key=lambda n: -mains[n]) if n not in similar]
    print("Similar artists: " + str(len(similar)) + " artists done, " + str(len(seeds)) + " to go.")
    for number, name in enumerate(seeds, start=1):
        data = api_get(key, {"method": "artist.getsimilar", "artist": name, "limit": SIMILAR_PER_ARTIST})
        similar[name] = [
            {"name": a["name"], "match": round(float(a.get("match", 0)), 4), "url": a.get("url")}
            for a in ((data or {}).get("similarartists", {}).get("artist", []))
        ]
        checkpoint()
        if number % 20 == 0 or number == len(seeds):
            print("  " + str(number) + "/" + str(len(seeds)))

    # Every similar artist not already on the playlist can be recommended (the page's
    # "Sounds like" picker and faders choose among all of them), so each needs its top
    # songs and its Last.fm listener count.
    candidates = sorted({m["name"] for matches in similar.values() for m in matches
                         if normalize(m["name"]) not in on_playlist})
    todo = [n for n in candidates if n not in top_tracks or n not in info]
    print("Top songs and listeners: " + str(len(candidates) - len(todo)) + " artists done, "
          + str(len(todo)) + " to go (about " + str(round(len(todo) * 0.6 / 60)) + " minutes).")
    for number, name in enumerate(todo, start=1):
        if name not in top_tracks:
            data = api_get(key, {"method": "artist.gettoptracks", "artist": name, "limit": TRACKS_PER_ARTIST})
            top_tracks[name] = [
                {"name": t["name"], "playcount": int(t.get("playcount", 0)), "url": t.get("url")}
                for t in ((data or {}).get("toptracks", {}).get("track", []))
            ]
        if name not in info:
            data = api_get(key, {"method": "artist.getinfo", "artist": name})
            stats = ((data or {}).get("artist") or {}).get("stats") or {}
            info[name] = {"listeners": int(stats.get("listeners") or 0), "playcount": int(stats.get("playcount") or 0)}
        checkpoint()
        if number % 100 == 0 or number == len(todo):
            print("  " + str(number) + "/" + str(len(todo)))

    # The real file is written once, at the end, so the dev server reloads once.
    with open(OUTPUT_FILE + ".tmp", "w", encoding="utf-8") as f:
        json.dump(saved, f, ensure_ascii=False, indent=1)
    os.replace(OUTPUT_FILE + ".tmp", OUTPUT_FILE)
    if os.path.exists(PARTIAL_FILE):
        os.remove(PARTIAL_FILE)
    print("Done. " + str(len(candidates)) + " possible recommendations saved to " + OUTPUT_FILE)


if __name__ == "__main__":
    main()
