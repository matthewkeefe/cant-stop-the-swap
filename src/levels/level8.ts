import type { Level } from "./types";

import bgUrl from "../assets/background/desert.png?url";
import musicUrl from "../assets/music/level_1.mp3?url";

const level8: Level = {
  id: "level-8",
  name: "Level 8",
  shortName: "8",
  background: bgUrl,
  color: "#FF00FF",
  totalLines: 10,
  startingLines: 5,
  targetLines: 10,
  raiseRate: 0.3,
  music: musicUrl,
};

export default level8;
