"""
Export every song in one of your Spotify playlists to a JSON file.

Setup (one time):
  1. Go to https://developer.spotify.com/dashboard and create an app.
     - Redirect URI:  http://127.0.0.1:8888/callback
     - API used:      Web API
  2. Copy the app's Client ID and paste it into CLIENT_ID below.
  3. pip install requests

Run:
  python spotify_playlist_export.py
  python spotify_playlist_export.py <playlist link or id>

Options:
  --out <file>     save somewhere other than playlist_songs.json
  --no-artists     skip the per-artist lookups (photos), for a quick export
"""

import base64
import platform
import shutil
import subprocess
import hashlib
import json
import os
import re
import secrets
import sys
import time
import urllib.parse
import webbrowser
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer

import requests

CLIENT_ID = "3136d2be1c7c41b89da21fe86f7c12d7"
REDIRECT_URI = "http://127.0.0.1:8888/callback"
DEFAULT_PLAYLIST = "https://open.spotify.com/playlist/4C8MF0IAnwunqllE2zSc3g"
SCOPES = "playlist-read-private playlist-read-collaborative"
OUTPUT_FILE = "playlist_songs.json"
# Earlier added dates found by fix_added_dates.py, reapplied on every export.
OVERRIDES_FILE = "date_overrides.json"
API = "https://api.spotify.com/v1"


def playlist_id_from(text):
    """Accepts a full playlist link, a spotify: URI, or a bare id."""
    match = re.search(r"playlist[/:]([A-Za-z0-9]+)", text)
    return match.group(1) if match else text.strip()


def open_browser(url):
    """Opens url in a browser. Under WSL that means the Windows browser,
    since WSL usually has no Linux browser installed."""
    if "microsoft" in platform.uname().release.lower() and shutil.which("explorer.exe"):
        subprocess.run(["explorer.exe", url], check=False)
    else:
        webbrowser.open(url)


def log_in():
    """Opens Spotify's login page in your browser and returns an access token.

    Uses the PKCE flow, so no client secret is needed.
    """
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    state = secrets.token_urlsafe(16)

    login_url = "https://accounts.spotify.com/authorize?" + urllib.parse.urlencode({
        "client_id": CLIENT_ID,
        "response_type": "code",
        "redirect_uri": REDIRECT_URI,
        "code_challenge_method": "S256",
        "code_challenge": challenge,
        "scope": SCOPES,
        "state": state,
    })

    answer = {}

    class Catcher(BaseHTTPRequestHandler):
        # Spotify sends the browser back here with a one-time code in the URL.
        def do_GET(self):
            query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            answer.update({key: values[0] for key, values in query.items()})
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"<h2>Logged in. You can close this tab.</h2>")

        def log_message(self, *args):
            pass  # keep the terminal quiet

    port = urllib.parse.urlparse(REDIRECT_URI).port
    server = HTTPServer(("127.0.0.1", port), Catcher)

    print("Opening Spotify login in your browser...")
    print("If nothing opens, paste this into your browser:\n" + login_url + "\n")
    open_browser(login_url)

    while "code" not in answer and "error" not in answer:
        server.handle_request()
    server.server_close()

    if "error" in answer:
        sys.exit("Spotify login failed: " + answer["error"])
    if answer.get("state") != state:
        sys.exit("Login response did not match this request. Try again.")

    response = requests.post(
        "https://accounts.spotify.com/api/token",
        data={
            "grant_type": "authorization_code",
            "code": answer["code"],
            "redirect_uri": REDIRECT_URI,
            "client_id": CLIENT_ID,
            "code_verifier": verifier,
        },
        timeout=30,
    )
    response.raise_for_status()
    return response.json()["access_token"]


def api_get(token, url, params=None):
    """GETs one Spotify API url, waiting and retrying when Spotify says we're going too fast."""
    headers = {"Authorization": "Bearer " + token}
    while True:
        response = requests.get(url, headers=headers, params=params, timeout=30)
        if response.status_code == 429:  # asked too fast, wait and retry
            time.sleep(int(response.headers.get("Retry-After", "2")) + 1)
            continue
        if response.status_code == 403:
            sys.exit(
                "Spotify said no (403). Check that this is your own playlist, "
                "that your account has Premium, and that your Spotify email is "
                "added under User Management in your app's dashboard."
            )
        response.raise_for_status()
        return response.json()


def link(thing):
    return ((thing or {}).get("external_urls") or {}).get("spotify")


def biggest_image(thing):
    images = (thing or {}).get("images") or []
    return max(images, key=lambda i: i.get("width") or 0)["url"] if images else None


def get_playlist(token, playlist_id):
    """The playlist's own name, owner and link."""
    info = api_get(token, API + "/playlists/" + playlist_id,
                   {"fields": "id,name,description,owner(display_name),external_urls"})
    return {
        "id": info.get("id"),
        "name": info.get("name"),
        "description": info.get("description") or "",
        "owner": (info.get("owner") or {}).get("display_name"),
        "url": link(info),
    }


def get_songs(token, playlist_id):
    """Pulls the playlist one page at a time until there are no pages left."""
    url = API + "/playlists/" + playlist_id + "/items"
    params = {"limit": 50}
    songs = []

    while url:
        page = api_get(token, url, params)

        for entry in page.get("items", []):
            # "item" is the current field name; "track" is the old one.
            song = entry.get("item") or entry.get("track")
            if not song:
                continue  # removed or unavailable song
            album = song.get("album") or {}
            songs.append({
                "position": len(songs) + 1,
                "title": song.get("name", ""),
                "artists": [
                    {"name": a.get("name", ""), "id": a.get("id"), "url": link(a)}
                    for a in song.get("artists", [])
                ],
                "album": {
                    "name": album.get("name", ""),
                    "id": album.get("id"),
                    "type": album.get("album_type"),            # album, single or compilation
                    "release_date": album.get("release_date"),  # "2012", "2012-07" or "2012-07-10"
                    "release_date_precision": album.get("release_date_precision"),
                    "image": biggest_image(album),
                    "url": link(album),
                },
                "duration_ms": song.get("duration_ms"),
                "explicit": song.get("explicit"),
                "added_at": entry.get("added_at"),
                "is_local": bool(entry.get("is_local")),  # a file from your computer, not Spotify's catalog
                "id": song.get("id"),
                "url": link(song),
            })

        print("  got " + str(len(songs)) + " songs so far")
        url = page.get("next")  # Spotify hands us the link to the next page
        params = None           # that link already includes the paging info

    return songs


def get_artists(token, songs):
    """Looks up every artist once for their genres and photo.

    Spotify no longer allows asking for many artists in one request,
    so this makes one request per artist.
    """
    ids = sorted({a["id"] for s in songs for a in s["artists"] if a["id"]})
    artists = {}
    for number, artist_id in enumerate(ids, start=1):
        info = api_get(token, API + "/artists/" + artist_id)
        artists[artist_id] = {
            "name": info.get("name", ""),
            "genres": info.get("genres") or [],
            "image": biggest_image(info),
            "url": link(info),
        }
        if number % 25 == 0 or number == len(ids):
            print("  looked up " + str(number) + " of " + str(len(ids)) + " artists")
    return artists


def apply_date_overrides(songs):
    """Puts back the real added dates for songs that were copied over from an older playlist."""
    if not os.path.exists(OVERRIDES_FILE):
        return 0
    with open(OVERRIDES_FILE, encoding="utf-8") as f:
        overrides = json.load(f)
    fixed = 0
    for song in songs:
        key = "id:" + song["id"] if song["id"] else "local:" + song["title"]
        earlier = overrides.get(key)
        if earlier and (not song["added_at"] or earlier < song["added_at"]):
            song["added_at"] = earlier
            fixed += 1
    return fixed


def save(playlist, songs, artists, path):
    data = {
        "exported_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "playlist": playlist,
        "songs": songs,
        "artists": artists,
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def main():
    if CLIENT_ID == "PASTE_YOUR_CLIENT_ID_HERE":
        sys.exit("Paste your Client ID into CLIENT_ID at the top of this file first.")

    args = sys.argv[1:]
    output_file = OUTPUT_FILE
    if "--out" in args:
        i = args.index("--out")
        if i + 1 >= len(args):
            sys.exit("--out needs a file name, like: --out old_playlist.json")
        output_file = args[i + 1]
        del args[i:i + 2]
    skip_artists = "--no-artists" in args
    args = [a for a in args if a != "--no-artists"]
    playlist = args[0] if args else DEFAULT_PLAYLIST
    token = log_in()
    playlist_id = playlist_id_from(playlist)
    print("Getting the playlist...")
    info = get_playlist(token, playlist_id)
    songs = get_songs(token, playlist_id)
    artists = {}
    if not skip_artists:
        print("Getting artist details...")
        artists = get_artists(token, songs)
    if output_file == OUTPUT_FILE:
        fixed = apply_date_overrides(songs)
        if fixed:
            print("Put back the earlier added date for " + str(fixed) + " songs from " + OVERRIDES_FILE)
    save(info, songs, artists, output_file)
    print("Done. " + str(len(songs)) + " songs saved to " + output_file)


if __name__ == "__main__":
    main()
