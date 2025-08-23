import type { Level } from "./types";

import bgUrl from "../assets/background/desert.png?url";
import musicUrl from "../assets/music/level_1.mp3?url";

const level16: Level = {
  id: "level-16",
  name: "Level 16",
  shortName: "16",
  background: bgUrl,
  color: "#ADFF2F",
  totalLines: 10,
  startingLines: 5,
  targetLines: 10,
  raiseRate: 0.3,
  music: musicUrl,
};

export default level16;
