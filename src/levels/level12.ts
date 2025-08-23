import type { Level } from "./types";

import bgUrl from "../assets/background/desert.png?url";
import musicUrl from "../assets/music/level_1.mp3?url";

const level12: Level = {
  id: "level-12",
  name: "Level 12",
  shortName: "12",
  background: bgUrl,
  color: "#FFD700",
  totalLines: 10,
  startingLines: 5,
  targetLines: 10,
  raiseRate: 0.3,
  music: musicUrl,
};

export default level12;
