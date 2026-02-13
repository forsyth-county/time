const { generateRoomId, generateShortId } = require("../utils/generateId");

describe("generateRoomId", () => {
  it("generates an 8-character string by default", () => {
    const id = generateRoomId();
    expect(id).toHaveLength(8);
  });

  it("generates only alphanumeric characters", () => {
    for (let i = 0; i < 100; i++) {
      const id = generateRoomId();
      expect(id).toMatch(/^[A-Za-z0-9]+$/);
    }
  });

  it("generates unique IDs", () => {
    const ids = new Set();
    for (let i = 0; i < 200; i++) {
      ids.add(generateRoomId());
    }
    expect(ids.size).toBeGreaterThan(195);
  });

  it("respects custom length parameter", () => {
    expect(generateRoomId(12)).toHaveLength(12);
    expect(generateRoomId(4)).toHaveLength(4);
  });
});

describe("generateShortId", () => {
  it("generates a 12-character hex string by default", () => {
    const id = generateShortId();
    expect(id).toHaveLength(12);
    expect(id).toMatch(/^[0-9a-f]+$/);
  });

  it("respects custom length parameter", () => {
    const id = generateShortId(8);
    expect(id).toHaveLength(8);
  });

  it("generates unique IDs", () => {
    const ids = new Set();
    for (let i = 0; i < 200; i++) {
      ids.add(generateShortId());
    }
    expect(ids.size).toBeGreaterThan(195);
  });
});
