import { describe, expect, it } from "vitest";
import { rankLeaderboard, topWithMe } from "@/lib/leaderboardRules";

const e = (userId: string, minutes: number, name = userId) => ({ userId, name, minutes });

describe("rankLeaderboard", () => {
  it("ranks by minutes, ties share a place, the next place skips", () => {
    const ranked = rankLeaderboard([e("c", 20), e("a", 50), e("b", 50), e("d", 5)]);
    expect(ranked.map((r) => [r.userId, r.place])).toEqual([
      ["a", 1],
      ["b", 1],
      ["c", 3],
      ["d", 4],
    ]);
  });
  it("leaves out anyone with no minutes this week", () => {
    expect(rankLeaderboard([e("a", 0), e("b", 3)]).map((r) => r.userId)).toEqual(["b"]);
  });
});

describe("topWithMe", () => {
  const ranked = rankLeaderboard([e("a", 60), e("b", 50), e("c", 40), e("d", 30)]);
  it("is the top rows, plus my row when I am further down", () => {
    expect(topWithMe(ranked, 2, "d")).toEqual({ top: ranked.slice(0, 2), me: ranked[3] });
  });
  it("does not repeat my row when I am already in the top", () => {
    expect(topWithMe(ranked, 2, "a")).toEqual({ top: ranked.slice(0, 2), me: null });
    expect(topWithMe(ranked, 2, "zz")).toEqual({ top: ranked.slice(0, 2), me: null });
  });
});
