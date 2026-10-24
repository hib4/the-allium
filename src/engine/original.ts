import { Choreography, type RenderOptions } from "./choreography";
import type { MusicSource } from "./source";
import type { SessionState } from "./types";

/** The Home page's shapes, conducted by measured mix features only. */
export class OriginalChoreography {
  private geometry = new Choreography();
  private last = -1;
  constructor(private source?: MusicSource) {}
  get metrics() {
    return this.geometry.metrics;
  }
  update(
    time: number,
    state: SessionState,
    width: number,
    height: number,
    options: RenderOptions = {},
    quality = 1,
  ) {
    const from =
      this.last < 0 || time < this.last || time - this.last > 1000
        ? time
        : this.last;
    const input = this.source?.mixed?.(time, from) ?? null;
    this.last = time;
    return this.geometry.updateMeasured(
      time,
      state,
      width,
      height,
      options,
      quality,
      input,
    );
  }
}
