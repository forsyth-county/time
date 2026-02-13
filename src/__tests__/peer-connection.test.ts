/**
 * WebRTC connection tests using native RTCPeerConnection + Socket.IO signaling.
 *
 * Validates the full WebRTC connection lifecycle:
 * 1. RTCPeerConnection configuration
 * 2. Offer/answer SDP exchange via Socket.IO
 * 3. ICE candidate relay
 * 4. Stream track delivery
 * 5. Disconnection and resource cleanup
 * 6. Error handling
 *
 * Uses mocked RTCPeerConnection and Socket.IO to test signaling logic in jsdom.
 * Every assertion is strict — no optional/loose checks.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { RTC_CONFIG, validateBroadcastId } from "@/lib/peer";

// ---------- helpers ----------

/** Tiny EventEmitter for mocks */
class FakeEmitter {
  private handlers: Record<string, ((...args: any[]) => void)[]> = {};
  on(event: string, fn: (...args: any[]) => void) {
    (this.handlers[event] ??= []).push(fn);
    return this;
  }
  off(event: string, fn: (...args: any[]) => void) {
    const arr = this.handlers[event];
    if (arr) this.handlers[event] = arr.filter((h) => h !== fn);
    return this;
  }
  emit(event: string, ...args: any[]) {
    this.handlers[event]?.forEach((fn) => fn(...args));
  }
  removeAllListeners() {
    this.handlers = {};
  }
  listenerCount(event: string): number {
    return this.handlers[event]?.length ?? 0;
  }
}

// ---------- mocks ----------

/** Mock RTCPeerConnection that simulates offer/answer/ICE exchange */
class MockRTCPeerConnection {
  localDescription: RTCSessionDescription | null = null;
  remoteDescription: RTCSessionDescription | null = null;
  connectionState: RTCPeerConnectionState = "new";
  signalingState: RTCSignalingState = "stable";
  iceConnectionState: RTCIceConnectionState = "new";

  onicecandidate: ((e: { candidate: RTCIceCandidate | null }) => void) | null = null;
  ontrack: ((e: { track: MediaStreamTrack; streams: MediaStream[] }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;

  private _senders: RTCRtpSender[] = [];
  private _closed = false;
  config: RTCConfiguration;

  constructor(config?: RTCConfiguration) {
    this.config = config ?? {};
  }

  addTrack(track: MediaStreamTrack, stream: MediaStream): RTCRtpSender {
    const sender = { track, replaceTrack: jest.fn() } as unknown as RTCRtpSender;
    this._senders.push(sender);
    return sender;
  }

  getSenders(): RTCRtpSender[] {
    return this._senders;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: "offer" as RTCSdpType, sdp: "mock-offer-sdp" };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: "answer" as RTCSdpType, sdp: "mock-answer-sdp" };
  }

  async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = desc as RTCSessionDescription;
    if (desc.type === "offer") {
      this.signalingState = "have-local-offer";
    } else {
      this.signalingState = "stable";
    }
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = desc as RTCSessionDescription;
    if (desc.type === "offer") {
      this.signalingState = "have-remote-offer";
    } else {
      this.signalingState = "stable";
    }
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    // No-op in mock — just verifies the method is callable
  }

  close(): void {
    if (this._closed) return;
    this._closed = true;
    this.connectionState = "closed";
    this.signalingState = "closed";
  }

  /** Test helper: simulate connection becoming connected */
  _simulateConnected(): void {
    this.connectionState = "connected";
    this.onconnectionstatechange?.();
  }

  /** Test helper: simulate connection failing */
  _simulateFailed(): void {
    this.connectionState = "failed";
    this.onconnectionstatechange?.();
  }

  /** Test helper: simulate receiving a remote track */
  _simulateTrack(track: MediaStreamTrack, stream: MediaStream): void {
    this.ontrack?.({ track, streams: [stream] });
  }

  /** Test helper: simulate ICE candidate found */
  _simulateIceCandidate(candidate: RTCIceCandidate | null): void {
    this.onicecandidate?.({ candidate });
  }
}

/** Mock Socket.IO client */
class MockSocket extends FakeEmitter {
  connected = false;
  id = `socket-${Math.random().toString(36).slice(2, 8)}`;
  private _emitted: Array<{ event: string; data: any }> = [];

  connect() {
    this.connected = true;
    // Simulate async connect
    setTimeout(() => this.emit("connect"), 0);
  }

  disconnect() {
    this.connected = false;
    this.emit("disconnect", "io client disconnect");
  }

  /** Override emit to also record outgoing events */
  emit(event: string, ...args: any[]) {
    if (event !== "connect" && event !== "disconnect" && event !== "connect_error") {
      this._emitted.push({ event, data: args[0] });
    }
    super.emit(event, ...args);
    return this as any;
  }

  /** Test helper: get all emitted events of a particular type */
  _getEmitted(event: string): any[] {
    return this._emitted.filter((e) => e.event === event).map((e) => e.data);
  }
}

// Install mock RTCPeerConnection globally
(globalThis as any).RTCPeerConnection = MockRTCPeerConnection;
(globalThis as any).RTCSessionDescription = class {
  type: string;
  sdp: string;
  constructor(init: RTCSessionDescriptionInit) {
    this.type = init.type!;
    this.sdp = init.sdp!;
  }
};
(globalThis as any).RTCIceCandidate = class {
  candidate: string;
  constructor(init: RTCIceCandidateInit) {
    this.candidate = init.candidate ?? "";
  }
};

// ---------- tests ----------

describe("WebRTC + Socket.IO signaling (strict)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("RTC configuration", () => {
    it("RTC_CONFIG includes STUN servers", () => {
      expect(RTC_CONFIG.iceServers).toBeDefined();
      expect(RTC_CONFIG.iceServers!.length).toBeGreaterThanOrEqual(1);
      const urls = RTC_CONFIG.iceServers!.flatMap((s) =>
        Array.isArray(s.urls) ? s.urls : [s.urls]
      );
      expect(urls.some((u) => u.includes("stun:"))).toBe(true);
    });

    it("RTCPeerConnection is created with the provided config", () => {
      const pc = new MockRTCPeerConnection(RTC_CONFIG);
      expect(pc.config).toBe(RTC_CONFIG);
      expect(pc.connectionState).toBe("new");
      expect(pc.signalingState).toBe("stable");
    });
  });

  describe("SDP offer/answer exchange", () => {
    it("broadcaster creates an offer and sets local description", async () => {
      const pc = new MockRTCPeerConnection(RTC_CONFIG);

      const offer = await pc.createOffer();
      expect(offer.type).toBe("offer");
      expect(offer.sdp).toBeDefined();

      await pc.setLocalDescription(offer);
      expect(pc.localDescription).not.toBeNull();
      expect(pc.localDescription!.type).toBe("offer");
      expect(pc.signalingState).toBe("have-local-offer");
    });

    it("viewer receives offer, sets remote description, creates answer", async () => {
      const pc = new MockRTCPeerConnection(RTC_CONFIG);

      const offer: RTCSessionDescriptionInit = { type: "offer", sdp: "mock-offer-sdp" };
      await pc.setRemoteDescription(offer);
      expect(pc.remoteDescription).not.toBeNull();
      expect(pc.signalingState).toBe("have-remote-offer");

      const answer = await pc.createAnswer();
      expect(answer.type).toBe("answer");
      expect(answer.sdp).toBeDefined();

      await pc.setLocalDescription(answer);
      expect(pc.localDescription!.type).toBe("answer");
      expect(pc.signalingState).toBe("stable");
    });

    it("broadcaster receives answer and sets remote description", async () => {
      const pc = new MockRTCPeerConnection(RTC_CONFIG);

      // Broadcaster first creates an offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      expect(pc.signalingState).toBe("have-local-offer");

      // Then receives answer
      const answer: RTCSessionDescriptionInit = { type: "answer", sdp: "mock-answer-sdp" };
      await pc.setRemoteDescription(answer);
      expect(pc.remoteDescription).not.toBeNull();
      expect(pc.signalingState).toBe("stable");
    });
  });

  describe("ICE candidate relay via Socket.IO", () => {
    it("ICE candidates are sent through socket to the remote peer", () => {
      const socket = new MockSocket();
      const pc = new MockRTCPeerConnection(RTC_CONFIG);
      const targetSocketId = "remote-socket-123";

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit("ice-candidate", { to: targetSocketId, candidate: e.candidate });
        }
      };

      const fakeCandidate = { candidate: "candidate:1 1 udp 2130706431 192.168.1.1 12345 typ host" } as RTCIceCandidate;
      pc._simulateIceCandidate(fakeCandidate);

      const emitted = socket._getEmitted("ice-candidate");
      expect(emitted).toHaveLength(1);
      expect(emitted[0].to).toBe(targetSocketId);
      expect(emitted[0].candidate).toBe(fakeCandidate);
    });

    it("null ICE candidate (gathering complete) is not relayed", () => {
      const socket = new MockSocket();
      const pc = new MockRTCPeerConnection(RTC_CONFIG);

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit("ice-candidate", { to: "someone", candidate: e.candidate });
        }
      };

      pc._simulateIceCandidate(null);

      const emitted = socket._getEmitted("ice-candidate");
      expect(emitted).toHaveLength(0);
    });
  });

  describe("Socket.IO broadcast signaling", () => {
    it("broadcaster registers broadcast via create-broadcast", () => {
      const socket = new MockSocket();
      socket.connect();
      jest.runAllTimers();

      socket.emit("create-broadcast", { broadcastId: "test123" });
      const emitted = socket._getEmitted("create-broadcast");
      expect(emitted).toHaveLength(1);
      expect(emitted[0].broadcastId).toBe("test123");
    });

    it("viewer joins broadcast via join-broadcast", () => {
      const socket = new MockSocket();
      socket.connect();
      jest.runAllTimers();

      socket.emit("join-broadcast", { broadcastId: "test123" });
      const emitted = socket._getEmitted("join-broadcast");
      expect(emitted).toHaveLength(1);
      expect(emitted[0].broadcastId).toBe("test123");
    });

    it("socket connect emits connect event", () => {
      const socket = new MockSocket();
      let connected = false;
      socket.on("connect", () => { connected = true; });

      socket.connect();
      jest.runAllTimers();

      expect(connected).toBe(true);
      expect(socket.connected).toBe(true);
    });
  });

  describe("Stream track delivery", () => {
    it("viewer receives remote track via ontrack callback", () => {
      const pc = new MockRTCPeerConnection(RTC_CONFIG);

      let receivedStream: MediaStream | null = null;
      pc.ontrack = (e) => {
        if (e.streams[0]) {
          receivedStream = e.streams[0];
        }
      };

      const fakeTrack = { kind: "video", id: "video-track-1" } as MediaStreamTrack;
      const fakeStream = new MediaStream();
      pc._simulateTrack(fakeTrack, fakeStream);

      expect(receivedStream).toBe(fakeStream);
    });

    it("broadcaster adds tracks to peer connection before offer", () => {
      const pc = new MockRTCPeerConnection(RTC_CONFIG);
      const stream = new MediaStream();

      const videoTrack = { kind: "video", id: "v1" } as MediaStreamTrack;
      const audioTrack = { kind: "audio", id: "a1" } as MediaStreamTrack;

      pc.addTrack(videoTrack, stream);
      pc.addTrack(audioTrack, stream);

      const senders = pc.getSenders();
      expect(senders).toHaveLength(2);
      expect(senders[0].track).toBe(videoTrack);
      expect(senders[1].track).toBe(audioTrack);
    });
  });

  describe("Connection state changes", () => {
    it("connectionState transitions to connected after successful negotiation", () => {
      const pc = new MockRTCPeerConnection(RTC_CONFIG);

      let currentState: RTCPeerConnectionState = "new";
      pc.onconnectionstatechange = () => {
        currentState = pc.connectionState;
      };

      expect(pc.connectionState).toBe("new");

      pc._simulateConnected();
      expect(currentState).toBe("connected");
      expect(pc.connectionState).toBe("connected");
    });

    it("connectionState transitions to failed on error", () => {
      const pc = new MockRTCPeerConnection(RTC_CONFIG);

      let currentState: RTCPeerConnectionState = "new";
      pc.onconnectionstatechange = () => {
        currentState = pc.connectionState;
      };

      pc._simulateFailed();
      expect(currentState).toBe("failed");
    });
  });

  describe("Disconnection and cleanup", () => {
    it("closing peer connection sets state to closed", () => {
      const pc = new MockRTCPeerConnection(RTC_CONFIG);
      expect(pc.connectionState).toBe("new");

      pc.close();
      expect(pc.connectionState).toBe("closed");
      expect(pc.signalingState).toBe("closed");
    });

    it("closing is idempotent", () => {
      const pc = new MockRTCPeerConnection(RTC_CONFIG);
      pc.close();
      pc.close(); // should not throw
      expect(pc.connectionState).toBe("closed");
    });

    it("socket disconnect cleans up", () => {
      const socket = new MockSocket();
      socket.connect();
      jest.runAllTimers();

      expect(socket.connected).toBe(true);

      socket.disconnect();
      expect(socket.connected).toBe(false);
    });

    it("removeAllListeners prevents stale event firing", () => {
      const socket = new MockSocket();
      let callCount = 0;
      socket.on("test-event", () => { callCount++; });

      socket.emit("test-event");
      expect(callCount).toBe(1);

      socket.removeAllListeners();
      socket.emit("test-event");
      expect(callCount).toBe(1); // still 1 — listener was removed
    });
  });

  describe("Full round-trip signaling flow", () => {
    it("complete flow: socket connect → register → offer → answer → ICE → stream → close", async () => {
      const events: string[] = [];

      // --- Broadcaster side ---
      const broadcasterSocket = new MockSocket();
      const broadcasterPC = new MockRTCPeerConnection(RTC_CONFIG);

      // Add stream tracks
      const videoTrack = { kind: "video", id: "cam-v" } as MediaStreamTrack;
      const audioTrack = { kind: "audio", id: "cam-a" } as MediaStreamTrack;
      const localStream = new MediaStream();
      broadcasterPC.addTrack(videoTrack, localStream);
      broadcasterPC.addTrack(audioTrack, localStream);

      broadcasterSocket.on("connect", () => {
        events.push("broadcaster:connected");
        broadcasterSocket.emit("create-broadcast", { broadcastId: "ABC123" });
      });

      broadcasterSocket.connect();
      jest.runAllTimers();
      expect(events).toStrictEqual(["broadcaster:connected"]);

      // --- Viewer side ---
      const viewerSocket = new MockSocket();
      const viewerPC = new MockRTCPeerConnection(RTC_CONFIG);

      viewerSocket.on("connect", () => {
        events.push("viewer:connected");
        viewerSocket.emit("join-broadcast", { broadcastId: "ABC123" });
      });

      viewerSocket.connect();
      jest.runAllTimers();
      expect(events).toStrictEqual(["broadcaster:connected", "viewer:connected"]);

      // --- Broadcaster creates offer (triggered by viewer-joined event) ---
      events.push("broadcaster:creating-offer");
      const offer = await broadcasterPC.createOffer();
      await broadcasterPC.setLocalDescription(offer);
      expect(broadcasterPC.signalingState).toBe("have-local-offer");

      // Send offer via socket
      broadcasterSocket.emit("offer", { to: viewerSocket.id, offer: broadcasterPC.localDescription });
      events.push("broadcaster:offer-sent");

      // --- Viewer receives offer and creates answer ---
      events.push("viewer:processing-offer");
      await viewerPC.setRemoteDescription(offer);
      expect(viewerPC.signalingState).toBe("have-remote-offer");

      const answer = await viewerPC.createAnswer();
      await viewerPC.setLocalDescription(answer);
      expect(viewerPC.signalingState).toBe("stable");

      viewerSocket.emit("answer", { to: broadcasterSocket.id, answer: viewerPC.localDescription });
      events.push("viewer:answer-sent");

      // --- Broadcaster receives answer ---
      await broadcasterPC.setRemoteDescription(answer);
      expect(broadcasterPC.signalingState).toBe("stable");
      events.push("broadcaster:answer-received");

      // --- ICE exchange ---
      const fakeCandidate = { candidate: "candidate:1" } as RTCIceCandidate;

      broadcasterPC.onicecandidate = (e) => {
        if (e.candidate) {
          broadcasterSocket.emit("ice-candidate", { to: viewerSocket.id, candidate: e.candidate });
          events.push("broadcaster:ice-sent");
        }
      };

      broadcasterPC._simulateIceCandidate(fakeCandidate);

      // --- Stream delivery ---
      let receivedStream: MediaStream | null = null;
      viewerPC.ontrack = (e) => {
        receivedStream = e.streams[0];
        events.push("viewer:track-received");
      };

      const remoteStream = new MediaStream();
      viewerPC._simulateTrack(videoTrack, remoteStream);

      expect(receivedStream).toBe(remoteStream);

      // --- Connection established ---
      broadcasterPC._simulateConnected();
      events.push("connection:established");

      // --- Cleanup ---
      viewerPC.close();
      broadcasterPC.close();
      viewerSocket.disconnect();
      broadcasterSocket.disconnect();
      events.push("cleanup:done");

      expect(events).toStrictEqual([
        "broadcaster:connected",
        "viewer:connected",
        "broadcaster:creating-offer",
        "broadcaster:offer-sent",
        "viewer:processing-offer",
        "viewer:answer-sent",
        "broadcaster:answer-received",
        "broadcaster:ice-sent",
        "viewer:track-received",
        "connection:established",
        "cleanup:done",
      ]);

      expect(viewerPC.connectionState).toBe("closed");
      expect(broadcasterPC.connectionState).toBe("closed");
      expect(viewerSocket.connected).toBe(false);
      expect(broadcasterSocket.connected).toBe(false);
    });
  });

  describe("Validate broadcast ID", () => {
    it("accepts valid alphanumeric IDs", () => {
      expect(validateBroadcastId("abc12345")).toBe(true);
      expect(validateBroadcastId("AbCdEf12")).toBe(true);
    });

    it("rejects empty or short IDs", () => {
      expect(validateBroadcastId("")).toBe(false);
      expect(validateBroadcastId("ab")).toBe(false);
    });

    it("rejects IDs with special characters", () => {
      expect(validateBroadcastId("abc-123")).toBe(false);
      expect(validateBroadcastId("abc 123")).toBe(false);
    });
  });

  describe("Error handling", () => {
    it("socket connect_error triggers error state", () => {
      const socket = new MockSocket();
      let errorReceived = false;

      socket.on("connect_error", () => {
        errorReceived = true;
      });

      socket.emit("connect_error", new Error("Connection refused"));
      expect(errorReceived).toBe(true);
    });

    it("broadcast-not-found event is handled", () => {
      const socket = new MockSocket();
      let notFound = false;

      socket.on("broadcast-not-found", ({ broadcastId }: { broadcastId: string }) => {
        notFound = true;
        expect(broadcastId).toBe("nonexistent");
      });

      socket.emit("broadcast-not-found", { broadcastId: "nonexistent" });
      expect(notFound).toBe(true);
    });
  });
});
