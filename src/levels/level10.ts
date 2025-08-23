import type { Level } from "./types";

import bgUrl from "../assets/background/desert.png?url";
import musicUrl from "../assets/music/level_1.mp3?url";

const level10: Level = {
  id: "level-10",
  name: "Level 10",
  shortName: "10",
  background: bgUrl,
  color: "#00FF7F",
  totalLines: 10,
  startingLines: 5,
  targetLines: 10,
  raiseRate: 0.3,
  music: musicUrl,
};

export default level10;
