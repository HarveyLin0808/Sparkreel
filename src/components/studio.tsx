"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { MaterialPreference, Project, ProjectStatus, Scene, VisualStyle } from "@/lib/types";
import { nextProjectStatus } from "@/lib/workflow";
import { RENDER_STAGES, renderStageIndex, type RenderStageKey } from "@/lib/render-stages";
import { CURATED_SOURCES } from "@/lib/curated-audio";
import type { JamendoTrack } from "@/lib/jamendo";
import type { FreesoundClip } from "@/lib/freesound";

type RenderState = { progress: number; stage?: RenderStageKey };

const statusLabels: Record<ProjectStatus, string> = {
  DRAFT: "草稿",
  SCRIPT_CONFIRMED: "脚本确认",
  STORYBOARD_CONFIRMED: "分镜确认",
  WAITING_ASSETS: "等待素材",
  READY_TO_RENDER: "可渲染",
  RENDERING: "渲染中",
  REVIEW: "待审核",
  EXPORTED: "已导出",
};

const styleLabels: Record<VisualStyle, string> = {
  CARTOON: "卡通动画",
  COMIC: "漫画分镜",
  ASIAN_REALISTIC: "亚洲面庞",
};

type VoiceOption = { id: string; label: string };

async function jsonRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "请求失败");
  return data;
}

export function Studio() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [active, setActive] = useState<Project | null>(null);
  const [tab, setTab] = useState<"script" | "storyboard" | "publish">("script");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [input, setInput] = useState("为什么越懂事的人，越容易在深夜感到委屈？");
  const [audience, setAudience] = useState("25-35 岁职场人");
  const [tone, setTone] = useState("克制、温暖、有力量");
  const [avoid, setAvoid] = useState("说教、贩卖焦虑、夸张承诺");
  const [visualStyle, setVisualStyle] = useState<VisualStyle>("ASIAN_REALISTIC");
  const [provider, setProvider] = useState("deepseek");
  const [duration, setDuration] = useState(90);
  const [materialPreference, setMaterialPreference] = useState<MaterialPreference>("CHINESE");
  const [voiceName, setVoiceName] = useState("zh-CN-XiaoyiNeural");
  const [voiceRate, setVoiceRate] = useState("-5%");
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [renderState, setRenderState] = useState<RenderState | null>(null);
  const pollStopRef = useRef<(() => void) | null>(null);
  const [musicQuery, setMusicQuery] = useState("calm emotional piano");
  const [musicResults, setMusicResults] = useState<JamendoTrack[]>([]);
  const [sfxQuery, setSfxQuery] = useState("");
  const [sfxResults, setSfxResults] = useState<FreesoundClip[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function playAudio(url: string) {
    audioRef.current?.pause();
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.play().catch(() => setNotice("无法播放该音频"));
  }

  // 生成期间轮询项目进度，驱动步骤与进度条显示。
  function startProgressPolling(projectId: string, initial?: RenderState) {
    pollStopRef.current?.();
    if (initial) setRenderState(initial);
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const data = await jsonRequest<{ project: Project }>(`/api/projects/${projectId}`);
        if (stopped) return;
        setRenderState({ progress: data.project.renderProgress ?? 0, stage: data.project.renderStage });
      } catch {
        /* 轮询失败忽略，等待主请求返回 */
      }
    };
    const timer = setInterval(tick, 1500);
    void tick();
    const stop = () => {
      stopped = true;
      clearInterval(timer);
    };
    pollStopRef.current = stop;
    return stop;
  }

  function stopProgressPolling() {
    pollStopRef.current?.();
    pollStopRef.current = null;
    setRenderState(null);
  }

  useEffect(() => () => pollStopRef.current?.(), []);

  useEffect(() => {
    jsonRequest<{ projects: Project[] }>("/api/projects")
      .then((data) => {
        setProjects(data.projects);
        setActive(data.projects[0] ?? null);
      })
      .catch((error) => setNotice(error.message));
    jsonRequest<{ voices: VoiceOption[] }>("/api/voices")
      .then((data) => setVoices(data.voices))
      .catch(() => undefined);
  }, []);

  const completedAssets = useMemo(
    () => active?.scenes.filter((scene) => scene.assetUrl).length ?? 0,
    [active],
  );

  function syncProject(project: Project) {
    setActive(project);
    setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
  }

  async function createProject(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice("正在生成内容角度、脚本与分镜...");
    try {
      const data = await jsonRequest<{ project: Project }>("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, audience, tone, avoid, duration, visualStyle, provider, voiceName, voiceRate, materialPreference }),
      });
      syncProject(data.project);
      setNotice("脚本已生成，正在自动准备素材、配音和视频...");
      startProgressPolling(data.project.id, { progress: 5, stage: "QUEUED" });
      const completed = await jsonRequest<{ project: Project; message: string }>(`/api/projects/${data.project.id}/auto`, {
        method: "POST",
      });
      syncProject(completed.project);
      setTab("publish");
      setNotice(completed.message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "生成失败");
    } finally {
      stopProgressPolling();
      setBusy(false);
    }
  }

  async function generateCompleteVideo(project = active) {
    if (!project) return;
    setBusy(true);
    setNotice("正在自动搜索素材、生成旁白、字幕并合成视频...");
    startProgressPolling(project.id, { progress: project.renderProgress ?? 5, stage: "QUEUED" });
    try {
      const data = await jsonRequest<{ project: Project; message: string }>(`/api/projects/${project.id}/auto`, {
        method: "POST",
      });
      syncProject(data.project);
      setTab("publish");
      setNotice(data.message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "一键生成失败");
      const refreshed = await jsonRequest<{ project: Project }>(`/api/projects/${project.id}`).catch(() => null);
      if (refreshed) syncProject(refreshed.project);
    } finally {
      stopProgressPolling();
      setBusy(false);
    }
  }

  async function patchProject(payload: Record<string, unknown>) {
    if (!active) return;
    const data = await jsonRequest<{ project: Project }>(`/api/projects/${active.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    syncProject(data.project);
  }

  async function selectAngle(angleId: string) {
    if (!active || active.selectedAngleId === angleId || busy) return;
    const angle = active.angles.find((item) => item.id === angleId);
    if (!angle) return;
    setBusy(true);
    setActive({ ...active, selectedAngleId: angleId });
    setNotice(`正在按“${angle.title}”重新生成脚本和分镜...`);
    try {
      const data = await jsonRequest<{ project: Project; message: string }>(
        `/api/projects/${active.id}/angle`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ angleId }),
        },
      );
      syncProject(data.project);
      setNotice(data.message);
    } catch (error) {
      setActive(active);
      setNotice(error instanceof Error ? error.message : "切换内容角度失败");
    } finally {
      setBusy(false);
    }
  }

  async function advance() {
    if (!active) return;
    const next = nextProjectStatus(active.status);
    if (!next || next === "RENDERING") return;
    try {
      await patchProject({ status: next });
      if (next === "STORYBOARD_CONFIRMED" || next === "WAITING_ASSETS") setTab("storyboard");
      if (next === "EXPORTED") setTab("publish");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "状态更新失败");
    }
  }

  async function updateScene(scene: Scene, payload: Partial<Scene>) {
    if (!active) return;
    try {
      const data = await jsonRequest<{ project: Project }>(`/api/projects/${active.id}/scenes/${scene.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      syncProject(data.project);
      setNotice(`分镜 ${scene.order} 已保存`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存失败");
    }
  }

  async function addScene(afterOrder?: number) {
    if (!active) return;
    setBusy(true);
    try {
      const data = await jsonRequest<{ project: Project }>(`/api/projects/${active.id}/scenes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ afterOrder: afterOrder ?? active.scenes.length }),
      });
      syncProject(data.project);
      setNotice("已新增一个镜头，可继续编辑旁白和画面提示词");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "新增镜头失败");
    } finally {
      setBusy(false);
    }
  }

  async function deleteScene(scene: Scene) {
    if (!active) return;
    if (!confirm(`确认删除镜头 ${scene.order}？历史成片会保留，但当前视频需要重新生成。`)) return;
    setBusy(true);
    try {
      const data = await jsonRequest<{ project: Project }>(`/api/projects/${active.id}/scenes/${scene.id}`, {
        method: "DELETE",
      });
      syncProject(data.project);
      setNotice(`镜头 ${scene.order} 已删除`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "删除镜头失败");
    } finally {
      setBusy(false);
    }
  }

  async function upload(scene: Scene, file?: File) {
    if (!active || !file) return;
    setNotice(`正在上传分镜 ${scene.order}...`);
    const form = new FormData();
    form.append("file", file);
    try {
      const data = await jsonRequest<{ project: Project }>(`/api/projects/${active.id}/scenes/${scene.id}/upload?order=${scene.order}`, {
        method: "POST",
        body: form,
      });
      syncProject(data.project);
      setNotice(`分镜 ${scene.order} 素材已上传`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "上传失败");
    }
  }

  async function fetchPexelsAsset(scene: Scene) {
    if (!active) return;
    setBusy(true);
    setNotice(`正在为镜头 ${scene.order} 搜索 Pexels 竖屏视频...`);
    try {
      const data = await jsonRequest<{ project: Project; query: string }>(
        `/api/projects/${active.id}/scenes/${scene.id}/pexels`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      );
      syncProject(data.project);
      setNotice(`镜头 ${scene.order} 已使用 Pexels 动态素材`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Pexels 素材搜索失败");
    } finally {
      setBusy(false);
    }
  }

  async function fetchPixabayAsset(scene: Scene, kind: "video" | "illustration" | "photo") {
    if (!active) return;
    const label = kind === "video" ? "视频" : kind === "illustration" ? "插画" : "图片";
    setBusy(true);
    setNotice(`正在为镜头 ${scene.order} 搜索 Pixabay ${label}...`);
    try {
      const data = await jsonRequest<{ project: Project }>(
        `/api/projects/${active.id}/scenes/${scene.id}/pixabay`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) },
      );
      syncProject(data.project);
      setNotice(`镜头 ${scene.order} 已使用 Pixabay ${label}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Pixabay 素材搜索失败");
    } finally {
      setBusy(false);
    }
  }

  async function searchMusic() {
    setNotice("正在搜索 Jamendo 配乐...");
    try {
      const data = await jsonRequest<{ tracks: JamendoTrack[] }>(
        `/api/projects/${active?.id ?? "x"}/music?q=${encodeURIComponent(musicQuery)}`,
      );
      setMusicResults(data.tracks);
      setNotice(data.tracks.length ? `找到 ${data.tracks.length} 首配乐，试听后选用` : "没有找到匹配的配乐，换个关键词试试");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Jamendo 搜索失败");
    }
  }

  async function applyMusicTrack(track: JamendoTrack) {
    if (!active) return;
    setBusy(true);
    setNotice(`正在加入配乐《${track.name}》...`);
    try {
      const data = await jsonRequest<{ project: Project }>(`/api/projects/${active.id}/music`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: track.id, audioUrl: track.audioUrl, name: `${track.name} · ${track.artistName}`, sourceUrl: track.shareUrl }),
      });
      syncProject(data.project);
      setNotice("背景音乐已设置，重新生成视频即可合成进去");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "设置配乐失败");
    } finally {
      setBusy(false);
    }
  }

  async function uploadMusic(file?: File) {
    if (!active || !file) return;
    setBusy(true);
    setNotice("正在上传背景音乐...");
    const form = new FormData();
    form.append("file", file);
    try {
      const data = await jsonRequest<{ project: Project }>(`/api/projects/${active.id}/music`, { method: "POST", body: form });
      syncProject(data.project);
      setNotice("背景音乐已上传，重新生成视频即可合成进去");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "上传配乐失败");
    } finally {
      setBusy(false);
    }
  }

  async function clearMusic() {
    if (!active) return;
    try {
      const data = await jsonRequest<{ project: Project }>(`/api/projects/${active.id}/music`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear: true }),
      });
      syncProject(data.project);
      setNotice("已移除背景音乐");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "移除配乐失败");
    }
  }

  async function changeMusicVolume(volume: number) {
    if (!active) return;
    setActive({ ...active, musicVolume: volume });
    try {
      await jsonRequest<{ project: Project }>(`/api/projects/${active.id}/music`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ volume }),
      });
    } catch {
      /* 音量保存失败忽略，下次设置时再同步 */
    }
  }

  async function searchSfx() {
    if (!sfxQuery.trim()) return;
    setNotice("正在搜索 Freesound 音效...");
    try {
      const data = await jsonRequest<{ clips: FreesoundClip[] }>(`/api/audio/sfx?q=${encodeURIComponent(sfxQuery)}`);
      setSfxResults(data.clips);
      setNotice(data.clips.length ? `找到 ${data.clips.length} 个音效，试听后下载` : "没有找到匹配的音效");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Freesound 搜索失败");
    }
  }

  async function previewVoice(selectedVoice = active?.voiceName ?? voiceName, selectedRate = active?.voiceRate ?? voiceRate) {
    setNotice("正在生成声音试听...");
    try {
      const response = await fetch("/api/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceName: selectedVoice, voiceRate: selectedRate }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "试听失败");
      const url = URL.createObjectURL(await response.blob());
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
      setNotice("正在试听所选声音");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "试听失败");
    }
  }

  async function render() {
    if (!active) return;
    setBusy(true);
    startProgressPolling(active.id, { progress: 15, stage: "QUEUED" });
    try {
      const data = await jsonRequest<{ project: Project; message: string }>(`/api/projects/${active.id}/render`, { method: "POST" });
      syncProject(data.project);
      setTab("publish");
      setNotice(data.message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "渲染失败");
    } finally {
      stopProgressPolling();
      setBusy(false);
    }
  }

  async function downloadPackage() {
    if (!active) return;
    const data = await jsonRequest<{ package: unknown }>(`/api/projects/${active.id}/export`);
    const blob = new Blob([JSON.stringify(data.package, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${active.title}-发布包.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    if (active.status === "REVIEW") await patchProject({ status: "EXPORTED" });
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">S</div>
          <div><strong>Sparkreel</strong><span>共鸣视频创作台</span></div>
        </div>
        <button className="new-project" onClick={() => setActive(null)}>＋ 新建创作</button>
        <div className="project-list">
          <p className="section-label">最近项目</p>
          {projects.map((project) => (
            <button key={project.id} className={`project-item ${active?.id === project.id ? "active" : ""}`} onClick={() => setActive(project)}>
              <span className="project-thumb">{styleLabels[project.visualStyle].slice(0, 1)}</span>
              <span><strong>{project.title}</strong><small>{statusLabels[project.status]} · {project.duration}s</small></span>
            </button>
          ))}
          {!projects.length && <p className="empty-small">还没有项目，先把脑海里的话题放进来。</p>}
        </div>
        <div className="sidebar-foot">
          <span className="status-dot" /> 私有工作区
          <button onClick={() => fetch("/api/auth/logout", { method: "POST" }).then(() => location.assign("/login"))}>退出</button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">AI SHORT VIDEO STUDIO</p>
            <h1>{active ? active.title : "把一个念头，变成一条有共鸣的视频"}</h1>
          </div>
          {active && (
            <div className="status-pill"><span />{statusLabels[active.status]}</div>
          )}
        </header>

        {renderState && <RenderProgress state={renderState} />}

        {!active ? (
          <section className="create-grid">
            <form className="creator-card" onSubmit={createProject}>
              <div className="card-heading">
                <div><p className="eyebrow">01 / IDEA</p><h2>今天想说什么？</h2></div>
                <span className="duration-badge">约 {duration} 秒</span>
              </div>
              <textarea value={input} onChange={(event) => setInput(event.target.value)} maxLength={12000} placeholder="输入一个话题，或者粘贴一段你想表达的话..." />
              <div className="form-row">
                <label>目标受众<input value={audience} onChange={(event) => setAudience(event.target.value)} /></label>
                <label>情绪基调<input value={tone} onChange={(event) => setTone(event.target.value)} /></label>
              </div>
              <label>表达禁区<input value={avoid} onChange={(event) => setAvoid(event.target.value)} /></label>
              <div className="duration-picker">
                <span>视频时长</span>
                <div>
                  {[30, 60, 90].map((seconds) => (
                    <button
                      type="button"
                      key={seconds}
                      className={duration === seconds ? "selected" : ""}
                      onClick={() => setDuration(seconds)}
                    >
                      {seconds} 秒
                    </button>
                  ))}
                </div>
              </div>
              <div className="material-picker">
                <span>素材人物与地域</span>
                <div>
                  {([
                    ["CHINESE", "🇨🇳 中国风 / 亚洲面孔"],
                    ["GLOBAL", "国际通用"],
                    ["SCENERY", "无人景物"],
                  ] as [MaterialPreference, string][]).map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      className={materialPreference === value ? "selected" : ""}
                      onClick={() => setMaterialPreference(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <small>
                  {materialPreference === "CHINESE"
                    ? "优先检索 chinese woman / chinese man / chinese portrait / china street / beijing street / shanghai street"
                    : materialPreference === "SCENERY" ? "优先环境、物品和无正脸镜头" : "不限定人物地域"}
                </small>
              </div>
              <div className="voice-picker">
                <label>旁白声音
                  <select value={voiceName} onChange={(event) => setVoiceName(event.target.value)}>
                    {voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.label}</option>)}
                  </select>
                </label>
                <label>语速
                  <select value={voiceRate} onChange={(event) => setVoiceRate(event.target.value)}>
                    <option value="-15%">舒缓</option>
                    <option value="-5%">自然偏慢</option>
                    <option value="+0%">自然</option>
                    <option value="+10%">明快</option>
                  </select>
                </label>
                <button type="button" className="secondary" onClick={() => previewVoice()}>试听</button>
              </div>
              <div className="style-picker">
                <span>视觉方向</span>
                <div>{(Object.keys(styleLabels) as VisualStyle[]).map((style) => (
                  <button type="button" key={style} className={visualStyle === style ? "selected" : ""} onClick={() => setVisualStyle(style)}>
                    <i className={`style-preview ${style.toLowerCase()}`} />{styleLabels[style]}
                  </button>
                ))}</div>
              </div>
              <div className="form-footer">
                <select value={provider} onChange={(event) => setProvider(event.target.value)}>
                  <option value="deepseek">DeepSeek {process.env.NEXT_PUBLIC_DEEPSEEK_ENABLED === "true" ? "" : "· 演示模式"}</option>
                  <option value="openai" disabled>OpenAI · 需 API Key</option>
                  <option value="anthropic" disabled>Claude · 需 API Key</option>
                </select>
                <button className="primary" disabled={busy}>{busy ? "正在生成完整视频..." : "一键生成完整视频 →"}</button>
              </div>
            </form>
            <aside className="inspiration-card">
              <p className="eyebrow">创作提示</p>
              <h3>共鸣来自具体，<br />不是来自更大的声音。</h3>
              <div className="quote">“不要写孤独。写凌晨两点，聊天框里删掉又重写的那句话。”</div>
              <ul>
                <li><span>1</span>用一个真实场景开场</li>
                <li><span>2</span>说出观众没说出口的话</li>
                <li><span>3</span>给情绪一个温柔的出口</li>
              </ul>
            </aside>
          </section>
        ) : (
          <>
            <nav className="tabs">
              <button className={tab === "script" ? "active" : ""} onClick={() => setTab("script")}>脚本与角度</button>
              <button className={tab === "storyboard" ? "active" : ""} onClick={() => setTab("storyboard")}>分镜与素材 <span>{completedAssets}/{active.scenes.length}</span></button>
              <button className={tab === "publish" ? "active" : ""} onClick={() => setTab("publish")}>审核与发布</button>
            </nav>

            {tab === "script" && (
              <div className="content-grid">
                <section className="panel">
                  <p className="section-label">内容角度</p>
                  <div className="angle-grid">{active.angles.map((angle, index) => (
                    <button
                      type="button"
                      className={`angle-card ${active.selectedAngleId === angle.id ? "selected" : ""}`}
                      key={angle.id}
                      onClick={() => selectAngle(angle.id)}
                      disabled={busy}
                      aria-pressed={active.selectedAngleId === angle.id}
                    >
                      <small>角度 0{index + 1}</small><h3>{angle.title}</h3><p>{angle.hook}</p><span>{angle.coreMessage}</span>
                      {active.selectedAngleId === angle.id && <b>当前角度</b>}
                    </button>
                  ))}</div>
                  <div className="script-head"><p className="section-label">口播脚本</p><button onClick={() => previewVoice()}>▷ 试听旁白</button></div>
                  <textarea className="script-editor" value={active.script} onChange={(event) => setActive({ ...active, script: event.target.value })} onBlur={() => patchProject({ script: active.script })} />
                </section>
                <aside className="panel insight-panel">
                  <p className="section-label">结构诊断</p>
                  <div className="score-ring"><strong>86</strong><span>共鸣潜力</span></div>
                  <div className="metric"><span>开场钩子</span><b>清晰</b></div>
                  <div className="metric"><span>情绪递进</span><b>自然</b></div>
                  <div className="metric"><span>行动出口</span><b>温和</b></div>
                  <p className="advice">建议：朗读时在转折句前留出 0.5 秒停顿，让观众有时间把故事代入自己。</p>
                  <div className="project-voice">
                    <label htmlFor="project-voice-name">旁白声音</label>
                    <div className="project-voice-control">
                      <select id="project-voice-name" value={active.voiceName ?? "zh-CN-XiaoyiNeural"} onChange={(event) => patchProject({ voiceName: event.target.value })}>
                        {voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.label}</option>)}
                      </select>
                      <button type="button" className="secondary voice-preview-button" onClick={() => previewVoice(active.voiceName, active.voiceRate)}>
                        ▷ 试听音色
                      </button>
                    </div>
                  </div>
                  <label className="project-voice">语速
                    <select value={active.voiceRate ?? "-5%"} onChange={(event) => patchProject({ voiceRate: event.target.value })}>
                      <option value="-15%">舒缓</option><option value="-5%">自然偏慢</option><option value="+0%">自然</option><option value="+10%">明快</option>
                    </select>
                  </label>
                  <label className="project-voice">素材人物与地域
                    <select value={active.materialPreference ?? "CHINESE"} onChange={(event) => patchProject({ materialPreference: event.target.value })}>
                      <option value="CHINESE">🇨🇳 中国风 / 亚洲面孔</option>
                      <option value="GLOBAL">国际通用</option>
                      <option value="SCENERY">无人景物</option>
                    </select>
                  </label>
                  {active.status === "DRAFT" && <button className="primary wide" onClick={advance}>确认脚本，进入分镜</button>}
                  {active.status === "SCRIPT_CONFIRMED" && <button className="primary wide" onClick={advance}>确认分镜方案</button>}
                </aside>
              </div>
            )}

            {tab === "storyboard" && (
              <section className="storyboard">
                <div className="storyboard-head">
                  <div><p className="section-label">VISUAL STORYBOARD</p><h2>{active.scenes.length} 个镜头 · {active.duration} 秒</h2></div>
                  <div className="asset-progress"><span style={{ width: `${completedAssets / active.scenes.length * 100}%` }} /><small>{completedAssets} 个素材已就绪</small></div>
                </div>
                  <div className="scene-list">{active.scenes.map((scene) => (
                  <SceneCard key={`${scene.id}-${scene.order}-${scene.duration}-${scene.narration}-${scene.prompt}`} scene={scene} onSave={updateScene} onUpload={upload} onPexels={fetchPexelsAsset} onPixabay={fetchPixabayAsset} onDelete={deleteScene} onAddAfter={addScene} onNotice={setNotice} />
                ))}</div>
                <div className="sticky-action">
                  <span>{completedAssets === active.scenes.length ? "全部镜头素材已经就绪" : `还需上传 ${active.scenes.length - completedAssets} 个镜头素材`}</span>
                  <button className="secondary" onClick={() => addScene()} disabled={busy}>＋ 新增镜头</button>
                  <button className="primary" onClick={() => generateCompleteVideo()} disabled={busy}>
                    {busy ? "完整视频生成中..." : "一键补齐素材并生成视频"}
                  </button>
                  {active.status === "STORYBOARD_CONFIRMED" && <button className="secondary" onClick={advance}>开始准备素材</button>}
                  {active.status === "WAITING_ASSETS" && completedAssets === active.scenes.length && <button className="primary" onClick={advance}>确认素材，准备渲染</button>}
                  {active.status === "READY_TO_RENDER" && <button className="primary" onClick={render} disabled={busy}>{busy ? "合成中..." : "生成审核预览"}</button>}
                </div>
              </section>
            )}

            {tab === "publish" && (
              <>
              <div className="publish-grid">
                <section className="phone-panel">
                  <div className="phone">
                    <div className="phone-stage">
                      {active.outputUrl
                        ? <video src={active.outputUrl} controls playsInline />
                        : active.scenes[0]?.assetUrl
                          ? <img src={active.scenes[0].assetUrl} alt="" />
                          : <div className="preview-placeholder"><span>9:16</span><p>上传素材后在这里预览</p></div>}
                      {!active.outputUrl && <div className="caption-preview">{active.scenes[0]?.subtitle}</div>}
                    </div>
                  </div>
                  <div className="render-info"><span>1080 × 1920</span><span>{active.outputDuration ?? active.duration} 秒</span><span>动态字幕</span></div>
                  {active.status === "READY_TO_RENDER" && <button className="primary wide" onClick={render}>生成审核预览</button>}
                  {active.outputUrl && (
                    <>
                      <a
                        className="primary wide download-link"
                        href={active.outputUrl}
                        download={active.renderOutputs?.at(-1)?.fileName ?? `${active.title}-1.mp4`}
                      >
                        下载当前 MP4 成片
                      </a>
                      <button className="secondary wide rerender-button" onClick={render} disabled={busy}>
                        {busy ? "重新生成中..." : "重新生成视频（保留旧版本）"}
                      </button>
                    </>
                  )}
                  {!!active.renderOutputs?.length && (
                    <div className="render-history">
                      <strong>历史成片</strong>
                      {[...active.renderOutputs].reverse().map((output) => (
                        <a key={`${output.version}-${output.url}`} href={output.url} download={output.fileName}>
                          <span>第 {output.version} 版 · {output.duration} 秒</span>
                          <small>{new Date(output.createdAt).toLocaleString("zh-CN")}</small>
                        </a>
                      ))}
                    </div>
                  )}
                </section>
                <section className="panel publish-panel">
                  <p className="section-label">平台发布文案</p>
                  {active.platformCopies.map((copy) => (
                    <article className="platform-copy" key={copy.platform}>
                      <header><strong>{copy.platform === "DOUYIN" ? "抖音" : copy.platform === "XIAOHONGSHU" ? "小红书" : "视频号"}</strong><button onClick={() => navigator.clipboard.writeText(`${copy.title}\n${copy.body}\n${copy.tags.map((tag) => `#${tag}`).join(" ")}`)}>复制</button></header>
                      <h3>{copy.title}</h3><p>{copy.body}</p><div>{copy.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
                    </article>
                  ))}
                  <button className="primary wide" onClick={downloadPackage}>下载发布包</button>
                  <p className="export-note">发布包包含平台文案、字幕、封面提示词与渲染清单。正式环境配置 FFmpeg worker 后同时包含 MP4。</p>
                </section>
              </div>

              <section className="audio-studio">
                <div className="audio-block">
                  <p className="section-label">背景音乐（Jamendo · 免费可商用）</p>
                  {active.musicUrl ? (
                    <div className="music-current">
                      <div>
                        <strong>{active.musicName ?? "已设置背景音乐"}</strong>
                        <small>{active.musicProvider === "JAMENDO" ? "Jamendo" : "本地上传"}</small>
                      </div>
                      <div className="music-current-actions">
                        <button type="button" className="secondary" onClick={() => playAudio(active.musicUrl!)}>▷ 试听</button>
                        {active.musicSourceUrl && <a href={active.musicSourceUrl} target="_blank" rel="noreferrer">来源</a>}
                        <button type="button" className="danger-text" onClick={clearMusic}>移除</button>
                      </div>
                    </div>
                  ) : (
                    <p className="empty-small">还没有背景音乐。搜索 Jamendo 或上传一段 BGM，重新生成视频即可混入（说话时自动压低让位人声）。</p>
                  )}
                  <label className="music-volume">
                    音乐音量 {Math.round((active.musicVolume ?? 0.18) * 100)}%
                    <input type="range" min={0} max={60} value={Math.round((active.musicVolume ?? 0.18) * 100)}
                      onChange={(event) => changeMusicVolume(Number(event.target.value) / 100)} />
                  </label>
                  <div className="audio-search">
                    <input value={musicQuery} onChange={(event) => setMusicQuery(event.target.value)}
                      onKeyDown={(event) => event.key === "Enter" && searchMusic()} placeholder="如 calm piano / emotional / cinematic" />
                    <button type="button" className="secondary" onClick={searchMusic}>搜索配乐</button>
                    <label className="upload-music secondary">上传 BGM
                      <input type="file" accept="audio/mpeg,audio/wav" onChange={(event) => uploadMusic(event.target.files?.[0])} />
                    </label>
                  </div>
                  {!!musicResults.length && (
                    <ul className="audio-results">
                      {musicResults.map((track) => (
                        <li key={track.id}>
                          <span className="audio-name"><strong>{track.name}</strong><small>{track.artistName} · {Math.round(track.duration)}s</small></span>
                          <button type="button" onClick={() => playAudio(track.audioUrl)}>▷ 试听</button>
                          <button type="button" className="link-button" onClick={() => applyMusicTrack(track)} disabled={busy}>选用</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="audio-block">
                  <p className="section-label">音效（Freesound）</p>
                  <p className="empty-small">音效需要按画面节奏手动放置：试听满意后下载，再到分镜里作为素材上传或在后期使用。</p>
                  <div className="audio-search">
                    <input value={sfxQuery} onChange={(event) => setSfxQuery(event.target.value)}
                      onKeyDown={(event) => event.key === "Enter" && searchSfx()} placeholder="如 whoosh / rain / page turn / notification" />
                    <button type="button" className="secondary" onClick={searchSfx}>搜索音效</button>
                  </div>
                  {!!sfxResults.length && (
                    <ul className="audio-results">
                      {sfxResults.map((clip) => (
                        <li key={clip.id}>
                          <span className="audio-name"><strong>{clip.name}</strong><small>{clip.username} · {Math.round(clip.duration)}s</small></span>
                          <button type="button" onClick={() => playAudio(clip.previewUrl)}>▷ 试听</button>
                          <a className="link-button" href={clip.pageUrl} target="_blank" rel="noreferrer">下载页</a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="audio-block">
                  <p className="section-label">外部素材库（无 API · 手动下载）</p>
                  <ul className="curated-list">
                    {CURATED_SOURCES.map((source) => (
                      <li key={source.url}>
                        <a href={source.url} target="_blank" rel="noreferrer"><strong>{source.name}</strong><span className="curated-kind">{source.kind}</span></a>
                        <small>{source.note}</small>
                        <em>{source.license}</em>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
              </>
            )}
          </>
        )}
        {notice && <div className="toast" onClick={() => setNotice("")}>{notice}</div>}
      </section>
    </main>
  );
}

function RenderProgress({ state }: { state: RenderState }) {
  const finished = state.stage === "DONE" || state.progress >= 100;
  const currentIndex = finished ? RENDER_STAGES.length - 1 : renderStageIndex(state.stage);
  const progress = Math.min(100, Math.max(0, Math.round(state.progress)));
  const currentLabel = RENDER_STAGES[currentIndex]?.label ?? "处理中";
  return (
    <section className="render-panel">
      <div className="render-panel-head">
        <div>
          <p className="eyebrow">VIDEO GENERATION</p>
          <h3>{finished ? "视频生成完成" : "正在生成视频"}</h3>
          <p className="render-current">{finished ? "即将进入审核与发布" : `当前步骤：${currentLabel}`}</p>
        </div>
        <div className="render-percent">{progress}%</div>
      </div>
      <div className="render-bar"><span style={{ width: `${progress}%` }} /></div>
      <ol className="render-steps">
        {RENDER_STAGES.map((stage, index) => {
          const status = finished || index < currentIndex ? "done" : index === currentIndex ? "active" : "pending";
          return (
            <li key={stage.key} className={`render-step ${status}`}>
              <span className="render-step-dot">{status === "done" ? "✓" : index + 1}</span>
              <span className="render-step-text">
                <strong>{stage.label}</strong>
                <small>{stage.hint}</small>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function SceneCard({ scene, onSave, onUpload, onPexels, onPixabay, onDelete, onAddAfter, onNotice }: {
  scene: Scene;
  onSave: (scene: Scene, payload: Partial<Scene>) => void;
  onUpload: (scene: Scene, file?: File) => void;
  onPexels: (scene: Scene) => void;
  onPixabay: (scene: Scene, kind: "video" | "illustration" | "photo") => void;
  onDelete: (scene: Scene) => void;
  onAddAfter: (afterOrder?: number) => void;
  onNotice: (message: string) => void;
}) {
  const [draft, setDraft] = useState(scene);
  return (
    <article className="scene-card">
      <div className="scene-number"><strong>{String(scene.order).padStart(2, "0")}</strong><span>{scene.duration}s</span></div>
      <label className={`asset-drop ${scene.assetUrl ? "has-asset" : ""}`}>
        {scene.assetUrl ? (
          scene.assetKind === "VIDEO" ? <video src={scene.assetUrl} muted /> : <img src={scene.assetUrl} alt={`分镜 ${scene.order}`} />
        ) : <><span>＋</span><strong>上传画面</strong><small>PNG / JPG / MP4</small></>}
        <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={(event) => onUpload(scene, event.target.files?.[0])} />
      </label>
      <div className="scene-copy">
        <label>旁白<textarea value={draft.narration} onChange={(event) => setDraft({ ...draft, narration: event.target.value, subtitle: event.target.value })} onBlur={() => onSave(scene, { narration: draft.narration, subtitle: draft.subtitle })} /></label>
        <label className="prompt-editor">
          <span>画面提示词</span>
          <textarea
            value={draft.prompt}
            onChange={(event) => setDraft({ ...draft, prompt: event.target.value })}
            onBlur={() => onSave(scene, { prompt: draft.prompt })}
          />
        </label>
        <label className="prompt-editor compact">
          <span>负面提示词</span>
          <textarea
            value={draft.negativePrompt}
            onChange={(event) => setDraft({ ...draft, negativePrompt: event.target.value })}
            onBlur={() => onSave(scene, { negativePrompt: draft.negativePrompt })}
          />
        </label>
        <div className="scene-tools">
          <button type="button" onClick={() => navigator.clipboard.writeText(draft.prompt).then(() => onNotice("提示词已复制"))}>复制提示词</button>
          <button type="button" onClick={() => onPexels(scene)}>Pexels 视频</button>
          <button type="button" onClick={() => onPixabay(scene, "video")}>Pixabay 视频</button>
          <button type="button" onClick={() => onPixabay(scene, "illustration")}>Pixabay 插画</button>
          <button type="button" onClick={() => onAddAfter(scene.order)}>在后面加镜头</button>
          <button type="button" className="danger" onClick={() => onDelete(scene)}>删除镜头</button>
          {scene.assetProvider === "PEXELS" && scene.sourceUrl && (
            <a href={scene.sourceUrl} target="_blank" rel="noreferrer">素材：{scene.sourceAuthor || "Pexels"}</a>
          )}
        </div>
      </div>
      <div className="scene-meta">
        <label><span>时长</span><input type="number" min={2} max={20} value={draft.duration} onChange={(event) => setDraft({ ...draft, duration: Number(event.target.value) })} onBlur={() => onSave(scene, { duration: draft.duration })} /></label>
        <label><span>构图</span><input value={draft.composition} onChange={(event) => setDraft({ ...draft, composition: event.target.value })} onBlur={() => onSave(scene, { composition: draft.composition })} /></label>
        <label><span>运动</span><input value={draft.motion} onChange={(event) => setDraft({ ...draft, motion: event.target.value })} onBlur={() => onSave(scene, { motion: draft.motion })} /></label>
      </div>
    </article>
  );
}
