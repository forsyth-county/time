const mongoose = require("mongoose");

// Must set JWT_SECRET before requiring models that depend on auth
process.env.JWT_SECRET = "test_jwt_secret_for_unit_tests";

const User = require("../models/User");
const Room = require("../models/Room");

describe("User model", () => {
  describe("schema validation", () => {
    it("requires email", () => {
      const user = new User({ username: "test", password: "test123" });
      const err = user.validateSync();
      expect(err.errors.email).toBeDefined();
    });

    it("requires username", () => {
      const user = new User({ email: "a@b.com", password: "test123" });
      const err = user.validateSync();
      expect(err.errors.username).toBeDefined();
    });

    it("enforces username minlength (3)", () => {
      const user = new User({ email: "a@b.com", username: "ab", password: "pw" });
      const err = user.validateSync();
      expect(err.errors.username).toBeDefined();
    });

    it("enforces username maxlength (20)", () => {
      const user = new User({
        email: "a@b.com",
        username: "a".repeat(21),
        password: "pw",
      });
      const err = user.validateSync();
      expect(err.errors.username).toBeDefined();
    });

    it("accepts valid user data", () => {
      const user = new User({
        email: "test@example.com",
        username: "testuser",
        password: "password123",
      });
      const err = user.validateSync();
      expect(err).toBeUndefined();
    });

    it("lowercases email", () => {
      const user = new User({
        email: "Test@Example.COM",
        username: "testuser",
        password: "password123",
      });
      expect(user.email).toBe("test@example.com");
    });

    it("toJSON removes password and __v", () => {
      const user = new User({
        email: "a@b.com",
        username: "testuser",
        password: "secret",
      });
      const json = user.toJSON();
      expect(json.password).toBeUndefined();
      expect(json.__v).toBeUndefined();
      expect(json.email).toBe("a@b.com");
    });
  });
});

describe("Room model", () => {
  describe("schema validation", () => {
    const validRoom = {
      roomId: "ABCD1234",
      name: "Test Room",
      creator: new mongoose.Types.ObjectId(),
    };

    it("requires roomId", () => {
      const room = new Room({ name: "Test", creator: new mongoose.Types.ObjectId() });
      const err = room.validateSync();
      expect(err.errors.roomId).toBeDefined();
    });

    it("requires name", () => {
      const room = new Room({
        roomId: "ABCD1234",
        creator: new mongoose.Types.ObjectId(),
      });
      const err = room.validateSync();
      expect(err.errors.name).toBeDefined();
    });

    it("requires creator", () => {
      const room = new Room({ roomId: "ABCD1234", name: "Test" });
      const err = room.validateSync();
      expect(err.errors.creator).toBeDefined();
    });

    it("enforces roomId length of 8", () => {
      const shortRoom = new Room({
        ...validRoom,
        roomId: "ABC",
      });
      const err = shortRoom.validateSync();
      expect(err.errors.roomId).toBeDefined();
    });

    it("enforces name maxlength (50)", () => {
      const room = new Room({
        ...validRoom,
        name: "x".repeat(51),
      });
      const err = room.validateSync();
      expect(err.errors.name).toBeDefined();
    });

    it("accepts valid room data", () => {
      const room = new Room(validRoom);
      const err = room.validateSync();
      expect(err).toBeUndefined();
    });

    it("defaults isPrivate to false", () => {
      const room = new Room(validRoom);
      expect(room.isPrivate).toBe(false);
    });

    it("defaults waitingRoomEnabled to false", () => {
      const room = new Room(validRoom);
      expect(room.waitingRoomEnabled).toBe(false);
    });

    it("has empty chatMessages by default", () => {
      const room = new Room(validRoom);
      expect(room.chatMessages).toHaveLength(0);
    });

    it("has empty waitingRoom by default", () => {
      const room = new Room(validRoom);
      expect(room.waitingRoom).toHaveLength(0);
    });

    it("accepts chat messages with correct schema", () => {
      const room = new Room({
        ...validRoom,
        chatMessages: [
          {
            username: "user1",
            message: "Hello!",
          },
        ],
      });
      const err = room.validateSync();
      expect(err).toBeUndefined();
      expect(room.chatMessages[0].username).toBe("user1");
      expect(room.chatMessages[0].message).toBe("Hello!");
      expect(room.chatMessages[0].messageId).toBeDefined();
      expect(room.chatMessages[0].timestamp).toBeDefined();
    });

    it("enforces message maxlength (1000)", () => {
      const room = new Room({
        ...validRoom,
        chatMessages: [
          {
            username: "user1",
            message: "x".repeat(1001),
          },
        ],
      });
      const err = room.validateSync();
      expect(err).toBeDefined();
    });

    it("requires message in chat", () => {
      const room = new Room({
        ...validRoom,
        chatMessages: [
          {
            username: "user1",
          },
        ],
      });
      const err = room.validateSync();
      expect(err).toBeDefined();
    });

    it("requires username in chat", () => {
      const room = new Room({
        ...validRoom,
        chatMessages: [
          {
            message: "Hello!",
          },
        ],
      });
      const err = room.validateSync();
      expect(err).toBeDefined();
    });
  });
});
