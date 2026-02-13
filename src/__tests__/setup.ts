// Polyfill MediaStream for jsdom (not available in jsdom by default)
class FakeMediaStream {
  id: string;
  active = true;
  private _tracks: MediaStreamTrack[] = [];

  constructor(tracks?: MediaStreamTrack[]) {
    this.id = `stream-${Math.random().toString(36).slice(2, 8)}`;
    if (tracks) this._tracks = tracks;
  }

  getTracks() {
    return [...this._tracks];
  }
  getVideoTracks() {
    return this._tracks.filter((t) => t.kind === "video");
  }
  getAudioTracks() {
    return this._tracks.filter((t) => t.kind === "audio");
  }
  addTrack(track: MediaStreamTrack) {
    this._tracks.push(track);
  }
  removeTrack(track: MediaStreamTrack) {
    this._tracks = this._tracks.filter((t) => t !== track);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).MediaStream = FakeMediaStream;
