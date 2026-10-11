"""Which artists an --artists-for run looks up (spotify_playlist_export.artists_to_look_up)."""
import os
import sys
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from spotify_playlist_export import artists_to_look_up  # noqa: E402


class ArtistsToLookUp(unittest.TestCase):
    def test_reuses_known_artists_and_looks_up_the_rest_once(self):
        songs = [
            {"artists": [{"name": "A", "id": "a"}, {"name": "B", "id": "b"}]},
            {"artists": [{"name": "B", "id": "b"}, {"name": "C", "id": "c"}]},
        ]
        known = {"b": {"name": "B", "image": "b.jpg"}, "z": {"name": "Z"}}
        reused, missing = artists_to_look_up(songs, known)
        self.assertEqual(reused, {"b": {"name": "B", "image": "b.jpg"}})
        self.assertEqual(missing, ["a", "c"])

    def test_skips_local_files_without_an_id(self):
        songs = [{"artists": [{"name": "Local", "id": None}, {"name": "No id"}]}]
        self.assertEqual(artists_to_look_up(songs, {}), ({}, []))


if __name__ == "__main__":
    unittest.main()
