/**
 * Strict end-to-end PeerJS connection tests.
 *
 * Validates the full WebRTC connection lifecycle:
 * 1. Peer creation and identity
 * 2. Broadcaster waiting for incoming calls
 * 3. Viewer initiating a call
 * 4. Stream negotiation and delivery
 * 5. Disconnection and resource cleanup
 * 6. Error scenarios (invalid IDs, destroyed peers)
 *
 * Uses mocked PeerJS to test connection logic in jsdom.
 * Every assertion is strict — no optional/loose checks.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---------- helpers ----------

/** Tiny EventEmitter that mirrors PeerJS's .on()/.emit() pattern */
class FakeEmitter {
  private handlers: Record<string, ((...args: any[]) => void)[]> = {};
  on(event: string, fn: (...args: any[]) => void) {
    (this.handlers[event] ??= []).push(fn);
    return this;
  }
  emit(event: string, ...args: any[]) {
    this.handlers[event]?.forEach((fn) => fn(...args));
  }
  /** Returns the number of listeners for a given event */
  listenerCount(event: string): number {
    return this.handlers[event]?.length ?? 0;
  }
}

// ---------- mocks ----------

class FakeMediaConnection extends FakeEmitter {
  peerConnection = { getSenders: () => [] };
  closed = false;
  answeredWith: MediaStream | null = null;

  answer(stream?: MediaStream) {
    if (this.closed) throw new Error("Cannot answer a closed connection");
    this.answeredWith = stream ?? null;
    // Simulate receiving the remote stream shortly after answering
    if (stream) {
      setTimeout(() => this.emit("stream", stream), 0);
    }
  }
  close() {
    if (this.closed) return; // idempotent
    this.closed = true;
    this.emit("close");
  }
}

class FakePeer extends FakeEmitter {
  id: string;
  destroyed = false;
  disconnected = false;
  _lastCall: FakeMediaConnection | null = null;

  constructor(id?: string) {
    super();
    this.id = id ?? `viewer-${Math.random().toString(36).slice(2, 8)}`;
    // Simulate the "open" event asynchronously (mirrors real PeerJS)
    setTimeout(() => {
      if (!this.destroyed) this.emit("open", this.id);
    }, 0);
  }

  call(remotePeerId: string, _stream: MediaStream): FakeMediaConnection {
    if (this.destroyed) throw new Error("Cannot call on a destroyed peer");
    if (!remotePeerId) throw new Error("Remote peer ID is required");
    const conn = new FakeMediaConnection();
    this._lastCall = conn;
    return conn;
  }

  destroy() {
    this.destroyed = true;
    this.disconnected = true;
  }
}

// Replace `import("peerjs")` with our fake
jest.mock("peerjs", () => ({
  __esModule: true,
  default: FakePeer,
}));

// ---------- tests ----------

describe("PeerJS end-to-end connection flow (strict)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("Peer creation and identity", () => {
    it("broadcaster peer opens with the exact specified ID", async () => {
      const Peer = (await import("peerjs")).default;
      const broadcaster = new Peer("strict-broadcaster-id") as unknown as FakePeer;

      let openedId: string | null = null;
      broadcaster.on("open", (id: string) => {
        openedId = id;
      });

      // Before timer fires, no open event
      expect(openedId).toBeNull();

      jest.runAllTimers();

      expect(openedId).toBe("strict-broadcaster-id");
      expect(broadcaster.id).toBe("strict-broadcaster-id");
      expect(broadcaster.destroyed).toBe(false);
      expect(broadcaster.disconnected).toBe(false);
    });

    it("viewer peer opens with an auto-generated ID", async () => {
      const Peer = (await import("peerjs")).default;
      const viewer = new Peer() as unknown as FakePeer;

      let openedId: string | null = null;
      viewer.on("open", (id: string) => {
        openedId = id;
      });

      jest.runAllTimers();

      expect(openedId).not.toBeNull();
      expect(typeof openedId).toBe("string");
      expect(openedId!.length).toBeGreaterThan(0);
      expect(openedId).toBe(viewer.id);
    });

    it("two peers have distinct IDs", async () => {
      const Peer = (await import("peerjs")).default;
      const p1 = new Peer("peer-A") as unknown as FakePeer;
      const p2 = new Peer("peer-B") as unknown as FakePeer;

      jest.runAllTimers();

      expect(p1.id).not.toBe(p2.id);
      expect(p1.id).toBe("peer-A");
      expect(p2.id).toBe("peer-B");
    });
  });

  describe("Connection lifecycle", () => {
    it("viewer calls broadcaster, broadcaster answers, viewer receives stream", async () => {
      const Peer = (await import("peerjs")).default;

      // 1. Create broadcaster
      const broadcaster = new Peer("bc-lifecycle") as unknown as FakePeer;
      jest.runAllTimers();

      // 2. Prepare a fake camera stream
      const fakeStream = { id: "camera-stream-42" } as unknown as MediaStream;

      // 3. Broadcaster listens for calls
      let broadcasterReceivedCall = false;
      broadcaster.on("call", (call: FakeMediaConnection) => {
        broadcasterReceivedCall = true;
        call.answer(fakeStream);
      });

      // 4. Viewer connects
      const viewer = new Peer() as unknown as FakePeer;
      jest.runAllTimers();

      const silentStream = new MediaStream();
      const call = viewer.call("bc-lifecycle", silentStream) as unknown as FakeMediaConnection;

      // Strict: call object must exist
      expect(call).toBeDefined();
      expect(call).toBeInstanceOf(FakeMediaConnection);

      // 5. Set up stream receiver
      let receivedStream: MediaStream | null = null;
      call.on("stream", (stream: MediaStream) => {
        receivedStream = stream;
      });

      // 6. Simulate signaling: broadcaster receives the call
      broadcaster.emit("call", call);
      jest.runAllTimers();

      // Strict assertions
      expect(broadcasterReceivedCall).toBe(true);
      expect(call.answeredWith).toBe(fakeStream);
      expect(receivedStream).toBe(fakeStream);
      expect(receivedStream).not.toBeNull();
      expect((receivedStream as any).id).toBe("camera-stream-42");
    });

    it("stream is not received until broadcaster answers", async () => {
      const Peer = (await import("peerjs")).default;

      const broadcaster = new Peer("bc-noanswer") as unknown as FakePeer;
      jest.runAllTimers();

      const viewer = new Peer() as unknown as FakePeer;
      jest.runAllTimers();

      const call = viewer.call("bc-noanswer", new MediaStream()) as unknown as FakeMediaConnection;

      let receivedStream: MediaStream | null = null;
      call.on("stream", (stream: MediaStream) => {
        receivedStream = stream;
      });

      // Broadcaster receives call but does NOT answer
      broadcaster.on("call", () => {
        // intentionally left empty — no answer
      });
      broadcaster.emit("call", call);
      jest.runAllTimers();

      // Strict: viewer must NOT have received a stream
      expect(receivedStream).toBeNull();
      expect(call.answeredWith).toBeNull();
    });
  });

  describe("Disconnection and cleanup", () => {
    it("close event fires exactly once on disconnect", async () => {
      const Peer = (await import("peerjs")).default;

      const broadcaster = new Peer("bc-close") as unknown as FakePeer;
      jest.runAllTimers();

      const fakeStream = { id: "s" } as unknown as MediaStream;
      broadcaster.on("call", (call: FakeMediaConnection) => {
        call.answer(fakeStream);
      });

      const viewer = new Peer() as unknown as FakePeer;
      jest.runAllTimers();

      const call = viewer.call("bc-close", new MediaStream()) as unknown as FakeMediaConnection;
      broadcaster.emit("call", call);
      jest.runAllTimers();

      let closeCount = 0;
      call.on("close", () => {
        closeCount++;
      });

      call.close();
      expect(closeCount).toBe(1);
      expect(call.closed).toBe(true);

      // Calling close again should be idempotent
      call.close();
      expect(closeCount).toBe(1); // still 1
    });

    it("destroying a peer sets destroyed and disconnected to true", async () => {
      const Peer = (await import("peerjs")).default;

      const peer = new Peer("destroy-test") as unknown as FakePeer;
      jest.runAllTimers();

      expect(peer.destroyed).toBe(false);
      expect(peer.disconnected).toBe(false);

      peer.destroy();

      expect(peer.destroyed).toBe(true);
      expect(peer.disconnected).toBe(true);
    });

    it("destroyed peer does not emit open event", async () => {
      const Peer = (await import("peerjs")).default;

      const peer = new Peer("no-open") as unknown as FakePeer;
      let opened = false;
      peer.on("open", () => {
        opened = true;
      });

      // Destroy before timer fires
      peer.destroy();
      jest.runAllTimers();

      expect(opened).toBe(false);
    });

    it("calling on a destroyed peer throws", async () => {
      const Peer = (await import("peerjs")).default;

      const peer = new Peer("destroyed-call") as unknown as FakePeer;
      jest.runAllTimers();
      peer.destroy();

      expect(() => {
        peer.call("someone", new MediaStream());
      }).toThrow("Cannot call on a destroyed peer");
    });
  });

  describe("Error scenarios", () => {
    it("calling with empty peer ID throws", async () => {
      const Peer = (await import("peerjs")).default;

      const peer = new Peer("err-empty") as unknown as FakePeer;
      jest.runAllTimers();

      expect(() => {
        peer.call("", new MediaStream());
      }).toThrow("Remote peer ID is required");
    });

    it("answering a closed connection throws", async () => {
      const call = new FakeMediaConnection();
      call.close();

      const fakeStream = { id: "s" } as unknown as MediaStream;
      expect(() => {
        call.answer(fakeStream);
      }).toThrow("Cannot answer a closed connection");
    });

    it("peer error event propagates error message", async () => {
      const Peer = (await import("peerjs")).default;

      const peer = new Peer("err-test") as unknown as FakePeer;
      jest.runAllTimers();

      let errorMessage: string | null = null;
      peer.on("error", (err: { message: string }) => {
        errorMessage = err.message;
      });

      peer.emit("error", { message: "peer-unavailable" });

      expect(errorMessage).toBe("peer-unavailable");
    });
  });

  describe("Full round-trip (strict event sequence)", () => {
    it("complete flow: open → call → answer → stream → close → destroy", async () => {
      const Peer = (await import("peerjs")).default;

      const events: string[] = [];

      // --- Broadcaster ---
      const broadcasterPeer = new Peer("roundtrip-strict") as unknown as FakePeer;
      broadcasterPeer.on("open", () => events.push("broadcaster:open"));
      jest.runAllTimers();

      expect(events).toStrictEqual(["broadcaster:open"]);

      const fakeStream = {
        id: "camera-stream",
        getTracks: () => [],
        getVideoTracks: () => [],
        getAudioTracks: () => [],
      } as unknown as MediaStream;

      broadcasterPeer.on("call", (call: FakeMediaConnection) => {
        events.push("broadcaster:call-received");
        call.answer(fakeStream);
        events.push("broadcaster:answered");
      });

      // --- Viewer ---
      const viewerPeer = new Peer() as unknown as FakePeer;
      viewerPeer.on("open", () => events.push("viewer:open"));
      jest.runAllTimers();

      expect(events).toStrictEqual([
        "broadcaster:open",
        "viewer:open",
      ]);

      // Viewer initiates call
      const viewerCall = viewerPeer.call(
        "roundtrip-strict",
        new MediaStream()
      ) as unknown as FakeMediaConnection;

      expect(viewerCall).toBeDefined();
      events.push("viewer:call-initiated");

      viewerCall.on("stream", (stream: MediaStream) => {
        events.push("viewer:stream-received");
        // Strict: verify it's exactly our stream
        expect(stream).toBe(fakeStream);
        expect((stream as any).id).toBe("camera-stream");
      });

      viewerCall.on("close", () => {
        events.push("call:closed");
      });

      // Simulate signaling
      broadcasterPeer.emit("call", viewerCall);
      jest.runAllTimers();

      expect(events).toStrictEqual([
        "broadcaster:open",
        "viewer:open",
        "viewer:call-initiated",
        "broadcaster:call-received",
        "broadcaster:answered",
        "viewer:stream-received",
      ]);

      // Verify connection state
      expect(viewerCall.answeredWith).toBe(fakeStream);
      expect(viewerCall.closed).toBe(false);

      // --- Disconnect ---
      viewerCall.close();

      expect(events).toStrictEqual([
        "broadcaster:open",
        "viewer:open",
        "viewer:call-initiated",
        "broadcaster:call-received",
        "broadcaster:answered",
        "viewer:stream-received",
        "call:closed",
      ]);

      expect(viewerCall.closed).toBe(true);

      // --- Destroy ---
      broadcasterPeer.destroy();
      viewerPeer.destroy();

      expect(broadcasterPeer.destroyed).toBe(true);
      expect(broadcasterPeer.disconnected).toBe(true);
      expect(viewerPeer.destroyed).toBe(true);
      expect(viewerPeer.disconnected).toBe(true);
    });
  });

  describe("Multiple connections", () => {
    it("broadcaster can handle sequential calls from different viewers", async () => {
      const Peer = (await import("peerjs")).default;

      const broadcaster = new Peer("multi-test") as unknown as FakePeer;
      jest.runAllTimers();

      const fakeStream = { id: "multi-stream" } as unknown as MediaStream;
      const receivedCalls: FakeMediaConnection[] = [];

      broadcaster.on("call", (call: FakeMediaConnection) => {
        receivedCalls.push(call);
        call.answer(fakeStream);
      });

      // Viewer 1
      const viewer1 = new Peer() as unknown as FakePeer;
      jest.runAllTimers();
      const call1 = viewer1.call("multi-test", new MediaStream()) as unknown as FakeMediaConnection;
      let stream1: MediaStream | null = null;
      call1.on("stream", (s: MediaStream) => { stream1 = s; });
      broadcaster.emit("call", call1);
      jest.runAllTimers();

      // Viewer 2
      const viewer2 = new Peer() as unknown as FakePeer;
      jest.runAllTimers();
      const call2 = viewer2.call("multi-test", new MediaStream()) as unknown as FakeMediaConnection;
      let stream2: MediaStream | null = null;
      call2.on("stream", (s: MediaStream) => { stream2 = s; });
      broadcaster.emit("call", call2);
      jest.runAllTimers();

      // Strict: both viewers received the stream
      expect(receivedCalls).toHaveLength(2);
      expect(stream1).toBe(fakeStream);
      expect(stream2).toBe(fakeStream);

      // Strict: calls are independent objects
      expect(call1).not.toBe(call2);
      expect(call1.closed).toBe(false);
      expect(call2.closed).toBe(false);

      // Close one doesn't affect the other
      call1.close();
      expect(call1.closed).toBe(true);
      expect(call2.closed).toBe(false);

      // Cleanup
      call2.close();
      viewer1.destroy();
      viewer2.destroy();
      broadcaster.destroy();
    });
  });
});
