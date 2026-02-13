// Set JWT_SECRET before requiring socket handler
process.env.JWT_SECRET = "test_jwt_secret_for_unit_tests";

const { setupSocket, roomParticipants } = require("../socket/handler");

describe("socket handler", () => {
  it("exports setupSocket function", () => {
    expect(typeof setupSocket).toBe("function");
  });

  it("exports roomParticipants as a Map", () => {
    expect(roomParticipants).toBeInstanceOf(Map);
  });

  it("roomParticipants is initially empty", () => {
    expect(roomParticipants.size).toBe(0);
  });
});

describe("socket handler setupSocket", () => {
  let mockIo;
  let connectionHandler;

  beforeEach(() => {
    roomParticipants.clear();

    // Build a mock io
    const middlewares = [];
    mockIo = {
      use: jest.fn((fn) => middlewares.push(fn)),
      on: jest.fn((event, handler) => {
        if (event === "connection") connectionHandler = handler;
      }),
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      fetchSockets: jest.fn().mockResolvedValue([]),
      sockets: { sockets: new Map() },
      _middlewares: middlewares,
    };

    setupSocket(mockIo);
  });

  it("registers JWT auth middleware", () => {
    expect(mockIo.use).toHaveBeenCalledTimes(1);
    expect(typeof mockIo._middlewares[0]).toBe("function");
  });

  it("registers connection handler", () => {
    expect(mockIo.on).toHaveBeenCalledWith("connection", expect.any(Function));
    expect(typeof connectionHandler).toBe("function");
  });

  describe("auth middleware", () => {
    it("sets guest username when no token provided", (done) => {
      const socket = { handshake: { auth: {} }, data: {} };
      mockIo._middlewares[0](socket, (err) => {
        expect(err).toBeUndefined();
        expect(socket.data.authenticated).toBe(false);
        expect(socket.data.isGuest).toBe(true);
        expect(socket.data.username).toMatch(/^Guest_/);
        done();
      });
    });

    it("sets guest username for invalid token", (done) => {
      const socket = { handshake: { auth: { token: "invalid.token" } }, data: {} };
      mockIo._middlewares[0](socket, (err) => {
        expect(err).toBeUndefined();
        expect(socket.data.authenticated).toBe(false);
        expect(socket.data.isGuest).toBe(true);
        done();
      });
    });

    it("authenticates with valid JWT token", (done) => {
      const jwt = require("jsonwebtoken");
      const token = jwt.sign({ id: "user123" }, process.env.JWT_SECRET, { expiresIn: "1h" });

      const socket = { handshake: { auth: { token } }, data: {} };
      mockIo._middlewares[0](socket, (err) => {
        expect(err).toBeUndefined();
        expect(socket.data.authenticated).toBe(true);
        expect(socket.data.userId).toBe("user123");
        done();
      });
    });
  });

  describe("connection events", () => {
    let socket;
    let socketEventHandlers;

    beforeEach(() => {
      socketEventHandlers = {};
      socket = {
        id: "socket_123",
        data: { username: "TestUser", authenticated: false, isGuest: true },
        on: jest.fn((event, handler) => {
          socketEventHandlers[event] = handler;
        }),
        join: jest.fn(),
        leave: jest.fn(),
        to: jest.fn().mockReturnValue({ emit: jest.fn() }),
        emit: jest.fn(),
      };
      connectionHandler(socket);
    });

    it("registers all expected event handlers", () => {
      const expectedEvents = [
        "join-room",
        "offer",
        "answer",
        "ice-candidate",
        "chat-message",
        "chat-reaction",
        "toggle-mute",
        "toggle-video",
        "screen-share-start",
        "screen-share-stop",
        "hand-raise",
        "approve-user",
        "reject-user",
        "leave-room",
        "disconnect",
      ];
      for (const event of expectedEvents) {
        expect(socketEventHandlers[event]).toBeDefined();
      }
    });

    describe("join-room", () => {
      it("rejects invalid roomId", () => {
        socketEventHandlers["join-room"]({});
        expect(socket.emit).toHaveBeenCalledWith("error-message", {
          message: "Valid roomId is required",
        });
      });

      it("rejects missing roomId", () => {
        socketEventHandlers["join-room"]({ roomId: "" });
        expect(socket.emit).toHaveBeenCalledWith("error-message", {
          message: "Valid roomId is required",
        });
      });

      it("rejects too-long roomId", () => {
        socketEventHandlers["join-room"]({ roomId: "x".repeat(129) });
        expect(socket.emit).toHaveBeenCalledWith("error-message", {
          message: "Valid roomId is required",
        });
      });

      it("joins room and creates participant entry", () => {
        socketEventHandlers["join-room"]({ roomId: "room1" });
        expect(socket.join).toHaveBeenCalledWith("room1");
        expect(socket.data.roomId).toBe("room1");
        expect(roomParticipants.has("room1")).toBe(true);
        expect(roomParticipants.get("room1").has("socket_123")).toBe(true);
      });

      it("sends room-participants to joiner", () => {
        socketEventHandlers["join-room"]({ roomId: "room1" });
        expect(socket.emit).toHaveBeenCalledWith(
          "room-participants",
          expect.any(Array)
        );
      });

      it("notifies existing participants of new joiner", () => {
        socketEventHandlers["join-room"]({ roomId: "room1" });
        expect(socket.to).toHaveBeenCalledWith("room1");
      });
    });

    describe("leave-room", () => {
      it("cleans up participant on leave", () => {
        socketEventHandlers["join-room"]({ roomId: "room2" });
        expect(roomParticipants.has("room2")).toBe(true);

        socketEventHandlers["leave-room"]();
        expect(roomParticipants.has("room2")).toBe(false);
        expect(socket.leave).toHaveBeenCalledWith("room2");
      });
    });

    describe("disconnect", () => {
      it("cleans up participant on disconnect", () => {
        socketEventHandlers["join-room"]({ roomId: "room3" });
        expect(roomParticipants.has("room3")).toBe(true);

        socketEventHandlers["disconnect"]("transport close");
        expect(roomParticipants.has("room3")).toBe(false);
      });
    });

    describe("toggle-mute", () => {
      it("updates muted state in room participants", () => {
        socketEventHandlers["join-room"]({ roomId: "room4" });
        socketEventHandlers["toggle-mute"]({ roomId: "room4", muted: true });

        const participant = roomParticipants.get("room4").get("socket_123");
        expect(participant.muted).toBe(true);
      });

      it("ignores invalid muted value", () => {
        socketEventHandlers["join-room"]({ roomId: "room4b" });
        socketEventHandlers["toggle-mute"]({ roomId: "room4b", muted: "yes" });

        const participant = roomParticipants.get("room4b").get("socket_123");
        expect(participant.muted).toBe(false);
      });
    });

    describe("toggle-video", () => {
      it("updates videoOff state in room participants", () => {
        socketEventHandlers["join-room"]({ roomId: "room5" });
        socketEventHandlers["toggle-video"]({ roomId: "room5", videoOff: true });

        const participant = roomParticipants.get("room5").get("socket_123");
        expect(participant.videoOff).toBe(true);
      });
    });

    describe("hand-raise", () => {
      it("updates handRaised state in room participants", () => {
        socketEventHandlers["join-room"]({ roomId: "room6" });
        socketEventHandlers["hand-raise"]({ roomId: "room6", raised: true });

        const participant = roomParticipants.get("room6").get("socket_123");
        expect(participant.handRaised).toBe(true);
      });
    });

    describe("screen-share-start/stop", () => {
      it("updates screenSharing state on start", () => {
        socketEventHandlers["join-room"]({ roomId: "room7" });
        socketEventHandlers["screen-share-start"]({ roomId: "room7" });

        const participant = roomParticipants.get("room7").get("socket_123");
        expect(participant.screenSharing).toBe(true);
      });

      it("updates screenSharing state on stop", () => {
        socketEventHandlers["join-room"]({ roomId: "room8" });
        socketEventHandlers["screen-share-start"]({ roomId: "room8" });
        socketEventHandlers["screen-share-stop"]({ roomId: "room8" });

        const participant = roomParticipants.get("room8").get("socket_123");
        expect(participant.screenSharing).toBe(false);
      });
    });

    describe("WebRTC signaling", () => {
      it("relays offer to target socket", () => {
        mockIo.to = jest.fn().mockReturnValue({ emit: jest.fn() });
        socketEventHandlers["offer"]({ to: "target_1", offer: { sdp: "test" } });
        expect(mockIo.to).toHaveBeenCalledWith("target_1");
      });

      it("relays answer to target socket", () => {
        mockIo.to = jest.fn().mockReturnValue({ emit: jest.fn() });
        socketEventHandlers["answer"]({ to: "target_2", answer: { sdp: "test" } });
        expect(mockIo.to).toHaveBeenCalledWith("target_2");
      });

      it("relays ice-candidate to target socket", () => {
        mockIo.to = jest.fn().mockReturnValue({ emit: jest.fn() });
        socketEventHandlers["ice-candidate"]({
          to: "target_3",
          candidate: { candidate: "test" },
        });
        expect(mockIo.to).toHaveBeenCalledWith("target_3");
      });

      it("ignores offer with missing target", () => {
        mockIo.to = jest.fn().mockReturnValue({ emit: jest.fn() });
        socketEventHandlers["offer"]({ offer: { sdp: "test" } });
        expect(mockIo.to).not.toHaveBeenCalled();
      });

      it("ignores offer with missing data", () => {
        mockIo.to = jest.fn().mockReturnValue({ emit: jest.fn() });
        socketEventHandlers["offer"]({ to: "target" });
        expect(mockIo.to).not.toHaveBeenCalled();
      });
    });

    describe("chat-message", () => {
      it("ignores empty message", () => {
        socketEventHandlers["chat-message"]({ roomId: "room9", message: "" });
        // Should not emit to room since message is empty
        expect(mockIo.to).not.toHaveBeenCalled();
      });

      it("ignores message exceeding 1000 chars", () => {
        socketEventHandlers["chat-message"]({
          roomId: "room10",
          message: "x".repeat(1001),
        });
        expect(mockIo.to).not.toHaveBeenCalled();
      });

      it("ignores missing roomId", () => {
        socketEventHandlers["chat-message"]({ message: "hello" });
        expect(mockIo.to).not.toHaveBeenCalled();
      });
    });
  });
});
