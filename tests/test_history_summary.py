"""history_summary.summarize: per-artist and per-song listening totals from raw history rows."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from unittest import mock  # noqa: E402
from history_summary import local_timezone_name, match_song, normalize, playlist_index, summarize, to_local, top_artists  # noqa: E402


def play(artist, track, ms, ts, track_id=None):
    return {"master_metadata_album_artist_name": artist, "master_metadata_track_name": track,
            "ms_played": ms, "ts": ts, "ip_addr": "203.0.113.7", "episode_name": None,
            "spotify_track_uri": "spotify:track:" + track_id if track_id else None}


def song(title, artist, track_id=None, is_local=False):
    return {"title": title, "artists": [{"name": artist}], "id": track_id, "is_local": is_local}


PLAYLIST = [
    song("Lucid Dreams", "Juice WRLD", "lucid1"),
    song("Don't Kill My Vibe", "Sigrid", "vibe1"),
    song("Y2Mate.is - lil peep the way i see things", None, is_local=True),
]
PLAYLIST[2]["artists"] = []
CORRECTIONS = {"local:Y2Mate.is - lil peep the way i see things":
               {"title": "The Way I See Things", "artists": [{"name": "Lil Peep"}]}}

ROWS = [
    play("Juice WRLD", "Lucid Dreams", 240_000, "2020-03-01T10:00:00Z", "lucid1"),
    play("Juice WRLD", "Lucid Dreams", 200_000, "2021-06-01T10:00:00Z", "lucid1"),
    play("Juice WRLD", "Lucid Dreams", 29_999, "2021-06-02T10:00:00Z", "lucid1"),  # skip
    play("Juice WRLD", "Robbery", 10_000, "2019-12-31T23:00:00Z", "rob1"),         # skip
    play("Powfu", "death bed", 180_000, "2022-01-05T08:00:00Z", "bed1"),           # not on the playlist
    {"master_metadata_album_artist_name": None, "master_metadata_track_name": None, "episode_name": "A podcast",
     "ms_played": 3_600_000, "ts": "2023-01-01T00:00:00Z"},                         # a podcast: not an artist
]


class SkipRule(unittest.TestCase):
    def setUp(self):
        self.s = summarize(ROWS, PLAYLIST, CORRECTIONS)
        self.juice = self.s["artists"]["Juice WRLD"]

    def test_plays_under_30_seconds_are_skips(self):
        self.assertEqual((self.juice["plays"], self.juice["skips"]), (2, 2))

    def test_exactly_30_seconds_is_a_play(self):
        s = summarize([play("A", "B", 30_000, "2020-01-01T00:00:00Z")])
        self.assertEqual((s["artists"]["A"]["plays"], s["artists"]["A"]["skips"]), (1, 0))

    def test_skip_time_still_counts_toward_hours(self):
        # 240s + 200s played, plus 29.999s and 10s skipped: all of it is listening time
        self.assertEqual(self.juice["hours"], round(479_999 / 3_600_000, 2))
        self.assertEqual(self.s["songs"]["lucid1"], {"hours": round(469_999 / 3_600_000, 2), "plays": 2, "skips": 1})

    def test_29_999_ms_is_a_skip(self):
        s = summarize([play("A", "B", 29_999, "2020-01-01T00:00:00Z")])
        self.assertEqual((s["artists"]["A"]["plays"], s["artists"]["A"]["skips"]), (0, 1))

    def test_artist_with_only_skips_is_kept_with_zero_plays(self):
        s = summarize([play("A", "B", 18_000, "2020-01-01T00:00:00Z")])
        self.assertEqual((s["artists"]["A"]["plays"], s["artists"]["A"]["hours"]), (0, 0.01))


class TimeZones(unittest.TestCase):
    NY = "America/New_York"

    def test_converts_utc_to_local_time(self):
        # 3:30 am UTC on New Year's Day is still 10:30 pm New Year's Eve in New York
        local = to_local("2024-01-01T03:30:00Z", self.NY)
        self.assertEqual((local.year, local.month, local.day, local.hour), (2023, 12, 31, 22))

    def test_follows_daylight_saving(self):
        self.assertEqual(to_local("2024-07-01T12:00:00Z", self.NY).utcoffset().total_seconds() / 3600, -4)  # EDT
        self.assertEqual(to_local("2024-01-15T12:00:00Z", self.NY).utcoffset().total_seconds() / 3600, -5)  # EST

    def test_a_late_new_years_eve_play_counts_in_the_old_year(self):
        rows = [play("A", "B", 60_000, "2024-01-01T03:30:00Z")]
        self.assertEqual(list(summarize(rows, tz=self.NY)["years"]), ["2023"])
        self.assertEqual(list(summarize(rows, tz="UTC")["years"]), ["2024"])

    def test_an_early_utc_play_stays_in_its_year(self):
        # 2:00 am UTC on Jan 1 2025 is 9 pm Dec 31 in New York, but 2025 in Tokyo
        rows = [play("A", "B", 60_000, "2025-01-01T02:00:00Z")]
        self.assertEqual(list(summarize(rows, tz=self.NY)["years"]), ["2024"])
        self.assertEqual(list(summarize(rows, tz="Asia/Tokyo")["years"]), ["2025"])

    def test_first_and_last_dates_are_local(self):
        a = summarize([play("A", "B", 60_000, "2024-01-01T03:30:00Z")], tz=self.NY)["artists"]["A"]
        self.assertEqual((a["first"], a["last"]), ("2023-12-31", "2023-12-31"))

    def test_year_totals_add_up(self):
        rows = [play("A", "B", 60_000, "2023-06-01T12:00:00Z"), play("A", "C", 10_000, "2023-06-02T12:00:00Z"),
                play("D", "E", 120_000, "2024-03-01T12:00:00Z")]
        years = summarize(rows, tz=self.NY)["years"]
        self.assertEqual(years["2023"], {"hours": 0.02, "plays": 1, "skips": 1})
        self.assertEqual(years["2024"]["plays"], 1)

    def test_records_the_time_zone_used(self):
        self.assertEqual(summarize([play("A", "B", 60_000, "2024-01-01T00:00:00Z")], tz=self.NY)["timezone"], self.NY)

    def test_history_tz_overrides_the_computer(self):
        with mock.patch.dict(os.environ, {"HISTORY_TZ": "Europe/Berlin"}):
            self.assertEqual(local_timezone_name(), "Europe/Berlin")


class Matching(unittest.TestCase):
    def setUp(self):
        self.index = playlist_index(PLAYLIST, CORRECTIONS)

    def test_matches_by_spotify_id_first(self):
        # different title, same ID: still the playlist song
        row = play("Juice WRLD", "Lucid Dreams (Remastered)", 200_000, "2020-01-01T00:00:00Z", "lucid1")
        self.assertEqual(match_song(row, *self.index), "lucid1")

    def test_falls_back_to_title_and_main_artist(self):
        # another release of the same song has another ID; punctuation and case don't matter
        row = play("Sigrid", "Don’t kill my vibe", 200_000, "2020-01-01T00:00:00Z", "single99")
        self.assertEqual(match_song(row, *self.index), "vibe1")

    def test_same_title_by_another_artist_does_not_match(self):
        row = play("Someone Else", "Lucid Dreams", 200_000, "2020-01-01T00:00:00Z", "other1")
        self.assertIsNone(match_song(row, *self.index))

    def test_local_file_matches_under_its_corrected_details(self):
        row = play("Lil Peep", "The Way I See Things", 200_000, "2020-01-01T00:00:00Z", "peep1")
        self.assertEqual(match_song(row, *self.index), "local:Y2Mate.is - lil peep the way i see things")

    def test_duplicate_with_another_id_counts_under_the_first_copy(self):
        # the app keeps the first copy, so plays of the second ID go to the first one's key
        index = playlist_index(PLAYLIST + [song("Lucid Dreams", "Juice WRLD", "lucid2")])
        row = play("Juice WRLD", "Lucid Dreams", 200_000, "2020-01-01T00:00:00Z", "lucid2")
        self.assertEqual(match_song(row, *index), "lucid1")

    def test_unmatched_plays_still_count_for_their_artist(self):
        s = summarize(ROWS, PLAYLIST, CORRECTIONS)
        self.assertEqual(s["artists"]["Powfu"]["plays"], 1)
        self.assertEqual(sorted(s["songs"]), ["lucid1"])

    def test_normalize_matches_the_app(self):
        self.assertEqual(normalize("Don’t Kill My Vibe"), "dont kill my vibe")
        self.assertEqual(normalize("Beyoncé"), "beyonce")


class Summary(unittest.TestCase):
    def setUp(self):
        self.s = summarize(ROWS, PLAYLIST, CORRECTIONS)

    def test_first_and_last_play(self):
        juice = self.s["artists"]["Juice WRLD"]
        self.assertEqual((juice["first"], juice["last"]), ("2019-12-31", "2021-06-02"))

    def test_last_12_months_ends_at_the_last_play(self):
        # the history ends 2022-01-05: only Powfu's play is within a year of that
        self.assertEqual(self.s["recent_from"], "2021-01-05T08:00:00Z")
        self.assertEqual(self.s["artists"]["Juice WRLD"]["recent_plays"], 1)  # 2021-06-01
        self.assertEqual(self.s["artists"]["Powfu"]["recent_hours"], 0.05)

    def test_leaves_out_podcasts(self):
        self.assertEqual(sorted(self.s["artists"]), ["Juice WRLD", "Powfu"])

    def test_keeps_nothing_personal(self):
        self.assertNotIn("203.0.113.7", repr(self.s))

    def test_overall_span_covers_music_only(self):
        self.assertEqual((self.s["from"], self.s["to"]), ("2019-12-31T23:00:00Z", "2022-01-05T08:00:00Z"))

    def test_empty_history(self):
        self.assertEqual(summarize([])["artists"], {})

    def test_ghost_details_use_local_years_and_include_non_playlist_songs(self):
        rows = [play("A", "Favorite", 36_000_000, "2024-01-01T03:30:00Z"),
                play("A", "Favorite", 30_000, "2024-06-01T12:00:00Z"),
                play("A", "Other", 29_999, "2024-07-01T12:00:00Z")]
        ranges = summarize(rows, tz="America/New_York")["artists"]["A"]["ranges"]
        self.assertEqual(ranges["all"]["peak_year"], "2023")
        self.assertEqual(ranges["all"]["last"], "2024-07-01")
        self.assertEqual(ranges["all"]["top_songs"], [{"title": "Favorite", "plays": 2}])
        self.assertEqual(ranges["2023"]["hours"], 10)
        self.assertEqual(ranges["2024"]["plays"], 1)
        self.assertEqual(ranges["2024"]["peak_year"], "2024")

    def test_recent_ghost_details_exclude_old_tracks_and_limit_songs_to_three(self):
        rows = [play("A", "Old", 36_000_000, "2020-01-01T00:00:00Z")]
        rows += [play("A", title, 30_000, "2024-06-01T12:00:00Z") for title in ["D", "B", "A", "C", "D"]]
        ranges = summarize(rows)["artists"]["A"]["ranges"]
        recent = ranges["recent"]
        self.assertEqual(recent["plays"], 5)
        self.assertEqual(recent["hours"], round(150_000 / 3_600_000, 2))
        self.assertEqual(recent["peak_year"], "2024")
        self.assertEqual([s["title"] for s in recent["top_songs"]], ["D", "A", "B"])

    def test_top_artists_are_ranked_by_hours(self):
        names = [name for name, _ in top_artists(self.s, limit=2)]
        self.assertEqual(names, ["Juice WRLD", "Powfu"])


if __name__ == "__main__":
    unittest.main()
