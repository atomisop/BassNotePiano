import { describe, expect, it } from "vitest";
import { googlePictureUrl } from "@/lib/googleAvatar";

describe("googlePictureUrl", () => {
  it("accepts Google's picture host and asks for 128 px", () => {
    expect(googlePictureUrl("https://lh3.googleusercontent.com/a/ABC123=s96-c")).toBe("https://lh3.googleusercontent.com/a/ABC123=s128-c");
    expect(googlePictureUrl("https://lh3.googleusercontent.com/a/ABC123")).toBe("https://lh3.googleusercontent.com/a/ABC123=s128-c");
  });
  it("drops query strings and fragments", () => {
    expect(googlePictureUrl("https://lh4.googleusercontent.com/a/X=s96-c?x=1#y")).toBe("https://lh4.googleusercontent.com/a/X=s128-c");
  });
  it("refuses every other address, so our server never fetches a free-form URL", () => {
    for (const bad of [
      null,
      "",
      "not a url",
      "http://lh3.googleusercontent.com/a/X",
      "https://evil.example.com/a/X",
      "https://lh3.googleusercontent.com.evil.example.com/a/X",
      "https://user:pw@lh3.googleusercontent.com/a/X",
      "https://lh3.googleusercontent.com:8443/a/X",
      "https://127.0.0.1/a/X",
      "https://googleusercontent.com/a/X",
    ]) {
      expect(googlePictureUrl(bad)).toBeNull();
    }
  });
});
