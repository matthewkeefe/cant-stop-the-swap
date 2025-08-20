import type { Level } from "./types";
import bgUrl from "../assets/background/fantasy-forest.png?url";
import musicUrl from "../assets/music/level_1.mp3?url";

const level1: Level = {
  id: "level-1",
  name: "Level 1",
  // background should be a plain URL string; App wraps it with `url(...)` when
  // applying the CSS background-image, so pass the raw asset URL here.
  background: bgUrl,
  totalLines: 5,
  startingLines: 5,
  targetLines: 5,
  raiseRate: 0.1,
  music: musicUrl,
};

export default level1;
