import type { Level } from "./types";

import bgUrl from "../assets/background/desert.png?url";
import musicUrl from "../assets/music/level_1.mp3?url";

const level6: Level = {
  id: "level-6",
  name: "Level 6",
  shortName: "6",
  background: bgUrl,
  color: "#FFD700",
  totalLines: 10,
  startingLines: 5,
  targetLines: 10,
  raiseRate: 0.3,
  music: musicUrl,
};

export default level6;
