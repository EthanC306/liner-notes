// Decade and month bucketing. Months are in local time; `npm test` runs with TZ=UTC.
import { describe, it, expect } from "vitest";
import { decadeOf } from "../src/decades.js";
import { monthOf } from "../src/months.js";
import { fixture, byTitle } from "./helpers.js";

describe("decades", () => {
  it("buckets a year into its decade", () => {
    expect(decadeOf({ releaseYear: 2019 })).toBe(2010);
    expect(decadeOf({ releaseYear: 2020 })).toBe(2020);
    expect(decadeOf({ releaseYear: 1969 })).toBe(1960);
  });

  it("has no decade for a song with no date", () => {
    expect(decadeOf({ releaseYear: null })).toBe(null);
  });

  it("dates a remaster by its original release (1969), not its compilation (1973)", () => {
    const song = byTitle(fixture().playlist.songs, "Don't Let Me Down");
    expect(song.albumInfo.release_date).toBe("1973-04-02");
    expect(song.released.release_date).toBe("1969-04-11");
    expect(song.decade).toBe(1960);
  });

  it("gives the local file with no date no decade", () => {
    expect(byTitle(fixture().playlist.songs, "guardin - fake").decade).toBe(null);
  });
});

describe("months", () => {
  it("buckets an added date into its month", () => {
    expect(monthOf({ addedAt: new Date("2025-09-03T12:00:00Z") })).toBe("2025-09");
    expect(monthOf({ addedAt: new Date("2025-12-31T12:00:00Z") })).toBe("2025-12");
    expect(monthOf({ addedAt: new Date("2026-01-01T12:00:00Z") })).toBe("2026-01");
  });

  it("has no month for a song with no added date", () => {
    expect(monthOf({ addedAt: null })).toBe(null);
  });

  it("uses the deduplicated song's earliest date", () => {
    expect(byTitle(fixture().playlist.songs, "Everything Is Alright").month).toBe("2022-11");
  });
});
