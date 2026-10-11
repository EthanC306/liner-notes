"""lastfm_similar.main against a fake Last.fm: fetches only what's missing, keeps the rest."""
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import lastfm_similar  # noqa: E402


def song(title, *artists):
    return {"title": title, "is_local": False, "artists": [{"name": a} for a in artists]}


SIMILAR = {"Pinegrove": ["Mount Eerie", "Told Slant", "Big Thief"], "Modern Baseball": ["Big Thief", "Pinegrove"]}


class FakeLastfm:
    def __init__(self):
        self.calls = []

    def __call__(self, key, params):
        method, artist = params["method"], params["artist"]
        self.calls.append((method, artist))
        if method == "artist.getsimilar":
            return {"similarartists": {"artist": [{"name": n, "match": "0.5"} for n in SIMILAR.get(artist, [])]}}
        if method == "artist.gettoptracks":
            return {"toptracks": {"track": [{"name": artist + " song", "playcount": "10"}]}}
        if method == "artist.getinfo":
            return {"artist": {"stats": {"listeners": "1234", "playcount": "5678"}}}


class ResumableFetch(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.cwd = os.getcwd()
        os.chdir(self.dir.name)
        with open("playlist_songs.json", "w") as f:
            json.dump({"songs": [song("Need", "Pinegrove"), song("Tears", "Modern Baseball"), song("Your Graduation", "Modern Baseball", "Told Slant")]}, f)

    def tearDown(self):
        os.chdir(self.cwd)
        self.dir.cleanup()

    def run_script(self):
        fake = FakeLastfm()
        with mock.patch.object(lastfm_similar, "api_get", fake), mock.patch.dict(os.environ, {"LASTFM_API_KEY": "k"}), \
             mock.patch("builtins.print"):
            lastfm_similar.main()
        with open("lastfm_similar.json") as f:
            return fake.calls, json.load(f)

    def test_first_run_fetches_songs_and_listeners_for_every_new_candidate(self):
        calls, data = self.run_script()
        # Pinegrove is on the playlist and Told Slant is a feature on it: neither is a candidate
        self.assertEqual(sorted(data["top_tracks"]), ["Big Thief", "Mount Eerie"])
        self.assertEqual(data["info"]["Big Thief"], {"listeners": 1234, "playcount": 5678})
        self.assertEqual(len([c for c in calls if c[0] == "artist.getsimilar"]), 2)

    def test_second_run_fetches_nothing_already_saved(self):
        self.run_script()
        calls, data = self.run_script()
        self.assertEqual(calls, [])
        self.assertEqual(sorted(data["info"]), ["Big Thief", "Mount Eerie"])

    def test_old_file_without_listeners_only_gets_listeners(self):
        with open("lastfm_similar.json", "w") as f:
            json.dump({"similar": {s: [{"name": n, "match": 0.5} for n in v] for s, v in SIMILAR.items()},
                       "top_tracks": {"Big Thief": [], "Mount Eerie": []}}, f)
        calls, data = self.run_script()
        self.assertEqual(sorted(calls), [("artist.getinfo", "Big Thief"), ("artist.getinfo", "Mount Eerie")])
        self.assertIn("Big Thief", data["top_tracks"])

    def test_cleans_up_the_partial_file(self):
        self.run_script()
        self.assertFalse(os.path.exists("lastfm_similar.partial.json"))


if __name__ == "__main__":
    unittest.main()
