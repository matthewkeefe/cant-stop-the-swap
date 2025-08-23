import type { Level } from "./types";

import bgUrl from "../assets/background/desert.png?url";
import musicUrl from "../assets/music/level_1.mp3?url";

const level20: Level = {
  id: "level-20",
  name: "Level 20",
  shortName: "20",
  background: bgUrl,
  color: "#FF1493",
  totalLines: 10,
  startingLines: 5,
  targetLines: 10,
  raiseRate: 0.3,
  music: musicUrl,
};

export default level20;
