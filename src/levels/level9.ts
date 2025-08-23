import type { Level } from "./types";

import bgUrl from "../assets/background/desert.png?url";
import musicUrl from "../assets/music/level_1.mp3?url";

const level9: Level = {
  id: "level-9",
  name: "Level 9",
  shortName: "9",
  background: bgUrl,
  color: "#FF69B4",
  totalLines: 10,
  startingLines: 5,
  targetLines: 10,
  raiseRate: 0.3,
  music: musicUrl,
};

export default level9;
