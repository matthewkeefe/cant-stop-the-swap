import type { Level } from "./types";

import bgUrl from "../assets/background/desert.png?url";
import musicUrl from "../assets/music/level_1.mp3?url";

const level15: Level = {
  id: "level-15",
  name: "Level 15",
  shortName: "15",
  background: bgUrl,
  color: "#39FF14",
  totalLines: 10,
  startingLines: 5,
  targetLines: 10,
  raiseRate: 0.3,
  music: musicUrl,
};

export default level15;
