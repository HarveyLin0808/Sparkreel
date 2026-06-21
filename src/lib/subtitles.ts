function assTime(value: string) {
  const match = value.trim().match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
  if (!match) throw new Error(`无效字幕时间：${value}`);
  const [, hours, minutes, seconds, millis] = match;
  return `${Number(hours)}:${minutes}:${seconds}.${String(Math.round(Number(millis) / 10)).padStart(2, "0")}`;
}

function escapeAssText(value: string) {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}");
  return escaped
    .split(/\r?\n/)
    .flatMap((line) => {
      const characters = [...line];
      const chunks: string[] = [];
      for (let index = 0; index < characters.length; index += 18) {
        chunks.push(characters.slice(index, index + 18).join(""));
      }
      return chunks.length ? chunks : [""];
    })
    .join("\\N");
}

export function edgeSrtToAss(srt: string) {
  const dialogues = srt
    .trim()
    .split(/\r?\n\r?\n+/)
    .map((block) => block.split(/\r?\n/))
    .filter((lines) => lines.length >= 3 && lines[1].includes("-->"))
    .map((lines) => {
      const [start, end] = lines[1].split("-->").map((value) => assTime(value));
      const text = escapeAssText(lines.slice(2).join("\n").trim());
      return `Dialogue: 0,${start},${end},Default,,0,0,0,,${text}`;
    })
    .join("\n");

  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
; Alignment=2 places text at bottom center. MarginV=150 keeps it above platform controls.
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Microsoft YaHei,60,&H00FFFFFF,&H000000FF,&H90000000,&H90000000,-1,0,0,0,100,100,0,0,3,2,0,2,70,70,150,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${dialogues}
`;
}
