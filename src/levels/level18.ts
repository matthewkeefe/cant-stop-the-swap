import type { Level } from "./types";

import bgUrl from "../assets/background/desert.png?url";
import musicUrl from "../assets/music/level_1.mp3?url";

const level18: Level = {
  id: "level-18",
  name: "Level 18",
  shortName: "18",
  background: bgUrl,
  color: "#DC143C",
  totalLines: 10,
  startingLines: 5,
  targetLines: 10,
  raiseRate: 0.3,
  music: musicUrl,
};

export default level18;
