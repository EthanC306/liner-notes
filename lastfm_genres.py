"""
Look up genres on Last.fm for artists MusicBrainz has no genre for, and save
them to lastfm_artists.json.

Needs a free Last.fm API key: https://www.last.fm/api/account/create
(only "Application name" is required; copy the "API key" it shows).

Run:
  LASTFM_API_KEY=your_key python lastfm_genres.py
  python lastfm_genres.py          (asks for the key)

Artists you've already given a genre in artist_genres.json are skipped.
Blank entries in artist_genres.json for artists Last.fm does know are removed,
so the file ends up listing only the artists nobody has a genre for.
"""

import json
import os
import re
import sys
import time

import requests

SONGS_FILE = "playlist_songs.json"
MB_FILE = "musicbrainz_artists.json"
CORRECTIONS_FILE = "song_corrections.json"
YOUR_FILE = "artist_genres.json"
OUTPUT_FILE = "lastfm_artists.json"
API = "https://ws.audioscrobbler.com/2.0/"

# Last.fm tags are free text ("seen live", "female vocalists", "2020"); keep ones that name a genre.
GENRE_WORDS = re.compile(
    r"emo|rap|hip.?hop|trap|rock|punk|pop|metal|core\b|indie|alternative|r&b|rnb|soul|funk|folk|"
    r"country|jazz|blues|electronic|house|techno|dubstep|bass|ambient|lo.?fi|shoegaze|grunge|"
    r"screamo|ska|reggae|disco|synth|wave|bedroom|drill|grime|experimental|math", re.I)


def load(path, default):
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return default


def artists_on_playlist():
    """Every artist name on the playlist, with the id their MusicBrainz details are saved under."""
    songs = load(SONGS_FILE, {"songs": []})["songs"]
    corrections = load(CORRECTIONS_FILE, {})
    found = {}
    for song in songs:
        fix = corrections.get("local:" + song["title"]) if song.get("is_local") else None
        for a in (fix["artists"] if fix else song["artists"]):
            if a.get("name"):
                key = "mb:" + a["musicbrainz_id"] if a.get("musicbrainz_id") and not a.get("id") else a.get("id")
                found[a["name"]] = key
    return found


def top_tags(key, name):
    while True:
        response = requests.get(API, params={"method": "artist.gettoptags", "artist": name, "autocorrect": 1,
                                             "api_key": key, "format": "json"}, timeout=30)
        if response.status_code == 429:
            time.sleep(5)
            continue
        data = response.json()
        if data.get("error") == 10 or data.get("error") == 26:
            sys.exit("Last.fm didn't accept that API key: " + data.get("message", ""))
        if data.get("error"):
            return None  # artist not on Last.fm
        return [{"name": t["name"].lower(), "count": int(t.get("count", 0))}
                for t in data.get("toptags", {}).get("tag", [])]


def main():
    key = os.environ.get("LASTFM_API_KEY") or input("Last.fm API key: ").strip()
    if not key:
        sys.exit("No API key given.")

    mb = load(MB_FILE, {})
    yours = load(YOUR_FILE, {})
    saved = load(OUTPUT_FILE, {})

    todo = []
    for name, artist_key in artists_on_playlist().items():
        entry = mb.get(artist_key) or {}
        if entry.get("genres") or entry.get("tags"):
            continue  # MusicBrainz has it
        if yours.get(name):
            continue  # you've set it yourself
        todo.append(name)
    print(str(len(todo)) + " artists to look up on Last.fm.")

    for name in todo:
        tags = top_tags(key, name)
        genres = [t["name"] for t in (tags or []) if t["count"] >= 10 and GENRE_WORDS.search(t["name"])][:6]
        saved[name] = {"genres": genres, "all_tags": (tags or [])[:10],
                       "url": "https://www.last.fm/music/" + requests.utils.quote(name.replace(" ", "+"), safe="+")}
        print("  " + name + ": " + (", ".join(genres) if genres else "nothing usable"))
        time.sleep(0.25)  # Last.fm asks for no more than a few requests a second

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(saved, f, ensure_ascii=False, indent=2)

    # Drop blank entries Last.fm filled in, so your file lists only what's still missing.
    removed = [n for n, v in yours.items() if not n.startswith("_") and v == "" and saved.get(n, {}).get("genres")]
    for n in removed:
        del yours[n]
    with open(YOUR_FILE, "w", encoding="utf-8") as f:
        json.dump(yours, f, ensure_ascii=False, indent=2)

    still = [n for n, v in yours.items() if not n.startswith("_") and v == ""]
    print("Done. Last.fm had genres for " + str(len(removed)) + " artists.")
    print(str(len(still)) + " artists are left for you to fill in, in " + YOUR_FILE + ":")
    print("  " + ", ".join(still))


if __name__ == "__main__":
    main()
