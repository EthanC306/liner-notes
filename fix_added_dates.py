"""
Use an older export of a playlist as a lookup table for when each song was
really added, and fix the added dates in playlist_songs.json.

Only songs already in playlist_songs.json are touched; nothing is added.
A song's date is replaced only when the older playlist has an earlier one.
If a song is in the older playlist more than once, its earliest date wins.

The fixes are also saved to date_overrides.json, which
spotify_playlist_export.py reapplies on every export, so they survive.

Run:
  python spotify_playlist_export.py "<old playlist link>" --out old_playlist.json --no-artists
  python fix_added_dates.py old_playlist.json
"""

import json
import os
import re
import shutil
import sys
import unicodedata

SONGS_FILE = "playlist_songs.json"
OVERRIDES_FILE = "date_overrides.json"


def normalize(text):
    """Lowercase, accents and punctuation removed: "Don’t Kill My Vibe" == "dont kill my vibe"."""
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def song_keys(song):
    """Ways to recognise the same song: its Spotify id, and its title plus main artist.

    The title match catches the same song released twice (on an album and a single),
    which Spotify gives different ids.
    """
    keys = []
    if song.get("id"):
        keys.append("id:" + song["id"])
    first_artist = song["artists"][0]["name"] if song.get("artists") else ""
    keys.append("name:" + normalize(song["title"]) + "|" + normalize(first_artist))
    return keys


def override_key(song):
    """The key a fix is saved under: the Spotify id, or the title for local files."""
    return "id:" + song["id"] if song.get("id") else "local:" + song["title"]


def compare_playlists(songs, old_songs):
    """Finds the earlier added date the old playlist has for each current song.

    Songs match by Spotify ID, then by title plus main artist. A song in the old playlist
    more than once takes its earliest date. Returns (changed, kept, unmatched):
      changed:   [(song, current_date, earlier_date)] for songs whose date should move earlier
      kept:      how many songs matched but already had the earliest date
      unmatched: songs not in the old playlist, which keep their own date
    Nothing is modified.
    """
    earliest = {}
    for song in old_songs:
        if not song.get("added_at"):
            continue
        for key in song_keys(song):
            if key not in earliest or song["added_at"] < earliest[key]:
                earliest[key] = song["added_at"]

    changed, kept, unmatched = [], 0, []
    for song in songs:
        found = [earliest[k] for k in song_keys(song) if k in earliest]
        if not found:
            unmatched.append(song)
            continue
        best = min(found)
        if song.get("added_at") and best >= song["added_at"]:
            kept += 1
            continue
        changed.append((song, song.get("added_at"), best))
    return changed, kept, unmatched


def main():
    if len(sys.argv) < 2:
        sys.exit("Usage: python fix_added_dates.py old_playlist.json")
    with open(sys.argv[1], encoding="utf-8") as f:
        old = json.load(f)
    with open(SONGS_FILE, encoding="utf-8") as f:
        data = json.load(f)

    overrides = {}
    if os.path.exists(OVERRIDES_FILE):
        with open(OVERRIDES_FILE, encoding="utf-8") as f:
            overrides = json.load(f)

    changed, kept, unmatched = compare_playlists(data["songs"], old["songs"])
    for song, _, best in changed:
        song["added_at"] = best
        overrides[override_key(song)] = best

    if changed:
        backup = SONGS_FILE + ".before-date-fix"
        if not os.path.exists(backup):
            shutil.copyfile(SONGS_FILE, backup)
        with open(SONGS_FILE + ".tmp", "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(SONGS_FILE + ".tmp", SONGS_FILE)
        with open(OVERRIDES_FILE, "w", encoding="utf-8") as f:
            json.dump(overrides, f, ensure_ascii=False, indent=2, sort_keys=True)

    print(str(len(changed)) + " songs got an earlier added date.")
    print(str(kept) + " songs were found but already had the earliest date.")
    print(str(len(unmatched)) + " songs are not in the old playlist and kept their date:")
    for song in unmatched:
        artist = song["artists"][0]["name"] if song["artists"] else "Unknown artist"
        print("  #" + str(song["position"]) + "  " + song["title"] + " - " + artist + "  (" + (song.get("added_at") or "no date")[:10] + ")")


if __name__ == "__main__":
    main()
