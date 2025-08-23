import type { Level } from "./types";

import bgUrl from "../assets/background/desert.png?url";
import musicUrl from "../assets/music/level_1.mp3?url";

const level14: Level = {
  id: "level-14",
  name: "Level 14",
  shortName: "14",
  background: bgUrl,
  color: "#FF4500",
  totalLines: 10,
  startingLines: 5,
  targetLines: 10,
  raiseRate: 0.3,
  music: musicUrl,
};

export default level14;
