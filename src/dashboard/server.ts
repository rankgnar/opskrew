import express, { Request, Response } from "express";
import { execSync } from "node:child_process";
import { homedir } from "node:os";
import {
  existsSync,
  readdirSync,
  statSync,
  mkdirSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { getDb } from "../db.js";
import { getConfig, saveConfig } from "../config.js";
import { getUsageStats, getDailyUsage } from "../tools/usage.js";
import { PERSONALITIES } from "../tools/personalities.js";
import { getLastCheckInfo } from "../tools/auto-update.js";

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
import {
  loadSkills,
  addSkill,
  removeSkill,
  toggleSkill,
  writeSkillMd,
  getSkillContent,
  parseSkillMd,
  downloadSkill,
  type Skill,
} from "../tools/skills.js";
import { scanSkillRemote } from "../tools/skill-scanner.js";
import { loadAgents, addAgent, removeAgent, toggleAgent, type Agent } from "../tools/team.js";
import { PROVIDERS } from "../claude.js";

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>opskrew dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --green:      #00ff88;
      --violet:     #7c3aed;
      --bg:         #0a0a0f;
      --bg-sidebar: #0d0d12;
      --text:       #e0e0e0;
      --muted:      #888;
      --border:     rgba(255,255,255,0.06);
      --danger:     #ff4444;
    }

    html, body {
      height: 100%;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg);
      color: var(--text);
      font-size: 14px;
      line-height: 1.5;
    }

    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #444; }

    .glow-green { text-shadow: 0 0 20px rgba(0, 255, 136, 0.5); }
    .glow-violet { text-shadow: 0 0 20px rgba(124, 58, 237, 0.5); }

    @keyframes pulse-dot {
      0%, 100% { opacity: 1; box-shadow: 0 0 8px rgba(0, 255, 136, 0.6); }
      50%       { opacity: 0.55; box-shadow: 0 0 3px rgba(0, 255, 136, 0.2); }
    }

    .app { display: flex; height: 100vh; overflow: hidden; }

    /* ── Sidebar ─────────────────────────────────────── */
    .sidebar {
      width: 240px;
      background: var(--bg-sidebar);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      position: relative;
      z-index: 10;
    }
    .sidebar::after {
      content: '';
      position: absolute;
      right: 0; top: 0; bottom: 0;
      width: 1px;
      background: linear-gradient(180deg,
        rgba(0,255,136,0.5) 0%,
        rgba(124,58,237,0.5) 60%,
        transparent 100%);
    }
    .sidebar-logo {
      padding: 24px 20px 18px;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.5px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .sidebar-logo .bolt { font-size: 18px; filter: drop-shadow(0 0 6px rgba(0, 255, 136, 0.9)); }
    .sidebar-logo .ops  { color: var(--green); text-shadow: 0 0 18px rgba(0,255,136,0.45); }
    .sidebar-logo .krew { color: #fff; }
    .sidebar-divider {
      height: 1px;
      background: linear-gradient(90deg, rgba(0,255,136,0.25), rgba(124,58,237,0.25), transparent);
      margin: 0 16px 14px;
    }
    .sidebar-nav {
      flex: 1;
      padding: 0 10px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-radius: 8px;
      cursor: pointer;
      border: none;
      border-left: 3px solid transparent;
      background: none;
      color: var(--muted);
      font-size: 14px;
      font-weight: 500;
      font-family: inherit;
      text-align: left;
      width: 100%;
      transition: background 0.2s, color 0.2s, border-left-color 0.2s;
    }
    .nav-item:hover  { background: rgba(0,255,136,0.05); color: var(--text); }
    .nav-item.active {
      background: rgba(0,255,136,0.1);
      border-left-color: var(--green);
      color: #fff;
    }
    .nav-icon { font-size: 16px; flex-shrink: 0; }
    .sidebar-footer { padding: 14px 20px 20px; }
    .sidebar-footer .sidebar-divider { margin: 0 0 14px; }
    .sidebar-status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: #aaa;
      margin-bottom: 6px;
    }
    .status-dot-pulse {
      width: 8px; height: 8px;
      background: var(--green);
      border-radius: 50%;
      flex-shrink: 0;
      animation: pulse-dot 2s infinite;
    }
    .sidebar-version { font-size: 11px; color: #555; }

    /* ── Main area ───────────────────────────────────── */
    .main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background-color: var(--bg);
      background-image:
        linear-gradient(rgba(0,255,136,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0,255,136,0.03) 1px, transparent 1px);
      background-size: 40px 40px;
    }

    /* Stats bar */
    .stats-bar {
      display: flex;
      gap: 12px;
      padding: 14px 20px;
      flex-shrink: 0;
      border-bottom: 1px solid var(--border);
    }
    .stat-card {
      background: rgba(255,255,255,0.03);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 12px;
      padding: 12px 20px;
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
      transition: border-color 0.2s;
    }
    .stat-card:hover { border-color: rgba(0,255,136,0.15); }
    .stat-icon { font-size: 18px; }
    .stat-num  { font-size: 22px; font-weight: 700; color: var(--green); line-height: 1; }
    .stat-label {
      font-size: 11px; color: var(--muted); margin-top: 2px;
      text-transform: uppercase; letter-spacing: 0.5px;
    }

    .content-area { flex: 1; display: flex; overflow: hidden; }

    /* List panel */
    .list-panel {
      width: 260px;
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      background: rgba(255,255,255,0.01);
    }
    .list-panel-header {
      padding: 13px 16px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--muted);
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    .sidebar-list { flex: 1; overflow-y: auto; padding: 8px; }

    .item {
      padding: 10px 12px;
      border-radius: 8px;
      cursor: pointer;
      border: 1px solid transparent;
      margin-bottom: 4px;
      transition: background 0.15s, border-color 0.15s;
    }
    .item:hover  { background: rgba(0,255,136,0.04); border-color: rgba(0,255,136,0.12); }
    .item.active { background: rgba(0,255,136,0.08); border-color: rgba(0,255,136,0.22); }
    .item-title {
      font-size: 12px; font-weight: 500; color: var(--text);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .item-meta { font-size: 11px; color: var(--muted); margin-top: 2px; }
    .item-actions { display: flex; gap: 4px; margin-top: 4px; }

    /* Detail panel */
    .detail-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    .content-header {
      padding: 13px 20px;
      border-bottom: 1px solid var(--border);
      background: rgba(255,255,255,0.02);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }
    .content-title { font-size: 15px; font-weight: 600; color: var(--text); }
    .content-sub   { font-size: 12px; color: var(--muted); margin-left: auto; }
    .content-body { flex: 1; overflow-y: auto; padding: 20px; }

    /* Chat bubbles */
    .bubble { display: flex; margin-bottom: 14px; }
    .bubble.user      { justify-content: flex-end; }
    .bubble.assistant { justify-content: flex-start; }
    .bubble-inner {
      max-width: 70%;
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 13px;
      line-height: 1.6;
      word-break: break-word;
    }
    .bubble.user .bubble-inner {
      background: rgba(124,58,237,0.2);
      border: 1px solid rgba(124,58,237,0.3);
      border-radius: 12px 12px 2px 12px;
      color: #d4b8ff;
    }
    .bubble.assistant .bubble-inner {
      background: rgba(0,255,136,0.08);
      border: 1px solid rgba(0,255,136,0.15);
      border-radius: 12px 12px 12px 2px;
      color: var(--text);
    }
    .bubble-meta { font-size: 10px; color: var(--muted); margin-top: 4px; text-align: right; }
    .bubble.assistant .bubble-meta { text-align: left; }

    /* Cards */
    .card {
      background: rgba(255,255,255,0.03);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 12px;
      padding: 14px 16px;
      margin-bottom: 10px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      transition: border-color 0.2s;
    }
    .card:hover { border-color: rgba(0,255,136,0.18); }
    .card-body  { flex: 1; }
    .card-text  { font-size: 13px; color: var(--text); }
    .card-meta  { font-size: 11px; color: var(--muted); margin-top: 4px; }
    .card-actions { display: flex; gap: 6px; }

    .btn-danger {
      background: none;
      border: 1px solid rgba(255,68,68,0.35);
      color: rgba(255,68,68,0.7);
      padding: 4px 10px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-family: inherit;
      transition: all 0.15s;
    }
    .btn-danger:hover { background: rgba(255,68,68,0.15); border-color: var(--danger); color: var(--danger); }

    .empty { text-align: center; padding: 60px 20px; color: var(--muted); }
    .empty-icon { font-size: 40px; margin-bottom: 12px; }
    .empty-text { font-size: 14px; }
    .loading { text-align: center; padding: 40px; color: var(--muted); font-size: 13px; }

    /* ── Settings ─────────────────────────────────────── */
    .settings-section { margin-bottom: 28px; }
    .settings-section-title {
      font-size: 12px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.8px;
      color: var(--muted);
      margin-bottom: 12px; padding-bottom: 6px;
      border-bottom: 1px solid var(--border);
    }
    .settings-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 10px;
    }
    .settings-card {
      background: rgba(255,255,255,0.03);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 12px;
      padding: 14px 16px;
      transition: border-color 0.2s;
    }
    .settings-card:hover { border-color: rgba(0,255,136,0.2); }
    .settings-card-label {
      font-size: 11px; color: var(--muted);
      margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;
    }
    .settings-card-value { font-size: 14px; font-weight: 600; color: var(--green); word-break: break-all; }

    .channel-row {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 12px;
      padding: 14px 16px; margin-bottom: 8px;
      transition: border-color 0.2s;
    }
    .channel-row:hover { border-color: rgba(0,255,136,0.15); }
    .channel-row-header { display: flex; align-items: center; gap: 12px; }
    .channel-icon  { font-size: 20px; flex-shrink: 0; }
    .channel-info  { flex: 1; }
    .channel-name  { font-size: 13px; font-weight: 600; color: var(--text); }
    .channel-users { font-size: 11px; color: var(--muted); margin-top: 2px; }

    /* Channel configure form */
    .channel-configure-form {
      margin-top: 14px;
      padding-top: 14px;
      border-top: 1px solid var(--border);
      display: none;
    }
    .channel-configure-form.open { display: block; }
    .channel-form-row { margin-bottom: 10px; }
    .channel-form-label { font-size: 11px; color: var(--muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.4px; }
    .channel-form-input-wrap { display: flex; gap: 6px; align-items: center; }

    .status-badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 10px; border-radius: 20px;
      font-size: 11px; font-weight: 600;
    }
    .status-badge.enabled {
      background: rgba(0,255,136,0.12);
      border: 1px solid rgba(0,255,136,0.3);
      color: var(--green);
      box-shadow: 0 0 8px rgba(0,255,136,0.12);
    }
    .status-badge.disabled {
      background: rgba(80,80,80,0.15);
      border: 1px solid rgba(80,80,80,0.3);
      color: #666;
    }
    .status-dot-badge { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
    .enabled .status-dot-badge { background: var(--green); }
    .disabled .status-dot-badge { background: #555; }

    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 8px;
    }
    .feature-row {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 10px;
      padding: 10px 14px;
      display: flex; align-items: center; gap: 10px;
      transition: border-color 0.2s;
    }
    .feature-row:hover { border-color: rgba(0,255,136,0.12); }
    .feature-icon { font-size: 16px; flex-shrink: 0; }
    .feature-name { flex: 1; font-size: 12px; color: var(--text); }
    .toggle { width: 32px; height: 18px; border-radius: 9px; flex-shrink: 0; transition: background 0.2s; }
    .toggle.on  { background: var(--green); box-shadow: 0 0 6px rgba(0,255,136,0.4); }
    .toggle.off { background: #333; }

    .sysinfo-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 10px;
    }
    .sysinfo-card {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 12px; padding: 14px 16px;
      transition: border-color 0.2s;
    }
    .sysinfo-card:hover { border-color: rgba(124,58,237,0.2); }
    .sysinfo-label {
      font-size: 11px; color: var(--muted);
      text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;
    }
    .sysinfo-value { font-size: 15px; font-weight: 700; color: var(--violet); word-break: break-all; }

    /* ── Responsive ──────────────────────────────────── */
    @media (max-width: 768px) {
      .sidebar { width: 60px; }
      .sidebar-logo .ops,
      .sidebar-logo .krew  { display: none; }
      .sidebar-logo        { padding: 18px 0; justify-content: center; font-size: 22px; }
      .nav-item .nav-label { display: none; }
      .nav-item            { justify-content: center; padding: 12px; border-left: none; border-bottom: 3px solid transparent; }
      .nav-item.active     { border-left-color: transparent; border-bottom-color: var(--green); }
      .sidebar-status .status-label { display: none; }
      .sidebar-version     { display: none; }
      .sidebar-footer      { padding: 10px; text-align: center; }
    }
    @media (max-width: 640px) {
      .list-panel  { display: none; }
      .stats-bar   { gap: 8px; }
      .stat-card   { padding: 10px 12px; }
      .stat-icon   { display: none; }
    }

    /* ── Usage tab ───────────────────────────────────── */
    .usage-section { margin-bottom: 28px; }
    .usage-section-title {
      font-size: 12px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.8px;
      color: var(--muted); margin-bottom: 12px; padding-bottom: 6px;
      border-bottom: 1px solid var(--border);
    }
    .usage-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 10px;
      margin-bottom: 20px;
    }
    .usage-stat-card {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 12px; padding: 16px;
      transition: border-color 0.2s;
    }
    .usage-stat-card:hover { border-color: rgba(0,255,136,0.2); }
    .usage-stat-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
    .usage-stat-value { font-size: 20px; font-weight: 700; color: var(--green); line-height: 1; }
    .usage-stat-sub  { font-size: 11px; color: var(--muted); margin-top: 4px; }
    .bar-chart { display: flex; flex-direction: column; gap: 10px; }
    .bar-row { display: flex; align-items: center; gap: 10px; }
    .bar-label { font-size: 11px; color: var(--muted); width: 70px; flex-shrink: 0; text-align: right; }
    .bar-track {
      flex: 1; height: 20px;
      background: rgba(255,255,255,0.04);
      border-radius: 4px; overflow: hidden;
      border: 1px solid rgba(255,255,255,0.06);
    }
    .bar-fill {
      height: 100%; border-radius: 4px;
      background: linear-gradient(90deg, rgba(0,255,136,0.6), rgba(0,255,136,0.9));
      transition: width 0.4s ease;
      min-width: 2px;
    }
    .bar-value { font-size: 11px; color: var(--muted); width: 60px; flex-shrink: 0; }
    .cost-badge {
      display: inline-flex; align-items: center; gap: 6px;
      background: rgba(124,58,237,0.12);
      border: 1px solid rgba(124,58,237,0.25);
      border-radius: 8px; padding: 8px 14px;
      font-size: 13px; color: #c4b5fd;
    }

    /* ── Form inputs ─────────────────────────────────── */
    .add-form {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 20px;
    }
    .add-form-title {
      font-size: 12px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.8px;
      color: var(--muted); margin-bottom: 12px;
    }
    .add-form-row { display: flex; gap: 8px; align-items: flex-start; flex-wrap: wrap; }
    .form-input {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      color: #e0e0e0;
      padding: 10px 14px;
      font-size: 14px;
      font-family: inherit;
      flex: 1;
      min-width: 160px;
      transition: border-color 0.2s;
    }
    .form-input:focus { outline: none; border-color: var(--green); box-shadow: 0 0 8px rgba(0, 255, 136, 0.2); }
    .form-select {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      color: #e0e0e0;
      padding: 10px 14px;
      font-size: 14px;
      font-family: inherit;
      cursor: pointer;
      transition: border-color 0.2s;
    }
    .form-select:focus { outline: none; border-color: var(--green); }
    .form-select option { background: #1a1a2e; color: #e0e0e0; }
    .btn-primary {
      background: var(--green);
      color: #0a0a0f;
      border: none;
      border-radius: 8px;
      padding: 10px 20px;
      font-weight: 600;
      font-family: inherit;
      font-size: 14px;
      cursor: pointer;
      transition: opacity 0.2s;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .btn-primary:hover { opacity: 0.85; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary {
      background: rgba(255,255,255,0.07);
      color: var(--text);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      padding: 6px 14px;
      font-size: 12px;
      font-family: inherit;
      cursor: pointer;
      transition: background 0.15s;
    }
    .btn-secondary:hover { background: rgba(255,255,255,0.12); }
    .btn-icon {
      background: none;
      border: 1px solid rgba(255,255,255,0.1);
      color: var(--muted);
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .btn-icon:hover { border-color: rgba(255,255,255,0.25); color: var(--text); }
    .btn-icon.edit:hover { border-color: rgba(0,255,136,0.4); color: var(--green); }
    .btn-icon.danger:hover { border-color: rgba(255,68,68,0.4); color: var(--danger); }
    .badge-pending {
      display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 600;
      background: rgba(0,255,136,0.12); border: 1px solid rgba(0,255,136,0.25); color: var(--green);
    }
    .badge-delivered {
      display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 600;
      background: rgba(80,80,80,0.15); border: 1px solid rgba(80,80,80,0.3); color: #666;
    }
    .edit-row { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
    .inline-edit {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(0,255,136,0.35);
      border-radius: 6px;
      color: var(--text);
      padding: 6px 10px;
      font-size: 13px;
      font-family: inherit;
      flex: 1;
    }
    .inline-edit:focus { outline: none; border-color: var(--green); }
    .settings-input {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      color: #e0e0e0;
      padding: 8px 12px;
      font-size: 14px;
      font-family: inherit;
      width: 100%;
      transition: border-color 0.2s;
    }
    .settings-input:focus { outline: none; border-color: var(--green); box-shadow: 0 0 8px rgba(0,255,136,0.15); }
    .settings-input-select {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      color: #e0e0e0;
      padding: 8px 12px;
      font-size: 14px;
      font-family: inherit;
      width: 100%;
      cursor: pointer;
    }
    .settings-input-select option { background: #1a1a2e; }
    .feature-row.clickable { cursor: pointer; }
    .feature-row.clickable:hover { border-color: rgba(0,255,136,0.25); background: rgba(0,255,136,0.03); }

    /* Sidebar action buttons */
    .sidebar-actions {
      display: flex;
      gap: 6px;
      margin-bottom: 10px;
    }
    .sidebar-action-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 4px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      transition: all 0.25s ease;
      letter-spacing: 0.4px;
      text-transform: uppercase;
      border: 1px solid transparent;
    }
    .sidebar-action-btn.update {
      background: rgba(124,58,237,0.15);
      border-color: rgba(124,58,237,0.25);
      color: #c4b5fd;
    }
    .sidebar-action-btn.update:hover {
      background: rgba(124,58,237,0.28);
      border-color: rgba(124,58,237,0.5);
      box-shadow: 0 0 10px rgba(124,58,237,0.2);
    }
    .sidebar-action-btn.restart {
      background: rgba(255,136,0,0.12);
      border-color: rgba(255,136,0,0.22);
      color: #ffaa44;
    }
    .sidebar-action-btn.restart:hover {
      background: rgba(255,136,0,0.25);
      border-color: rgba(255,136,0,0.45);
      box-shadow: 0 0 10px rgba(255,136,0,0.18);
    }
    .sidebar-action-btn:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
    .sidebar-action-btn svg { flex-shrink: 0; }
    .update-msg { font-size: 10px; color: var(--muted); text-align: center; margin-bottom: 6px; }

    /* ── Knowledge Base ──────────────────────────────── */
    .kb-file-row {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 10px;
      padding: 12px 16px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 12px;
      transition: border-color 0.2s;
    }
    .kb-file-row:hover { border-color: rgba(0,255,136,0.15); }
    .kb-file-icon { font-size: 18px; flex-shrink: 0; }
    .kb-file-info { flex: 1; }
    .kb-file-name { font-size: 13px; font-weight: 500; color: var(--text); }
    .kb-file-size { font-size: 11px; color: var(--muted); margin-top: 2px; }

    /* ── Personality list ────────────────────────────── */
    .personality-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 8px;
    }
    .personality-card {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 10px; padding: 10px 14px;
      display: flex; align-items: center; gap: 10px;
      transition: border-color 0.2s;
    }
    .personality-card:hover { border-color: rgba(0,255,136,0.15); }
    .personality-emoji { font-size: 18px; flex-shrink: 0; }
    .personality-info  { flex: 1; }
    .personality-name  { font-size: 13px; font-weight: 600; color: var(--text); }
    .personality-desc  { font-size: 11px; color: var(--muted); margin-top: 2px; }

    /* ── Toast notifications ─────────────────────────── */
    .toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #1a1a2e;
      color: var(--text);
      padding: 12px 20px;
      border-radius: 8px;
      border: 1px solid var(--green);
      opacity: 0;
      transform: translateY(10px);
      transition: all 0.3s;
      z-index: 9999;
      font-size: 13px;
      font-weight: 500;
      max-width: 320px;
    }
    .toast.show { opacity: 1; transform: translateY(0); }
    .toast-error { border-color: var(--danger); }
    .toast-success { border-color: var(--green); }
    .toast-warning { border-color: #ffaa44; }

    /* Password input wrapper */
    .pw-wrap { position: relative; display: flex; align-items: center; width: 100%; }
    .pw-wrap .settings-input { padding-right: 40px; }
    .pw-toggle {
      position: absolute;
      right: 8px;
      background: none;
      border: none;
      color: var(--muted);
      cursor: pointer;
      font-size: 15px;
      padding: 4px;
      line-height: 1;
    }
    .pw-toggle:hover { color: var(--text); }

    /* Restart prompt */
    .restart-prompt {
      display: none;
      background: rgba(255,136,0,0.08);
      border: 1px solid rgba(255,136,0,0.25);
      border-radius: 8px;
      padding: 10px 16px;
      margin-top: 10px;
      font-size: 13px;
      color: #ffaa44;
      align-items: center;
      gap: 10px;
    }
    .restart-prompt.show { display: flex; }
  </style>
</head>
<body>
<div class="app">

  <!-- ── Sidebar ─────────────────────────────────────── -->
  <aside class="sidebar">
    <div class="sidebar-logo">
      <span class="bolt">⚡</span>
      <span class="ops">ops</span><span class="krew">krew</span>
    </div>
    <div class="sidebar-divider"></div>

    <nav class="sidebar-nav">
      <button class="nav-item active" data-tab="conversations" onclick="switchTab('conversations')">
        <span class="nav-icon">💬</span><span class="nav-label">Conversations</span>
      </button>
      <button class="nav-item" data-tab="memories" onclick="switchTab('memories')">
        <span class="nav-icon">🧠</span><span class="nav-label">Memories</span>
      </button>
      <button class="nav-item" data-tab="reminders" onclick="switchTab('reminders')">
        <span class="nav-icon">⏰</span><span class="nav-label">Reminders</span>
      </button>
      <button class="nav-item" data-tab="usage" onclick="switchTab('usage')">
        <span class="nav-icon">📊</span><span class="nav-label">Usage</span>
      </button>
      <button class="nav-item" data-tab="knowledge" onclick="switchTab('knowledge')">
        <span class="nav-icon">📚</span><span class="nav-label">Knowledge Base</span>
      </button>
      <button class="nav-item" data-tab="skills" onclick="switchTab('skills')">
        <span class="nav-icon">🧩</span><span class="nav-label">Skills</span>
      </button>
      <button class="nav-item" data-tab="team" onclick="switchTab('team')">
        <span class="nav-icon">🤖</span><span class="nav-label">Team</span>
      </button>
      <button class="nav-item" data-tab="settings" onclick="switchTab('settings')">
        <span class="nav-icon">⚙️</span><span class="nav-label">Settings</span>
      </button>
    </nav>

    <div class="sidebar-footer">
      <div class="sidebar-divider"></div>
      <div class="sidebar-actions">
        <button class="sidebar-action-btn update" id="update-btn" onclick="triggerUpdate()">
          <span id="update-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg></span>
          <span class="sidebar-action-label">Update</span>
        </button>
        <button class="sidebar-action-btn restart" id="restart-btn" onclick="triggerRestart()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>
          <span class="sidebar-action-label">Restart</span>
        </button>
      </div>
      <span class="update-msg" id="update-msg"></span>
      <div class="sidebar-status">
        <span class="status-dot-pulse"></span>
        <span class="status-label">Online</span>
      </div>
      <div class="sidebar-version">v0.1.0</div>
    </div>
  </aside>

  <!-- ── Main area ──────────────────────────────────── -->
  <div class="main">

    <!-- Stats bar -->
    <div class="stats-bar">
      <div class="stat-card">
        <span class="stat-icon">💬</span>
        <div>
          <div class="stat-num" id="stat-msgs">–</div>
          <div class="stat-label">Messages</div>
        </div>
      </div>
      <div class="stat-card">
        <span class="stat-icon">🧠</span>
        <div>
          <div class="stat-num" id="stat-mems">–</div>
          <div class="stat-label">Memories</div>
        </div>
      </div>
      <div class="stat-card">
        <span class="stat-icon">⏰</span>
        <div>
          <div class="stat-num" id="stat-rems">–</div>
          <div class="stat-label">Pending</div>
        </div>
      </div>
      
    </div>

    <!-- Content area -->
    <div class="content-area">

      <!-- List panel (conversations only) -->
      <div class="list-panel" id="list-panel">
        <div class="list-panel-header" id="list-panel-header">Conversations</div>
        <div class="sidebar-list" id="sidebar-list">
          <div class="loading">Loading…</div>
        </div>
      </div>

      <!-- Detail / settings panel -->
      <div class="detail-panel">
        <div class="content-header">
          <span class="content-title" id="content-title">Select a conversation</span>
          <span class="content-sub" id="content-sub"></span>
        </div>
        <div class="content-body" id="content-body">
          <div class="empty">
            <div class="empty-icon">💬</div>
            <div class="empty-text">Select a conversation to view messages</div>
          </div>
        </div>
      </div>

    </div>
  </div>
</div>

<script>
  let currentTab = 'conversations';
  let currentChat = null;

  /* ── Toast notifications ───────────────────────────── */
  function toast(msg, type) {
    type = type || 'success';
    const t = document.createElement('div');
    t.className = 'toast toast-' + type;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function() { t.classList.add('show'); }, 10);
    setTimeout(function() {
      t.classList.remove('show');
      setTimeout(function() { t.remove(); }, 300);
    }, 3500);
  }

  /* ── Utilities ─────────────────────────────────────── */
  function fmt(ts) {
    if (!ts) return '';
    const d = new Date(ts.endsWith && ts.endsWith('Z') ? ts : ts + 'Z');
    if (isNaN(d)) return ts;
    return d.toLocaleString();
  }

  function fmtShort(ts) {
    if (!ts) return '';
    const d = new Date(ts.endsWith && ts.endsWith('Z') ? ts : ts + 'Z');
    if (isNaN(d)) return ts;
    const now = new Date();
    if (d.toDateString() === now.toDateString())
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString();
  }

  function fmtUptime(sec) {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (d > 0) return d + 'd ' + h + 'h ' + m + 'm';
    if (h > 0) return h + 'h ' + m + 'm ' + s + 's';
    if (m > 0) return m + 'm ' + s + 's';
    return s + 's';
  }

  function fmtBytes(bytes) {
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return bytes + ' B';
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function api(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  /* ── Stats ─────────────────────────────────────────── */
  async function loadStats() {
    try {
      const s = await api('/api/stats');
      document.getElementById('stat-msgs').textContent = s.messages ?? '–';
      document.getElementById('stat-mems').textContent = s.memories ?? '–';
      document.getElementById('stat-rems').textContent = s.pendingReminders ?? '–';
    } catch (e) { console.warn('stats error', e); }
  }

  /* ── Tab switching ─────────────────────────────────── */
  function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.nav-item').forEach(function(t) {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    currentChat = null;

    const listPanel  = document.getElementById('list-panel');

    if (tab === 'settings') {
      listPanel.style.display = 'none';
      document.getElementById('content-title').textContent = '⚙️ Settings';
      document.getElementById('content-sub').textContent = '';
      loadSettings();
      return;
    }

    if (tab === 'usage') {
      listPanel.style.display = 'none';
      document.getElementById('content-title').textContent = '📊 Usage';
      document.getElementById('content-sub').textContent = '';
      loadUsage();
      return;
    }

    if (tab === 'memories') {
      listPanel.style.display = 'none';
      document.getElementById('content-title').textContent = '🧠 Memories';
      document.getElementById('content-sub').textContent = '';
      loadMemoriesView();
      return;
    }

    if (tab === 'reminders') {
      listPanel.style.display = 'none';
      document.getElementById('content-title').textContent = '⏰ Reminders';
      document.getElementById('content-sub').textContent = '';
      loadRemindersView();
      return;
    }

    if (tab === 'knowledge') {
      listPanel.style.display = 'none';
      document.getElementById('content-title').textContent = '📚 Knowledge Base';
      document.getElementById('content-sub').textContent = '';
      loadKnowledge();
      return;
    }

    if (tab === 'skills') {
      listPanel.style.display = 'none';
      document.getElementById('content-title').textContent = '🧩 Skills';
      document.getElementById('content-sub').textContent = '';
      loadSkillsView();
      return;
    }

    if (tab === 'team') {
      listPanel.style.display = 'none';
      document.getElementById('content-title').textContent = '🤖 Team';
      document.getElementById('content-sub').textContent = '';
      loadTeamView();
      return;
    }

    listPanel.style.display = 'flex';
    document.getElementById('list-panel-header').textContent = 'Conversations';
    document.getElementById('content-title').textContent = 'Select a conversation';
    document.getElementById('content-sub').textContent = '';
    document.getElementById('content-body').innerHTML =
      '<div class="empty"><div class="empty-icon">💬</div><div class="empty-text">Select a conversation to view messages</div></div>';
    loadSidebar();
  }

  /* ── Usage ─────────────────────────────────────────── */
  async function loadUsage() {
    const body = document.getElementById('content-body');
    body.innerHTML = '<div class="loading">Loading usage data…</div>';
    try {
      const [month, daily] = await Promise.all([
        api('/api/usage?period=month'),
        api('/api/usage/daily'),
      ]);
      renderUsage(month, daily);
    } catch (e) {
      body.innerHTML = '<div class="empty"><div class="empty-icon">❌</div><div class="empty-text">Failed to load usage</div></div>';
      console.error(e);
    }
  }

  function fmtTokens(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000)    return (n / 1000).toFixed(1) + 'K';
    return String(n);
  }

  function renderUsage(month, daily) {
    const body = document.getElementById('content-body');
    const maxTotal = Math.max.apply(null, daily.map(function(d) { return d.totalTokens; }).concat([1]));

    const barRows = daily.length === 0
      ? '<div class="empty"><div class="empty-icon">📊</div><div class="empty-text">No usage data yet</div></div>'
      : daily.map(function(d) {
          const pct = Math.round((d.totalTokens / maxTotal) * 100);
          const label = d.date ? d.date.slice(5) : '–';
          return \`<div class="bar-row">
            <div class="bar-label">\${esc(label)}</div>
            <div class="bar-track"><div class="bar-fill" style="width:\${pct}%"></div></div>
            <div class="bar-value">\${fmtTokens(d.totalTokens)}</div>
          </div>\`;
        }).join('');

    const cost = (month.estimatedCost || 0).toFixed(4);

    body.innerHTML = \`
      <div class="usage-section">
        <div class="usage-section-title">📈 This Month</div>
        <div class="usage-grid">
          <div class="usage-stat-card">
            <div class="usage-stat-label">Input tokens</div>
            <div class="usage-stat-value">\${fmtTokens(month.inputTokens || 0)}</div>
            <div class="usage-stat-sub">\${(month.inputTokens || 0).toLocaleString()} total</div>
          </div>
          <div class="usage-stat-card">
            <div class="usage-stat-label">Output tokens</div>
            <div class="usage-stat-value">\${fmtTokens(month.outputTokens || 0)}</div>
            <div class="usage-stat-sub">\${(month.outputTokens || 0).toLocaleString()} total</div>
          </div>
          <div class="usage-stat-card">
            <div class="usage-stat-label">Total tokens</div>
            <div class="usage-stat-value">\${fmtTokens(month.totalTokens || 0)}</div>
            <div class="usage-stat-sub">Model: \${esc(month.model || '–')}</div>
          </div>
        </div>
        <div class="cost-badge">💰 Equivalent API cost this month: <strong>$\${cost}</strong> <span style="color:var(--muted)">(covered by subscription)</span></div>
      </div>
      <div class="usage-section">
        <div class="usage-section-title">📅 Last 7 Days</div>
        <div class="bar-chart">\${barRows}</div>
      </div>\`;
  }

  /* ── Knowledge Base ────────────────────────────────── */
  async function loadKnowledge() {
    const body = document.getElementById('content-body');
    body.innerHTML = '<div class="loading">Loading knowledge base…</div>';
    try {
      const files = await api('/api/knowledge');
      renderKnowledge(files);
    } catch (e) {
      body.innerHTML = '<div class="empty"><div class="empty-icon">❌</div><div class="empty-text">Failed to load knowledge base</div></div>';
      console.error(e);
    }
  }

  function renderKnowledge(files) {
    const body = document.getElementById('content-body');
    document.getElementById('content-sub').textContent = files.length + ' file(s)';

    const rows = files.length === 0
      ? '<div class="empty"><div class="empty-icon">📚</div><div class="empty-text">No files yet. Upload one below!</div></div>'
      : files.map(function(f) {
          return \`<div class="kb-file-row">
            <div class="kb-file-icon">📄</div>
            <div class="kb-file-info">
              <div class="kb-file-name">\${esc(f.name)}</div>
              <div class="kb-file-size">\${fmtBytes(f.size)}</div>
            </div>
            <button class="btn-icon danger" onclick="deleteKbFile('\${esc(f.name)}')">🗑️</button>
          </div>\`;
        }).join('');

    body.innerHTML = \`
      <div class="add-form">
        <div class="add-form-title">📤 Upload File</div>
        <div style="margin-bottom:10px">
          <label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;display:block;margin-bottom:4px">File Name</label>
          <input class="form-input" id="kb-filename" placeholder="e.g. product-info.txt" style="width:100%;margin-bottom:8px"/>
          <label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;display:block;margin-bottom:4px">Content</label>
          <textarea class="form-input" id="kb-content" rows="6" placeholder="Paste file content here…" style="width:100%;resize:vertical;font-family:monospace;font-size:12px"></textarea>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn-primary" onclick="uploadKbFile()">📤 Upload</button>
          <input type="file" id="kb-file-picker" style="display:none" onchange="handleKbFilePick(this)"/>
          <button class="btn-secondary" onclick="document.getElementById('kb-file-picker').click()">📁 Pick File</button>
        </div>
      </div>
      \${rows}\`;
  }

  async function handleKbFilePick(input) {
    const file = input.files[0];
    if (!file) return;
    document.getElementById('kb-filename').value = file.name;
    const text = await file.text();
    document.getElementById('kb-content').value = text;
    input.value = '';
  }

  async function uploadKbFile() {
    const name = document.getElementById('kb-filename').value.trim();
    const content = document.getElementById('kb-content').value;
    if (!name) { toast('File name is required', 'error'); return; }
    if (!content.trim()) { toast('Content is required', 'error'); return; }
    try {
      const r = await fetch('/api/knowledge', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ name, content })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
      toast('File uploaded: ' + name);
      loadKnowledge();
    } catch (e) { toast('Upload failed: ' + e.message, 'error'); }
  }

  async function deleteKbFile(name) {
    if (!confirm('Delete "' + name + '" from knowledge base?')) return;
    try {
      const r = await fetch('/api/knowledge/' + encodeURIComponent(name), { method: 'DELETE' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
      toast('Deleted: ' + name);
      loadKnowledge();
    } catch (e) { toast('Delete failed: ' + e.message, 'error'); }
  }

  /* ── Settings ──────────────────────────────────────── */
  let _currentFeatures = {};
  let _currentVoice = false;
  let _currentDashEnabled = false;
  let _currentAutoUpdate = true;

  let _allProviders = [];

  async function loadSettings() {
    const body = document.getElementById('content-body');
    body.innerHTML = '<div class="loading">Loading settings…</div>';
    try {
      const [cfg, sys, providers] = await Promise.all([
        api('/api/config'),
        api('/api/system'),
        api('/api/providers'),
      ]);
      _allProviders = providers;
      renderSettings(cfg, sys);
      loadUpdateStatus();
    } catch (e) {
      body.innerHTML = '<div class="empty"><div class="empty-icon">❌</div><div class="empty-text">Failed to load settings</div></div>';
      console.error(e);
    }
  }

  function onProviderChange() {
    const providerSel = document.getElementById('cfg-provider');
    if (!providerSel) return;
    const selectedProvider = providerSel.value;
    updateModelSelect(selectedProvider, null);
    // Show/hide custom endpoint row
    const customRow = document.getElementById('custom-endpoint-row');
    if (customRow) customRow.style.display = selectedProvider === 'custom' ? 'block' : 'none';
  }

  function updateModelSelect(provider, currentModel) {
    const modelSel = document.getElementById('cfg-model');
    const customModelRow = document.getElementById('custom-model-row');
    if (!modelSel) return;
    const providerData = _allProviders.find(function(p) { return p.id === provider; });
    const models = providerData ? providerData.models : [];
    if (provider === 'custom' || models.length === 0) {
      // Switch to text input
      modelSel.style.display = 'none';
      if (customModelRow) customModelRow.style.display = 'block';
    } else {
      modelSel.style.display = '';
      if (customModelRow) customModelRow.style.display = 'none';
      // Repopulate model options
      modelSel.innerHTML = models.map(function(m) {
        const sel = currentModel === m.id ? ' selected' : (models.indexOf(m) === 0 && !currentModel ? ' selected' : '');
        return '<option value="' + esc(m.id) + '"' + sel + '>' + esc(m.name) + '</option>';
      }).join('');
    }
  }

  async function loadUpdateStatus() {
    try {
      const s = await api('/api/update/status');
      const tog = document.getElementById('feat-toggle-autoUpdate');
      _currentAutoUpdate = s.autoUpdate;
      if (tog) {
        tog.className = 'toggle ' + (s.autoUpdate ? 'on' : 'off');
      }
      const timeEl = document.getElementById('auto-update-check-time');
      if (timeEl) {
        if (s.lastCheckTime) {
          timeEl.textContent = '· last check ' + fmtShort(s.lastCheckTime);
        }
        if (!s.upToDate) {
          const row = document.getElementById('feat-row-autoUpdate');
          if (row) {
            row.style.borderColor = 'rgba(124,58,237,0.4)';
            timeEl.textContent = '· update available (' + s.latestVersion + ')';
            timeEl.style.color = '#c4b5fd';
          }
        }
      }
    } catch (e) { /* non-fatal */ }
  }

  function statusBadge(on) {
    return on
      ? \`<span class="status-badge enabled"><span class="status-dot-badge"></span>Enabled</span>\`
      : \`<span class="status-badge disabled"><span class="status-dot-badge"></span>Not configured</span>\`;
  }

  function toggleEl(on, id) {
    return \`<div class="toggle \${on ? 'on' : 'off'}" id="\${id}"></div>\`;
  }

  function pwInput(id, placeholder) {
    return \`<div class="pw-wrap">
      <input type="password" class="settings-input" id="\${id}" placeholder="\${placeholder}" autocomplete="off"/>
      <button class="pw-toggle" onclick="togglePw('\${id}')" type="button">👁</button>
    </div>\`;
  }

  function togglePw(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.type = el.type === 'password' ? 'text' : 'password';
  }

  function renderSettings(cfg, sys) {
    _currentFeatures = Object.assign({}, cfg.features || {});
    _currentVoice = !!cfg.features.voice;
    _currentDashEnabled = !!(cfg.dashboard && cfg.dashboard.enabled);
    _currentAutoUpdate = cfg.autoUpdate !== false;

    const body = document.getElementById('content-body');

    const featureMap = [
      { icon: '🔍', label: 'Web Search',    key: 'webSearch' },
      { icon: '🌐', label: 'URL Reader',     key: 'urlReader' },
      { icon: '📚', label: 'Knowledge Base', key: 'knowledge' },
      { icon: '⏰', label: 'Reminders',      key: 'reminders' },
      { icon: '👁️', label: 'Vision',         key: 'vision' },
      { icon: '🔄', label: 'Auto-Summary',   key: 'autoSummary' },
      { icon: '🤖', label: 'Team Auto-Delegate', key: 'teamAutoDelegate' },
    ];

    const assistant = cfg.assistant || {};
    const channels  = cfg.channels  || {};
    const features  = cfg.features  || {};
    const dash      = cfg.dashboard || {};

    const currentProvider = assistant.provider || 'anthropic';
    const providerData = _allProviders.find(function(p) { return p.id === currentProvider; });
    const providerModels = providerData ? providerData.models : [];
    const isCustom = currentProvider === 'custom' || providerModels.length === 0;

    const providerOptions = _allProviders.map(function(p) {
      return '<option value="' + esc(p.id) + '"' + (p.id === currentProvider ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    }).join('');

    const modelOptions = providerModels.map(function(m) {
      return '<option value="' + esc(m.id) + '"' + (m.id === assistant.model ? ' selected' : '') + '>' + esc(m.name) + '</option>';
    }).join('');

    const assistantCards = \`
      <div class="settings-card">
        <div class="settings-card-label">Name</div>
        <input class="settings-input" id="cfg-name" value="\${esc(assistant.name || '')}" placeholder="Opskrew"/>
      </div>
      <div class="settings-card">
        <div class="settings-card-label">Language</div>
        <input class="settings-input" id="cfg-language" value="\${esc(assistant.language || '')}" placeholder="English"/>
      </div>
      <div class="settings-card">
        <div class="settings-card-label">Tone</div>
        <input class="settings-input" id="cfg-tone" value="\${esc(assistant.tone || '')}" placeholder="helpful and friendly"/>
      </div>
      <div class="settings-card">
        <div class="settings-card-label">Provider</div>
        <select class="settings-input-select" id="cfg-provider" onchange="onProviderChange()">
          \${providerOptions}
        </select>
      </div>
      <div class="settings-card" id="custom-endpoint-row" style="display:\${currentProvider === 'custom' ? 'block' : 'none'}">
        <div class="settings-card-label">Custom Endpoint URL</div>
        <input class="settings-input" id="cfg-custom-endpoint" value="\${esc(assistant.customEndpoint || '')}" placeholder="https://your-api.example.com/v1/chat/completions"/>
      </div>
      <div class="settings-card">
        <div class="settings-card-label">Model</div>
        <select class="settings-input-select" id="cfg-model" style="display:\${isCustom ? 'none' : ''}">
          \${modelOptions}
        </select>
        <div id="custom-model-row" style="display:\${isCustom ? 'block' : 'none'}">
          <input class="settings-input" id="cfg-model-custom" value="\${esc(isCustom ? assistant.model || '' : '')}" placeholder="e.g. gpt-4o or llama3"/>
        </div>
      </div>\`;

    const tg = channels.telegram || {};
    const dc = channels.discord  || {};
    const wa = channels.whatsapp || {};

    const channelRows = \`
      <div class="channel-row">
        <div class="channel-row-header">
          <div class="channel-icon">📱</div>
          <div class="channel-info">
            <div class="channel-name">Telegram</div>
            <div class="channel-users">Allowed: \${esc((tg.allowedUsers || []).join(', ') || 'none')}</div>
          </div>
          \${statusBadge(tg.enabled)}
          <button class="btn-secondary" onclick="toggleChannelForm('tg')">Configure</button>
        </div>
        <div class="channel-configure-form" id="ch-form-tg">
          <div class="channel-form-row">
            <div class="channel-form-label">Bot Token</div>
            \${pwInput('ch-tg-token', 'Paste bot token…')}
          </div>
          <div class="channel-form-row">
            <div class="channel-form-label">Allowed Users (comma-separated)</div>
            <input class="settings-input" id="ch-tg-users" value="\${esc((tg.allowedUsers || []).join(', '))}" placeholder="@user1, @user2"/>
          </div>
          <div style="display:flex;gap:8px;margin-top:10px">
            <button class="btn-primary" onclick="saveChannelConfig('telegram')">💾 Save</button>
            <button class="btn-secondary" onclick="toggleChannelForm('tg')">Cancel</button>
          </div>
        </div>
      </div>

      <div class="channel-row">
        <div class="channel-row-header">
          <div class="channel-icon">🎮</div>
          <div class="channel-info">
            <div class="channel-name">Discord</div>
            <div class="channel-users">Allowed: \${esc((dc.allowedUsers || []).join(', ') || 'none')}</div>
          </div>
          \${statusBadge(dc.enabled)}
          <button class="btn-secondary" onclick="toggleChannelForm('dc')">Configure</button>
        </div>
        <div class="channel-configure-form" id="ch-form-dc">
          <div class="channel-form-row">
            <div class="channel-form-label">Bot Token</div>
            \${pwInput('ch-dc-token', 'Paste bot token…')}
          </div>
          <div class="channel-form-row">
            <div class="channel-form-label">Allowed User IDs (comma-separated)</div>
            <input class="settings-input" id="ch-dc-users" value="\${esc((dc.allowedUsers || []).join(', '))}" placeholder="123456789, 987654321"/>
          </div>
          <div style="display:flex;gap:8px;margin-top:10px">
            <button class="btn-primary" onclick="saveChannelConfig('discord')">💾 Save</button>
            <button class="btn-secondary" onclick="toggleChannelForm('dc')">Cancel</button>
          </div>
        </div>
      </div>

      <div class="channel-row">
        <div class="channel-row-header">
          <div class="channel-icon">💬</div>
          <div class="channel-info">
            <div class="channel-name">WhatsApp</div>
            <div class="channel-users">Numbers: \${esc((wa.allowedNumbers || []).join(', ') || 'none')}</div>
          </div>
          \${statusBadge(wa.enabled)}
          <button class="btn-secondary" onclick="toggleChannelForm('wa')">Configure</button>
        </div>
        <div class="channel-configure-form" id="ch-form-wa">
          <div class="channel-form-row">
            <div class="channel-form-label">Enabled</div>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" id="ch-wa-enabled" \${wa.enabled ? 'checked' : ''}/>
              <span style="font-size:13px;color:var(--text)">Enable WhatsApp channel</span>
            </label>
          </div>
          <div class="channel-form-row">
            <div class="channel-form-label">Allowed Numbers (comma-separated)</div>
            <input class="settings-input" id="ch-wa-numbers" value="\${esc((wa.allowedNumbers || []).join(', '))}" placeholder="34612345678, 46701234567"/>
          </div>
          <div style="display:flex;gap:8px;margin-top:10px">
            <button class="btn-primary" onclick="saveChannelConfig('whatsapp')">💾 Save</button>
            <button class="btn-secondary" onclick="toggleChannelForm('wa')">Cancel</button>
          </div>
        </div>
      </div>\`;

    const featureRows = featureMap.map(function(f) {
      return \`<div class="feature-row clickable" id="feat-row-\${f.key}" onclick="toggleFeature('\${f.key}')">
        <div class="feature-icon">\${f.icon}</div>
        <div class="feature-name">\${esc(f.label)}</div>
        <div class="toggle \${!!features[f.key] ? 'on' : 'off'}" id="feat-toggle-\${f.key}"></div>
      </div>\`;
    }).join('') + \`
      <div class="feature-row clickable" id="feat-row-voice" onclick="toggleVoice()">
        <div class="feature-icon">🎙️</div>
        <div class="feature-name">Voice</div>
        <div class="toggle \${_currentVoice ? 'on' : 'off'}" id="feat-toggle-voice"></div>
      </div>
      <div class="feature-row clickable" id="feat-row-dashboard" onclick="toggleDashboard()">
        <div class="feature-icon">🖥️</div>
        <div class="feature-name">Dashboard (:\${esc(String(dash.port || 3000))})</div>
        <div class="toggle \${_currentDashEnabled ? 'on' : 'off'}" id="feat-toggle-dashboard"></div>
      </div>
      <div class="feature-row clickable" id="feat-row-autoUpdate" onclick="toggleAutoUpdate()">
        <div class="feature-icon">🔄</div>
        <div class="feature-name">Auto-Update <span id="auto-update-check-time" style="font-size:10px;color:var(--muted)"></span></div>
        <div class="toggle \${_currentAutoUpdate ? 'on' : 'off'}" id="feat-toggle-autoUpdate"></div>
      </div>\`;

    const sysinfoCards = [
      { label: 'Version',  value: sys.version     || '–' },
      { label: 'Uptime',   value: fmtUptime(sys.uptime || 0) },
      { label: 'Memory',   value: (sys.memory || 0) + ' MB' },
      { label: 'Node',     value: sys.nodeVersion || '–' },
      { label: 'Platform', value: sys.platform    || '–' },
    ].map(function(c) {
      return \`<div class="sysinfo-card">
        <div class="sysinfo-label">\${esc(c.label)}</div>
        <div class="sysinfo-value">\${esc(c.value)}</div>
      </div>\`;
    }).join('');

    const personalityList = [
      { id: 'default',      emoji: '🤖', name: 'Default',      desc: 'Balanced and helpful' },
      { id: 'professional', emoji: '💼', name: 'Professional', desc: 'Formal, structured, business-focused' },
      { id: 'casual',       emoji: '😎', name: 'Casual',       desc: 'Relaxed, friendly, conversational' },
      { id: 'creative',     emoji: '🎨', name: 'Creative',     desc: 'Imaginative, poetic, expressive' },
      { id: 'concise',      emoji: '⚡', name: 'Concise',      desc: 'Minimal, direct, no fluff' },
      { id: 'teacher',      emoji: '📚', name: 'Teacher',      desc: 'Educational, patient, explains step by step' },
    ];

    const personalityCards = personalityList.map(function(p) {
      return \`<div class="personality-card">
        <div class="personality-emoji">\${p.emoji}</div>
        <div class="personality-info">
          <div class="personality-name">\${esc(p.name)}</div>
          <div class="personality-desc">\${esc(p.desc)}</div>
        </div>
      </div>\`;
    }).join('');

    body.innerHTML = \`
      <div class="settings-section">
        <div class="settings-section-title">🤖 Assistant</div>
        <div class="settings-grid">\${assistantCards}</div>
        <div style="margin-top:16px;display:flex;gap:10px;align-items:center">
          <button class="btn-primary" onclick="saveSettings()">💾 Save Settings</button>
        </div>
        <div class="restart-prompt" id="restart-prompt">
          ✅ Saved! Restart to apply changes.
          <button class="btn-primary" style="padding:6px 14px;font-size:12px" onclick="triggerRestart()">🔁 Restart now</button>
        </div>
      </div>
      <div class="settings-section">
        <div class="settings-section-title">🔧 Features <span style="font-size:10px;color:var(--muted);font-weight:400;text-transform:none;letter-spacing:0">(click to toggle — auto-saves)</span></div>
        <div class="features-grid">\${featureRows}</div>
      </div>
      <div class="settings-section">
        <div class="settings-section-title">📡 Channels</div>
        \${channelRows}
      </div>
      <div class="settings-section">
        <div class="settings-section-title">🎭 Personalities — switch with /mode</div>
        <div class="personality-grid">\${personalityCards}</div>
      </div>
      <div class="settings-section">
        <div class="settings-section-title">🖥️ System Info</div>
        <div class="sysinfo-grid">\${sysinfoCards}</div>
      </div>\`;
  }

  /* ── Channel configure ─────────────────────────────── */
  function toggleChannelForm(ch) {
    const el = document.getElementById('ch-form-' + ch);
    if (!el) return;
    el.classList.toggle('open');
  }

  async function saveChannelConfig(channel) {
    try {
      let payload = {};
      if (channel === 'telegram') {
        const token = document.getElementById('ch-tg-token').value.trim();
        const users = document.getElementById('ch-tg-users').value
          .split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        payload = { telegram: {} };
        if (token) payload.telegram.token = token;
        payload.telegram.allowedUsers = users;
      } else if (channel === 'discord') {
        const token = document.getElementById('ch-dc-token').value.trim();
        const users = document.getElementById('ch-dc-users').value
          .split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        payload = { discord: {} };
        if (token) payload.discord.token = token;
        payload.discord.allowedUsers = users;
      } else if (channel === 'whatsapp') {
        const enabled = document.getElementById('ch-wa-enabled').checked;
        const numbers = document.getElementById('ch-wa-numbers').value
          .split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        payload = { whatsapp: { enabled, allowedNumbers: numbers } };
      }

      const r = await fetch('/api/config/channels', {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
      toast(channel.charAt(0).toUpperCase() + channel.slice(1) + ' saved! Restart to apply.');
      const chMap = { telegram: 'tg', discord: 'dc', whatsapp: 'wa' };
      const form = document.getElementById('ch-form-' + chMap[channel]);
      if (form) form.classList.remove('open');
      loadSettings();
    } catch (e) {
      toast('Failed to save: ' + e.message, 'error');
    }
  }

  /* ── Sidebar list ──────────────────────────────────── */
  async function loadSidebar() {
    const list = document.getElementById('sidebar-list');
    list.innerHTML = '<div class="loading">Loading…</div>';
    try {
      const convos = await api('/api/conversations');
      if (!convos.length) {
        list.innerHTML = '<div class="empty"><div class="empty-icon">💬</div><div class="empty-text">No conversations yet</div></div>';
        return;
      }
      list.innerHTML = convos.map(function(c) {
        return \`<div class="item\${currentChat === c.chat_id ? ' active' : ''}"
               onclick="loadConversation('\${esc(c.chat_id)}', this)">
          <div class="item-title">\${esc(c.personality_emoji || '🤖')} \${esc(c.chat_id)}</div>
          <div class="item-meta">\${fmtShort(c.last_msg)} · \${esc(c.personality_name || 'Default')}</div>
          <div class="item-actions">
            <button class="btn-icon danger" style="font-size:11px;padding:2px 6px"
              onclick="event.stopPropagation();clearConversation('\${esc(c.chat_id)}')">🗑️ Clear</button>
          </div>
        </div>\`;
      }).join('');
    } catch (e) {
      list.innerHTML = '<div class="empty"><div class="empty-icon">❌</div><div class="empty-text">Failed to load</div></div>';
      console.error(e);
    }
  }

  /* ── Conversations ─────────────────────────────────── */
  async function loadConversation(chatId, el) {
    currentChat = chatId;
    document.querySelectorAll('.item').forEach(function(i) { i.classList.remove('active'); });
    if (el) el.classList.add('active');
    document.getElementById('content-title').textContent = chatId;
    document.getElementById('content-sub').textContent = '';
    const body = document.getElementById('content-body');
    body.innerHTML = '<div class="loading">Loading messages…</div>';
    try {
      const msgs = await api('/api/messages/' + encodeURIComponent(chatId));
      document.getElementById('content-sub').textContent = msgs.length + ' messages';
      if (!msgs.length) {
        body.innerHTML = '<div class="empty"><div class="empty-icon">💬</div><div class="empty-text">No messages</div></div>';
        return;
      }
      body.innerHTML = msgs.map(function(m) {
        return \`<div class="bubble \${m.role === 'user' ? 'user' : 'assistant'}">
          <div>
            <div class="bubble-inner">\${esc(m.content)}</div>
            <div class="bubble-meta">\${m.role === 'user' ? '👤' : '🤖'} \${fmtShort(m.created_at)}</div>
          </div>
        </div>\`;
      }).join('');
      body.scrollTop = body.scrollHeight;
    } catch (e) {
      body.innerHTML = '<div class="empty"><div class="empty-icon">❌</div><div class="empty-text">Failed to load messages</div></div>';
    }
  }

  async function clearConversation(chatId) {
    if (!confirm('Clear all messages for "' + chatId + '"? This cannot be undone.')) return;
    try {
      const r = await fetch('/api/conversations/' + encodeURIComponent(chatId), { method: 'DELETE' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
      toast('Conversation cleared: ' + chatId);
      if (currentChat === chatId) {
        currentChat = null;
        document.getElementById('content-title').textContent = 'Select a conversation';
        document.getElementById('content-sub').textContent = '';
        document.getElementById('content-body').innerHTML =
          '<div class="empty"><div class="empty-icon">💬</div><div class="empty-text">Select a conversation to view messages</div></div>';
      }
      loadStats();
      loadSidebar();
    } catch (e) {
      toast('Failed to clear conversation: ' + e.message, 'error');
    }
  }

  /* ── Memories ──────────────────────────────────────── */
  async function loadMemoriesView() {
    const body = document.getElementById('content-body');
    body.innerHTML = '<div class="loading">Loading memories…</div>';
    try {
      const mems = await api('/api/memories');
      renderMemoriesView(mems);
    } catch (e) {
      body.innerHTML = '<div class="empty"><div class="empty-icon">❌</div><div class="empty-text">Failed to load memories</div></div>';
    }
  }

  function renderMemoriesView(mems) {
    const body = document.getElementById('content-body');
    document.getElementById('content-sub').textContent = mems.length + ' total';
    const cards = mems.length === 0
      ? '<div class="empty"><div class="empty-icon">🧠</div><div class="empty-text">No memories yet. Add one below!</div></div>'
      : mems.map(function(m) {
          return \`<div class="card" id="mem-\${m.id}">
            <div class="card-body" style="width:100%">
              <div class="card-text" id="mem-text-\${m.id}">\${esc(m.fact)}</div>
              <div class="card-meta">\${fmt(m.created_at)}</div>
              <div class="edit-row" id="mem-edit-\${m.id}" style="display:none">
                <input class="inline-edit" id="mem-input-\${m.id}" value="\${esc(m.fact)}"/>
                <button class="btn-primary" style="padding:6px 14px;font-size:12px" onclick="saveMemory(\${m.id})">💾 Save</button>
                <button class="btn-secondary" onclick="cancelEditMemory(\${m.id})">✕</button>
              </div>
            </div>
            <div class="card-actions">
              <button class="btn-icon edit" onclick="startEditMemory(\${m.id})">✏️</button>
              <button class="btn-icon danger" onclick="deleteMemory(\${m.id})">🗑️</button>
            </div>
          </div>\`;
        }).join('');

    body.innerHTML = \`
      <div class="add-form">
        <div class="add-form-title">➕ Add Memory</div>
        <div class="add-form-row">
          <input class="form-input" id="new-mem-input" placeholder="e.g. My birthday is March 15" onkeydown="if(event.key==='Enter')addMemory()"/>
          <button class="btn-primary" onclick="addMemory()">Add Memory</button>
        </div>
      </div>
      \${cards}\`;
  }

  async function addMemory() {
    const inp = document.getElementById('new-mem-input');
    const content = inp.value.trim();
    if (!content) { inp.focus(); return; }
    try {
      const r = await fetch('/api/memories', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ content }) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      inp.value = '';
      loadStats();
      loadMemoriesView();
      toast('Memory added');
    } catch (e) { toast('Failed to add memory: ' + e.message, 'error'); }
  }

  function startEditMemory(id) {
    document.getElementById('mem-text-' + id).style.display = 'none';
    document.getElementById('mem-edit-' + id).style.display = 'flex';
    document.getElementById('mem-input-' + id).focus();
  }

  function cancelEditMemory(id) {
    document.getElementById('mem-edit-' + id).style.display = 'none';
    document.getElementById('mem-text-' + id).style.display = '';
  }

  async function saveMemory(id) {
    const inp = document.getElementById('mem-input-' + id);
    const content = inp.value.trim();
    if (!content) { inp.focus(); return; }
    try {
      const r = await fetch('/api/memories/' + id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ content }) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      loadMemoriesView();
      toast('Memory updated');
    } catch (e) { toast('Failed to save memory: ' + e.message, 'error'); }
  }

  async function deleteMemory(id) {
    if (!confirm('Delete this memory?')) return;
    try {
      await fetch('/api/memories/' + id, { method: 'DELETE' });
      loadStats();
      loadMemoriesView();
      toast('Memory deleted');
    } catch (e) { toast('Failed to delete memory', 'error'); }
  }

  /* ── Reminders ─────────────────────────────────────── */
  async function loadRemindersView() {
    const body = document.getElementById('content-body');
    body.innerHTML = '<div class="loading">Loading reminders…</div>';
    try {
      const rems = await api('/api/reminders');
      renderRemindersView(rems);
    } catch (e) {
      body.innerHTML = '<div class="empty"><div class="empty-icon">❌</div><div class="empty-text">Failed to load reminders</div></div>';
    }
  }

  function renderRemindersView(rems) {
    const body = document.getElementById('content-body');
    document.getElementById('content-sub').textContent = rems.length + ' total';
    const cards = rems.length === 0
      ? '<div class="empty"><div class="empty-icon">⏰</div><div class="empty-text">No reminders yet. Add one below!</div></div>'
      : rems.map(function(r) {
          return \`<div class="card" id="rem-\${r.id}">
            <div class="card-body" style="width:100%">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                <div class="card-text" id="rem-text-\${r.id}">\${esc(r.text)}</div>
                \${r.delivered
                  ? '<span class="badge-delivered">Delivered</span>'
                  : '<span class="badge-pending">Pending</span>'}
              </div>
              <div class="card-meta">⏰ <span id="rem-time-\${r.id}">\${fmt(r.remind_at)}</span> · Chat: \${esc(r.chat_id)}</div>
              <div class="edit-row" id="rem-edit-\${r.id}" style="display:none">
                <input class="inline-edit" id="rem-input-text-\${r.id}" value="\${esc(r.text)}" placeholder="Reminder text"/>
                <input class="inline-edit" type="datetime-local" id="rem-input-time-\${r.id}" value="\${toLocalInput(r.remind_at)}" style="max-width:200px"/>
                <button class="btn-primary" style="padding:6px 14px;font-size:12px" onclick="saveReminder(\${r.id})">💾 Save</button>
                <button class="btn-secondary" onclick="cancelEditReminder(\${r.id})">✕</button>
              </div>
            </div>
            <div class="card-actions">
              \${r.delivered ? '' : '<button class="btn-icon edit" onclick="startEditReminder(' + r.id + ')">✏️</button>'}
              <button class="btn-icon danger" onclick="deleteReminder(\${r.id})">🗑️</button>
            </div>
          </div>\`;
        }).join('');

    const soon = new Date(Date.now() + 3600000);
    const soonLocal = soon.toISOString().slice(0, 16);

    body.innerHTML = \`
      <div class="add-form">
        <div class="add-form-title">➕ Add Reminder</div>
        <div class="add-form-row">
          <input class="form-input" id="new-rem-text" placeholder="e.g. Take medicine" style="flex:2"/>
          <input class="form-input" type="datetime-local" id="new-rem-time" value="\${soonLocal}" style="flex:1;min-width:180px"/>
          <button class="btn-primary" onclick="addReminder()">Add Reminder</button>
        </div>
      </div>
      \${cards}\`;
  }

  function toLocalInput(ts) {
    if (!ts) return '';
    try {
      const d = new Date(ts.endsWith('Z') ? ts : ts + 'Z');
      if (isNaN(d)) return '';
      const pad = function(n) { return String(n).padStart(2, '0'); };
      return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    } catch (e) { return ''; }
  }

  async function addReminder() {
    const text = document.getElementById('new-rem-text').value.trim();
    const remind_at = document.getElementById('new-rem-time').value;
    if (!text) { document.getElementById('new-rem-text').focus(); return; }
    if (!remind_at) { document.getElementById('new-rem-time').focus(); return; }
    try {
      const r = await fetch('/api/reminders', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ text, remind_at: remind_at + ':00', chat_id: 'dashboard' })
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      loadStats();
      loadRemindersView();
      toast('Reminder added');
    } catch (e) { toast('Failed to add reminder: ' + e.message, 'error'); }
  }

  function startEditReminder(id) {
    document.getElementById('rem-edit-' + id).style.display = 'flex';
    document.getElementById('rem-input-text-' + id).focus();
  }

  function cancelEditReminder(id) {
    document.getElementById('rem-edit-' + id).style.display = 'none';
  }

  async function saveReminder(id) {
    const text = document.getElementById('rem-input-text-' + id).value.trim();
    const remind_at = document.getElementById('rem-input-time-' + id).value;
    if (!text || !remind_at) return;
    try {
      const r = await fetch('/api/reminders/' + id, {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ text, remind_at: remind_at + ':00' })
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      loadRemindersView();
      toast('Reminder updated');
    } catch (e) { toast('Failed to save reminder: ' + e.message, 'error'); }
  }

  async function deleteReminder(id) {
    if (!confirm('Delete this reminder?')) return;
    try {
      await fetch('/api/reminders/' + id, { method: 'DELETE' });
      loadStats();
      loadRemindersView();
      toast('Reminder deleted');
    } catch (e) { toast('Failed to delete reminder', 'error'); }
  }

  /* ── Settings save ─────────────────────────────────── */
  async function saveSettings() {
    const name     = (document.getElementById('cfg-name')?.value ?? '').trim();
    const language = (document.getElementById('cfg-language')?.value ?? '').trim();
    const tone     = (document.getElementById('cfg-tone')?.value ?? '').trim();
    const provider = document.getElementById('cfg-provider')?.value ?? 'anthropic';
    const customEndpoint = (document.getElementById('cfg-custom-endpoint')?.value ?? '').trim();
    // Use custom model input if the model dropdown is hidden (custom provider)
    const modelDropdown = document.getElementById('cfg-model');
    const isCustomModel = modelDropdown && modelDropdown.style.display === 'none';
    const model = isCustomModel
      ? (document.getElementById('cfg-model-custom')?.value ?? '').trim()
      : (modelDropdown?.value ?? '');
    const payload = { name, language, tone, model, provider, ...(provider === 'custom' ? { customEndpoint } : {}) };
    try {
      const r = await fetch('/api/config', {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      toast('Settings saved! Restart to apply changes.');
      const prompt = document.getElementById('restart-prompt');
      if (prompt) prompt.classList.add('show');
    } catch (e) { toast('Failed to save settings: ' + e.message, 'error'); }
  }

  /* ── Feature toggles ───────────────────────────────── */
  async function toggleFeature(key) {
    const allowedFeatures = ['webSearch','urlReader','knowledge','reminders','vision','autoSummary','teamAutoDelegate'];
    if (!allowedFeatures.includes(key)) return;
    _currentFeatures[key] = !_currentFeatures[key];
    const tog = document.getElementById('feat-toggle-' + key);
    if (tog) tog.className = 'toggle ' + (_currentFeatures[key] ? 'on' : 'off');
    try {
      const r = await fetch('/api/config', {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ features: { [key]: _currentFeatures[key] } })
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      toast(key + ' ' + (_currentFeatures[key] ? 'enabled' : 'disabled'));
    } catch (e) {
      _currentFeatures[key] = !_currentFeatures[key];
      if (tog) tog.className = 'toggle ' + (_currentFeatures[key] ? 'on' : 'off');
      toast('Failed to toggle feature: ' + e.message, 'error');
    }
  }

  async function toggleVoice() {
    _currentVoice = !_currentVoice;
    const tog = document.getElementById('feat-toggle-voice');
    if (tog) tog.className = 'toggle ' + (_currentVoice ? 'on' : 'off');
    try {
      const r = await fetch('/api/config', {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ voiceEnabled: _currentVoice })
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      toast('Voice ' + (_currentVoice ? 'enabled' : 'disabled') + '. Restart to apply.');
    } catch (e) {
      _currentVoice = !_currentVoice;
      if (tog) tog.className = 'toggle ' + (_currentVoice ? 'on' : 'off');
      toast('Failed to toggle voice: ' + e.message, 'error');
    }
  }

  async function toggleDashboard() {
    if (!_currentDashEnabled) {
      if (!confirm('Enabling dashboard — it is already running. Toggle this to disable it on next restart. Continue?')) return;
    } else {
      if (!confirm('Disabling dashboard will hide it on next restart. You will lose web access. Continue?')) return;
    }
    _currentDashEnabled = !_currentDashEnabled;
    const tog = document.getElementById('feat-toggle-dashboard');
    if (tog) tog.className = 'toggle ' + (_currentDashEnabled ? 'on' : 'off');
    try {
      const r = await fetch('/api/config', {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ dashboardEnabled: _currentDashEnabled })
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      toast('Dashboard ' + (_currentDashEnabled ? 'enabled' : 'disabled') + '. Restart to apply.', 'warning');
    } catch (e) {
      _currentDashEnabled = !_currentDashEnabled;
      if (tog) tog.className = 'toggle ' + (_currentDashEnabled ? 'on' : 'off');
      toast('Failed to toggle dashboard: ' + e.message, 'error');
    }
  }

  async function toggleAutoUpdate() {
    _currentAutoUpdate = !_currentAutoUpdate;
    const tog = document.getElementById('feat-toggle-autoUpdate');
    if (tog) tog.className = 'toggle ' + (_currentAutoUpdate ? 'on' : 'off');
    try {
      const r = await fetch('/api/config', {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ autoUpdate: _currentAutoUpdate })
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      toast('Auto-update ' + (_currentAutoUpdate ? 'enabled' : 'disabled'));
    } catch (e) {
      _currentAutoUpdate = !_currentAutoUpdate;
      if (tog) tog.className = 'toggle ' + (_currentAutoUpdate ? 'on' : 'off');
      toast('Failed to toggle auto-update: ' + e.message, 'error');
    }
  }

  /* ── Update button ─────────────────────────────────── */
  async function triggerUpdate() {
    const btn = document.getElementById('update-btn');
    const icon = document.getElementById('update-icon');
    const msg  = document.getElementById('update-msg');
    if (!btn) return;
    btn.disabled = true;
    icon.textContent = '⏳';
    msg.textContent = 'Checking…';
    try {
      const r = await fetch('/api/update', { method: 'POST' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
      if (!data.updated) {
        icon.textContent = '✅';
        msg.textContent = 'Already up to date.';
        setTimeout(function() { icon.textContent = '🔄'; msg.textContent = ''; btn.disabled = false; }, 4000);
      } else {
        icon.textContent = '🚀';
        msg.textContent = 'Updated! Restarting in 3s…';
        setTimeout(function() { location.reload(); }, 3000);
      }
    } catch (e) {
      icon.textContent = '❌';
      msg.textContent = 'Error: ' + e.message;
      setTimeout(function() { icon.textContent = '🔄'; msg.textContent = ''; btn.disabled = false; }, 5000);
    }
  }

  /* ── Restart button ────────────────────────────────── */
  async function triggerRestart() {
    const btn = document.getElementById('restart-btn');
    if (btn) btn.disabled = true;
    toast('Restarting opskrew…', 'warning');
    try {
      await fetch('/api/restart', { method: 'POST' });
      document.getElementById('update-msg').textContent = 'Restarting… reconnecting in 5s';
      setTimeout(function() { location.reload(); }, 5000);
    } catch (e) {
      toast('Restart failed: ' + e.message, 'error');
      if (btn) btn.disabled = false;
    }
  }


  /* ── Skills ─────────────────────────────────────────── */
  async function loadSkillsView() {
    const body = document.getElementById('content-body');
    body.innerHTML = '<div class="loading">Loading skills…</div>';
    try {
      const skills = await api('/api/skills');
      renderSkillsView(skills);
    } catch (e) {
      body.innerHTML = '<div class="empty"><div class="empty-icon">❌</div><div class="empty-text">Failed to load skills</div></div>';
      console.error(e);
    }
  }

  function renderSkillsView(skills) {
    const body = document.getElementById('content-body');
    document.getElementById('content-sub').textContent = skills.length + ' skill(s)';

    const cards = skills.length === 0
      ? '<div class="empty"><div class="empty-icon">🧩</div><div class="empty-text">No skills installed yet.</div></div>'
      : skills.map(function(s) {
          const toggleClass = s.enabled ? 'on' : 'off';
          const triggerText = s.triggers && s.triggers.length > 0 ? s.triggers.join(', ') : 'always-on';
          return \`<div class="card" id="skill-card-\${esc(s.id)}">
            <div style="font-size:24px;flex-shrink:0">\${esc(s.emoji)}</div>
            <div class="card-body">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                <div class="card-text" style="font-weight:600">\${esc(s.name)} <span style="font-size:11px;color:var(--muted)">[\${esc(s.id)}]</span></div>
                <div class="toggle \${toggleClass}" style="cursor:pointer" onclick="toggleSkillEnabled('\${esc(s.id)}',\${!s.enabled})" title="\${s.enabled ? 'Disable' : 'Enable'}"></div>
              </div>
              <div class="card-meta">\${esc(s.description)}</div>
              <div class="card-meta" style="margin-top:4px">Triggers: <i>\${esc(triggerText)}</i></div>
              <div id="skill-edit-area-\${esc(s.id)}" style="display:none;margin-top:10px">
                <label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;display:block;margin-bottom:4px">Edit .md content</label>
                <textarea class="form-input" id="skill-edit-content-\${esc(s.id)}" rows="12"
                  style="width:100%;resize:vertical;font-family:monospace;font-size:12px"></textarea>
                <div style="display:flex;gap:8px;margin-top:8px">
                  <button class="btn-primary" style="padding:6px 14px;font-size:12px" onclick="saveSkillContent('\${esc(s.id)}')">💾 Save</button>
                  <button class="btn-secondary" onclick="cancelSkillEdit('\${esc(s.id)}')">✕ Cancel</button>
                </div>
              </div>
            </div>
            <div class="card-actions" style="flex-direction:column;gap:6px">
              <button class="btn-icon edit" onclick="editSkill('\${esc(s.id)}')" title="Edit .md">✏️</button>
              <button class="btn-icon danger" onclick="deleteSkill('\${esc(s.id)}')">🗑️</button>
            </div>
          </div>\`;
        }).join('');

    const defaultMdTemplate = \`---
name: my-skill
description: What this skill does
emoji: 🔧
version: 1.0.0
enabled: true
triggers:
  - keyword1
  - keyword2
---

# My Skill

When the user asks about X:
- Do this
- Do that
\`;

    body.innerHTML = \`
      <div class="add-form">
        <div class="add-form-title">➕ Create Skill (.md format — AgentSkills compatible)</div>
        <div style="margin-bottom:8px">
          <label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;display:block;margin-bottom:4px">Skill content (.md with YAML frontmatter) *</label>
          <textarea class="form-input" id="sk-content" rows="14"
            style="width:100%;resize:vertical;font-family:monospace;font-size:12px">\${esc(defaultMdTemplate)}</textarea>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn-primary" onclick="createSkillFromMd()">➕ Create Skill</button>
          <span style="font-size:11px;color:var(--muted);align-self:center">The <code>name</code> field is used as the skill ID</span>
        </div>
        <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
          <div class="add-form-title" style="margin-bottom:8px">🌐 Install from URL</div>
          <div style="display:flex;gap:8px;margin-bottom:6px">
            <input class="form-input" id="sk-install-url" placeholder="https://example.com/skill.md" style="flex:1"/>
            <button class="btn-primary" onclick="installSkillFromUrl()">🔍 Scan &amp; Install</button>
          </div>
          <div id="sk-install-status" style="font-size:12px;color:var(--muted)"></div>
        </div>
      </div>
      \${cards}\`;
  }

  async function createSkillFromMd() {
    const content = (document.getElementById('sk-content').value || '').trim();
    if (!content) { toast('Skill content is required', 'error'); return; }
    try {
      const r = await fetch('/api/skills', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ content })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
      toast('Skill created: ' + (data.id || 'ok'));
      loadSkillsView();
    } catch (e) { toast('Failed to create skill: ' + e.message, 'error'); }
  }

  async function editSkill(id) {
    const area = document.getElementById('skill-edit-area-' + id);
    if (!area) return;
    const textarea = document.getElementById('skill-edit-content-' + id);
    if (area.style.display !== 'none') {
      area.style.display = 'none';
      return;
    }
    // Fetch raw content
    try {
      const r = await fetch('/api/skills/' + encodeURIComponent(id) + '/content');
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
      textarea.value = data.content || '';
      area.style.display = 'block';
      textarea.focus();
    } catch (e) { toast('Failed to load skill content: ' + e.message, 'error'); }
  }

  async function saveSkillContent(id) {
    const textarea = document.getElementById('skill-edit-content-' + id);
    if (!textarea) return;
    const content = textarea.value.trim();
    if (!content) { toast('Content cannot be empty', 'error'); return; }
    try {
      const r = await fetch('/api/skills/' + encodeURIComponent(id), {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ content })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
      toast('Skill saved: ' + id);
      loadSkillsView();
    } catch (e) { toast('Failed to save skill: ' + e.message, 'error'); }
  }

  function cancelSkillEdit(id) {
    const area = document.getElementById('skill-edit-area-' + id);
    if (area) area.style.display = 'none';
  }

  async function toggleSkillEnabled(id, enabled) {
    try {
      const r = await fetch('/api/skills/' + encodeURIComponent(id), {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ enabled })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
      toast('Skill ' + (enabled ? 'enabled' : 'disabled') + ': ' + id);
      loadSkillsView();
    } catch (e) { toast('Failed to toggle skill: ' + e.message, 'error'); }
  }

  async function deleteSkill(id) {
    if (!confirm('Delete skill "' + id + '"?')) return;
    try {
      const r = await fetch('/api/skills/' + encodeURIComponent(id), { method: 'DELETE' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
      toast('Skill deleted: ' + id);
      loadSkillsView();
    } catch (e) { toast('Failed to delete skill: ' + e.message, 'error'); }
  }

  async function installSkillFromUrl() {
    const urlInput = document.getElementById('sk-install-url');
    const statusEl = document.getElementById('sk-install-status');
    const url = (urlInput.value || '').trim();
    if (!url) { toast('URL is required', 'error'); return; }
    statusEl.textContent = '🔍 Scanning...';
    statusEl.style.color = 'var(--muted)';
    try {
      const r = await fetch('/api/skills/install', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ url })
      });
      const data = await r.json();
      if (!r.ok) {
        statusEl.textContent = '❌ Blocked: ' + (data.error || 'Unknown error');
        statusEl.style.color = 'var(--danger)';
        return;
      }
      statusEl.textContent = '✅ Safe — installed: ' + (data.name || data.id);
      statusEl.style.color = 'var(--green)';
      urlInput.value = '';
      loadSkillsView();
    } catch (e) {
      statusEl.textContent = '❌ Error: ' + e.message;
      statusEl.style.color = 'var(--danger)';
    }
  }

  /* ── Team ──────────────────────────────────────────── */
  async function loadTeamView() {
    const body = document.getElementById('content-body');
    body.innerHTML = '<div class="loading">Loading team…</div>';
    try {
      const [agents, skills] = await Promise.all([api('/api/team'), api('/api/skills')]);
      renderTeamView(agents, skills);
    } catch (e) {
      body.innerHTML = '<div class="empty"><div class="empty-icon">❌</div><div class="empty-text">Failed to load team</div></div>';
      console.error(e);
    }
  }

  function renderTeamView(agents, skills) {
    const body = document.getElementById('content-body');
    document.getElementById('content-sub').textContent = agents.length + ' agent(s)';

    const cards = agents.length === 0
      ? '<div class="empty"><div class="empty-icon">🤖</div><div class="empty-text">No agents configured yet.</div></div>'
      : agents.map(function(a) {
          const toggleClass = a.enabled ? 'on' : 'off';
          const autoText = a.autoDelegate ? 'auto-delegate' : 'manual only';
          const agentSkills = a.skills || [];

          // Build skill checkboxes
          var skillsHtml = '';
          if (skills && skills.length > 0) {
            var checkboxes = skills.map(function(s) {
              var checked = agentSkills.includes(s.id) ? ' checked' : '';
              return '<label style="display:inline-flex;align-items:center;gap:4px;margin-right:10px;margin-bottom:4px;font-size:12px;cursor:pointer">' +
                '<input type="checkbox" id="skill-chk-' + esc(a.id) + '-' + esc(s.id) + '"' + checked + '> ' +
                esc(s.emoji) + ' ' + esc(s.name) +
                '</label>';
            }).join('');
            skillsHtml = '<div class="card-meta" style="margin-top:8px">' +
              '<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">Skills</div>' +
              '<div>' + checkboxes + '</div>' +
              '<button class="btn-secondary" style="margin-top:6px;font-size:12px;padding:4px 10px" onclick="saveAgentSkills(\\\'' + esc(a.id) + '\\\')">💾 Save Skills</button>' +
              '</div>';
          }

          return \`<div class="card">
            <div style="font-size:24px;flex-shrink:0">\${esc(a.emoji)}</div>
            <div class="card-body">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                <div class="card-text" style="font-weight:600">\${esc(a.name)} <span style="font-size:11px;color:var(--muted)">[\${esc(a.id)}]</span></div>
                <div class="toggle \${toggleClass}" style="cursor:pointer" onclick="toggleAgentEnabled('\${esc(a.id)}',\${!a.enabled})" title="\${a.enabled ? 'Disable' : 'Enable'}"></div>
              </div>
              <div class="card-meta">\${esc(a.description)}</div>
              <div class="card-meta" style="margin-top:4px">
                \${a.triggerPatterns && a.triggerPatterns.length > 0 ? 'Triggers: <i>' + esc(a.triggerPatterns.join(', ')) + '</i> · ' : ''}
                <span style="color:\${a.autoDelegate ? 'var(--green)' : 'var(--muted)'}">\${esc(autoText)}</span>
              </div>
              \${skillsHtml}
              \${a.tools && a.tools.length > 0 ? '<div class="card-meta" style="margin-top:4px">Tools: ' + esc(a.tools.join(', ')) + '</div>' : ''}
            </div>
            <div class="card-actions">
              <button class="btn-secondary" onclick="viewAgentHistory('\${esc(a.id)}','\${esc(a.name)}','\${esc(a.emoji)}')">💬 History</button>
              <button class="btn-icon danger" onclick="deleteAgent('\${esc(a.id)}')">🗑️</button>
            </div>
          </div>\`;
        }).join('');

    body.innerHTML = \`
      <div class="add-form">
        <div class="add-form-title">➕ Create Agent</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
          <div>
            <label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;display:block;margin-bottom:4px">ID *</label>
            <input class="form-input" id="ag-id" placeholder="my-agent"/>
          </div>
          <div>
            <label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;display:block;margin-bottom:4px">Name *</label>
            <input class="form-input" id="ag-name" placeholder="My Agent"/>
          </div>
          <div>
            <label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;display:block;margin-bottom:4px">Emoji</label>
            <input class="form-input" id="ag-emoji" placeholder="🤖" style="max-width:80px"/>
          </div>
          <div>
            <label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;display:block;margin-bottom:4px">Description</label>
            <input class="form-input" id="ag-description" placeholder="What this agent does"/>
          </div>
        </div>
        <div style="margin-bottom:8px">
          <label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;display:block;margin-bottom:4px">Trigger Patterns (comma-separated)</label>
          <input class="form-input" id="ag-triggers" placeholder="research, investigate, look up" style="width:100%"/>
        </div>
        <div style="margin-bottom:8px">
          <label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;display:block;margin-bottom:4px">System Prompt *</label>
          <textarea class="form-input" id="ag-prompt" rows="5" placeholder="You are a specialist in X. Your job is to..." style="width:100%;resize:vertical;font-family:inherit;font-size:13px"></textarea>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn-primary" onclick="createAgent()">➕ Create Agent</button>
        </div>
      </div>
      \${cards}\`;
  }

  async function createAgent() {
    const id = (document.getElementById('ag-id').value || '').trim().replace(/\s+/g, '-').toLowerCase();
    const name = (document.getElementById('ag-name').value || '').trim();
    const emoji = (document.getElementById('ag-emoji').value || '🤖').trim();
    const description = (document.getElementById('ag-description').value || '').trim();
    const triggersRaw = (document.getElementById('ag-triggers').value || '').trim();
    const triggerPatterns = triggersRaw ? triggersRaw.split(',').map(function(t) { return t.trim(); }).filter(Boolean) : [];
    const systemPrompt = (document.getElementById('ag-prompt').value || '').trim();

    if (!id) { toast('ID is required', 'error'); return; }
    if (!name) { toast('Name is required', 'error'); return; }
    if (!systemPrompt) { toast('System prompt is required', 'error'); return; }

    try {
      const r = await fetch('/api/team', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ id, name, emoji, description, systemPrompt, triggerPatterns, skills: [], tools: [], autoDelegate: triggerPatterns.length > 0, enabled: true })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
      toast('Agent created: ' + name);
      loadTeamView();
    } catch (e) { toast('Failed to create agent: ' + e.message, 'error'); }
  }

  async function toggleAgentEnabled(id, enabled) {
    try {
      const r = await fetch('/api/team/' + encodeURIComponent(id), {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ enabled })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
      toast('Agent ' + (enabled ? 'enabled' : 'disabled') + ': ' + id);
      loadTeamView();
    } catch (e) { toast('Failed to toggle agent: ' + e.message, 'error'); }
  }

  async function deleteAgent(id) {
    if (!confirm('Delete agent "' + id + '"?')) return;
    try {
      const r = await fetch('/api/team/' + encodeURIComponent(id), { method: 'DELETE' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
      toast('Agent deleted: ' + id);
      loadTeamView();
    } catch (e) { toast('Failed to delete agent: ' + e.message, 'error'); }
  }

  async function saveAgentSkills(agentId) {
    var checkboxes = document.querySelectorAll('[id^="skill-chk-' + agentId + '-"]');
    var selectedSkills = [];
    checkboxes.forEach(function(cb) {
      if (cb.checked) {
        var skillId = cb.id.replace('skill-chk-' + agentId + '-', '');
        selectedSkills.push(skillId);
      }
    });
    try {
      var r = await fetch('/api/team/' + encodeURIComponent(agentId), {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ skills: selectedSkills })
      });
      var data = await r.json();
      if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
      toast('Skills saved for: ' + agentId);
      loadTeamView();
    } catch (e) { toast('Failed to save skills: ' + e.message, 'error'); }
  }

  async function viewAgentHistory(id, name, emoji) {
    const body = document.getElementById('content-body');
    document.getElementById('content-title').textContent = emoji + ' ' + name + ' History';
    body.innerHTML = '<div class="loading">Loading history…</div>';
    try {
      const msgs = await api('/api/team/' + encodeURIComponent(id) + '/history');
      if (!msgs.length) {
        body.innerHTML = '<div class="empty"><div class="empty-icon">💬</div><div class="empty-text">No conversation history yet</div></div>';
        return;
      }
      body.innerHTML = msgs.map(function(m) {
        return '<div class="bubble ' + (m.role === 'user' ? 'user' : 'assistant') + '">' +
          '<div><div class="bubble-inner">' + esc(m.content) + '</div>' +
          '<div class="bubble-meta">' + (m.role === 'user' ? '👤' : emoji) + ' ' + fmtShort(m.created_at) + '</div></div></div>';
      }).join('');
      body.scrollTop = body.scrollHeight;
    } catch (e) {
      body.innerHTML = '<div class="empty"><div class="empty-icon">❌</div><div class="empty-text">Failed to load history</div></div>';
    }
  }

  /* ── Init ──────────────────────────────────────────── */
  loadStats();
  loadSidebar();
  setInterval(loadStats, 30000);
</script>
</body>
</html>`;

export function startDashboard(port = 3000): void {
  const app = express();
  app.use(express.json({ limit: "10mb" }));

  app.get("/", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(DASHBOARD_HTML);
  });

  // ── Conversations ─────────────────────────────────────
  app.get("/api/conversations", (_req: Request, res: Response) => {
    try {
      const db = getDb();
      const convos = db
        .prepare(
          `SELECT m.chat_id, MAX(m.created_at) as last_msg,
            COALESCE(cs.personality, 'default') as personality
           FROM messages m
           LEFT JOIN chat_settings cs ON m.chat_id = cs.chat_id
           GROUP BY m.chat_id
           ORDER BY last_msg DESC`,
        )
        .all() as Array<{ chat_id: string; last_msg: string; personality: string }>;

      const result = convos.map((c) => {
        const p = PERSONALITIES.find((x) => x.id === c.personality) ?? PERSONALITIES[0];
        return { ...c, personality_name: p.name, personality_emoji: p.emoji };
      });
      res.json(result);
    } catch (err) {
      console.error("[dashboard] /api/conversations error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // DELETE /api/conversations/:chatId — clear all messages for a chat
  app.delete("/api/conversations/:chatId", (req: Request, res: Response) => {
    try {
      const db = getDb();
      db.prepare("DELETE FROM messages WHERE chat_id = ?").run(req.params.chatId);
      res.json({ ok: true });
    } catch (err) {
      console.error("[dashboard] DELETE /api/conversations error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/messages/:chatId", (req: Request, res: Response) => {
    try {
      const db = getDb();
      const msgs = db
        .prepare("SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC LIMIT 100")
        .all(req.params.chatId);
      res.json(msgs);
    } catch (err) {
      console.error("[dashboard] /api/messages error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Memories ─────────────────────────────────────────
  app.get("/api/memories", (_req: Request, res: Response) => {
    try {
      const db = getDb();
      const mems = db.prepare("SELECT * FROM memories ORDER BY created_at DESC").all();
      res.json(mems);
    } catch (err) {
      console.error("[dashboard] /api/memories error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/memories", (req: Request, res: Response) => {
    try {
      const { content } = req.body as { content?: string };
      if (!content || typeof content !== "string" || !content.trim()) {
        res.status(400).json({ error: "content is required" });
        return;
      }
      const db = getDb();
      db.prepare("INSERT INTO memories (fact, created_at) VALUES (?, datetime('now'))").run(content.trim());
      res.json({ ok: true });
    } catch (err) {
      console.error("[dashboard] POST /api/memories error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/memories/:id", (req: Request, res: Response) => {
    try {
      const { content } = req.body as { content?: string };
      if (!content || typeof content !== "string" || !content.trim()) {
        res.status(400).json({ error: "content is required" });
        return;
      }
      const db = getDb();
      db.prepare("UPDATE memories SET fact = ? WHERE id = ?").run(content.trim(), req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error("[dashboard] PUT /api/memories error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/memories/:id", (req: Request, res: Response) => {
    try {
      const db = getDb();
      db.prepare("DELETE FROM memories WHERE id = ?").run(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error("[dashboard] DELETE /api/memories error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Reminders ────────────────────────────────────────
  app.get("/api/reminders", (_req: Request, res: Response) => {
    try {
      const db = getDb();
      const rems = db.prepare("SELECT * FROM reminders ORDER BY remind_at ASC").all();
      res.json(rems);
    } catch (err) {
      console.error("[dashboard] /api/reminders error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/reminders", (req: Request, res: Response) => {
    try {
      const { text, remind_at, chat_id } = req.body as { text?: string; remind_at?: string; chat_id?: string };
      if (!text || typeof text !== "string" || !text.trim()) {
        res.status(400).json({ error: "text is required" });
        return;
      }
      if (!remind_at || typeof remind_at !== "string") {
        res.status(400).json({ error: "remind_at is required" });
        return;
      }
      const db = getDb();
      db.prepare("INSERT INTO reminders (text, remind_at, chat_id, delivered) VALUES (?, ?, ?, 0)").run(
        text.trim(),
        remind_at,
        (chat_id && typeof chat_id === "string" ? chat_id.trim() : null) || "dashboard",
      );
      res.json({ ok: true });
    } catch (err) {
      console.error("[dashboard] POST /api/reminders error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/reminders/:id", (req: Request, res: Response) => {
    try {
      const { text, remind_at } = req.body as { text?: string; remind_at?: string };
      if (!text || typeof text !== "string" || !text.trim()) {
        res.status(400).json({ error: "text is required" });
        return;
      }
      if (!remind_at || typeof remind_at !== "string") {
        res.status(400).json({ error: "remind_at is required" });
        return;
      }
      const db = getDb();
      db.prepare("UPDATE reminders SET text = ?, remind_at = ? WHERE id = ?").run(
        text.trim(), remind_at, req.params.id,
      );
      res.json({ ok: true });
    } catch (err) {
      console.error("[dashboard] PUT /api/reminders error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/reminders/:id", (req: Request, res: Response) => {
    try {
      const db = getDb();
      db.prepare("DELETE FROM reminders WHERE id = ?").run(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error("[dashboard] DELETE /api/reminders error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Stats ────────────────────────────────────────────
  app.get("/api/stats", (_req: Request, res: Response) => {
    try {
      const db = getDb();
      const msgCount = db.prepare("SELECT COUNT(*) as count FROM messages").get() as { count: number };
      const memCount = db.prepare("SELECT COUNT(*) as count FROM memories").get() as { count: number };
      const remCount = db
        .prepare("SELECT COUNT(*) as count FROM reminders WHERE delivered = 0")
        .get() as { count: number };
      res.json({
        messages: msgCount.count,
        memories: memCount.count,
        pendingReminders: remCount.count,
      });
    } catch (err) {
      console.error("[dashboard] /api/stats error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Usage ────────────────────────────────────────────
  app.get("/api/usage", (req: Request, res: Response) => {
    try {
      const period = (req.query.period as string) || "month";
      if (!["day", "week", "month", "all"].includes(period)) {
        res.status(400).json({ error: "Invalid period. Use: day, week, month, all" });
        return;
      }
      const stats = getUsageStats(period as "day" | "week" | "month" | "all");
      res.json(stats);
    } catch (err) {
      console.error("[dashboard] /api/usage error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/usage/daily", (_req: Request, res: Response) => {
    try {
      const daily = getDailyUsage(7);
      res.json(daily);
    } catch (err) {
      console.error("[dashboard] /api/usage/daily error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Providers ────────────────────────────────────────
  app.get("/api/providers", (_req: Request, res: Response) => {
    try {
      const providerList = Object.entries(PROVIDERS).map(([id, p]) => ({
        id,
        name: p.name,
        models: p.models,
      }));
      res.json(providerList);
    } catch (err) {
      console.error("[dashboard] /api/providers error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Config ───────────────────────────────────────────
  // GET /api/config — sanitized, no tokens/keys
  app.get("/api/config", (_req: Request, res: Response) => {
    try {
      const config = getConfig();
      const voiceOn = config.voiceEnabled !== false && !!config.groqApiKey;
      res.json({
        assistant: {
          name: config.name,
          language: config.language,
          tone: config.tone,
          model: config.model,
          provider: config.provider ?? "anthropic",
          customEndpoint: config.customEndpoint ?? "",
        },
        channels: {
          telegram: {
            enabled: !!config.telegram?.botToken,
            allowedUsers: config.telegram?.allowedUsers ?? [],
          },
          discord: {
            enabled: !!config.discord?.token,
            allowedUsers: config.discord?.allowedUsers ?? [],
          },
          whatsapp: {
            enabled: !!config.whatsapp?.enabled,
            allowedNumbers: config.whatsapp?.allowedNumbers ?? [],
          },
        },
        features: {
          ...(config.features ?? {}),
          voice: voiceOn,
        },
        dashboard: {
          enabled: config.dashboard?.enabled ?? false,
          port: config.dashboard?.port ?? 3000,
        },
        autoUpdate: config.autoUpdate !== false,
      });
    } catch (err) {
      console.error("[dashboard] /api/config error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/config — update safe config fields
  app.put("/api/config", (req: Request, res: Response) => {
    try {
      const config = getConfig();
      const updates = req.body as Record<string, unknown>;

      // Text fields
      const textFields = ["name", "language", "tone", "model", "provider", "customEndpoint"] as const;
      for (const key of textFields) {
        if (updates[key] !== undefined && typeof updates[key] === "string") {
          (config as Record<string, unknown>)[key] = (updates[key] as string).trim();
        }
      }

      // Feature flags (boolean)
      if (updates.features && typeof updates.features === "object" && updates.features !== null) {
        const featureUpdates = updates.features as Record<string, unknown>;
        const allowedFeatures = ["webSearch", "urlReader", "knowledge", "reminders", "vision", "autoSummary", "teamAutoDelegate"];
        if (!config.features) config.features = {} as typeof config.features;
        for (const fk of allowedFeatures) {
          if (typeof featureUpdates[fk] === "boolean") {
            (config.features as Record<string, unknown>)[fk] = featureUpdates[fk];
          }
        }
      }

      // Voice toggle (separate from groqApiKey)
      if (typeof updates.voiceEnabled === "boolean") {
        config.voiceEnabled = updates.voiceEnabled;
      }

      // Auto-update toggle
      if (typeof updates.autoUpdate === "boolean") {
        config.autoUpdate = updates.autoUpdate;
      }

      // Dashboard enabled toggle
      if (typeof updates.dashboardEnabled === "boolean") {
        if (!config.dashboard) config.dashboard = { enabled: false, port: 3000 };
        config.dashboard.enabled = updates.dashboardEnabled;
      }

      saveConfig(config);
      res.json({ ok: true });
    } catch (err) {
      console.error("[dashboard] PUT /api/config error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/config/channels — configure channel tokens and users
  app.put("/api/config/channels", (req: Request, res: Response) => {
    try {
      const config = getConfig();
      const { telegram, discord, whatsapp } = req.body as Record<string, Record<string, unknown>>;

      if (telegram && typeof telegram === "object") {
        if (!config.telegram) config.telegram = { allowedUsers: [] };
        if (telegram.token && typeof telegram.token === "string" && telegram.token.trim()) {
          config.telegram.botToken = telegram.token.trim();
        }
        if (Array.isArray(telegram.allowedUsers)) {
          config.telegram.allowedUsers = (telegram.allowedUsers as unknown[])
            .filter((u) => typeof u === "string" && u.trim())
            .map((u) => (u as string).trim());
        }
      }

      if (discord && typeof discord === "object") {
        if (!config.discord) config.discord = { token: "", allowedUsers: [] };
        if (discord.token && typeof discord.token === "string" && discord.token.trim()) {
          config.discord.token = discord.token.trim();
        }
        if (Array.isArray(discord.allowedUsers)) {
          config.discord.allowedUsers = (discord.allowedUsers as unknown[])
            .filter((u) => typeof u === "string" && u.trim())
            .map((u) => (u as string).trim());
        }
      }

      if (whatsapp && typeof whatsapp === "object") {
        config.whatsapp = {
          enabled: typeof whatsapp.enabled === "boolean" ? whatsapp.enabled : false,
          allowedNumbers: Array.isArray(whatsapp.allowedNumbers)
            ? (whatsapp.allowedNumbers as unknown[])
                .filter((n) => typeof n === "string" && n.trim())
                .map((n) => (n as string).trim())
            : [],
        };
      }

      saveConfig(config);
      res.json({ ok: true });
    } catch (err) {
      console.error("[dashboard] PUT /api/config/channels error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── System ───────────────────────────────────────────
  app.get("/api/system", (_req: Request, res: Response) => {
    try {
      const uptime = process.uptime();
      const mem = process.memoryUsage();
      res.json({
        version: "0.1.0",
        uptime: Math.floor(uptime),
        memory: Math.round(mem.heapUsed / 1024 / 1024),
        nodeVersion: process.version,
        platform: process.platform,
      });
    } catch (err) {
      console.error("[dashboard] /api/system error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Knowledge Base ───────────────────────────────────
  app.get("/api/knowledge", (_req: Request, res: Response) => {
    try {
      const dir = join(homedir(), ".opskrew", "knowledge");
      if (!existsSync(dir)) {
        res.json([]);
        return;
      }
      const files = readdirSync(dir).map((f) => ({
        name: f,
        size: statSync(join(dir, f)).size,
      }));
      res.json(files);
    } catch (err) {
      console.error("[dashboard] GET /api/knowledge error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/knowledge", (req: Request, res: Response) => {
    try {
      const { name, content } = req.body as { name?: string; content?: string };
      if (!name || typeof name !== "string" || !name.trim()) {
        res.status(400).json({ error: "name is required" });
        return;
      }
      if (typeof content !== "string") {
        res.status(400).json({ error: "content is required" });
        return;
      }
      // Prevent path traversal
      const safeName = name.trim().replace(/[/\\]/g, "_");
      const dir = join(homedir(), ".opskrew", "knowledge");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, safeName), content, "utf-8");
      res.json({ ok: true, name: safeName });
    } catch (err) {
      console.error("[dashboard] POST /api/knowledge error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/knowledge/:name", (req: Request, res: Response) => {
    try {
      const safeName = req.params.name.replace(/[/\\]/g, "_");
      const filePath = join(homedir(), ".opskrew", "knowledge", safeName);
      if (!existsSync(filePath)) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      unlinkSync(filePath);
      res.json({ ok: true });
    } catch (err) {
      console.error("[dashboard] DELETE /api/knowledge error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Restart ──────────────────────────────────────────
  app.post("/api/restart", (_req: Request, res: Response) => {
    try {
      res.json({ ok: true, message: "Restarting…" });
      setTimeout(() => {
        try {
          execSync("pm2 restart opskrew", { encoding: "utf-8", stdio: "pipe" });
        } catch (restartErr) {
          console.error("[dashboard] pm2 restart error:", restartErr);
        }
      }, 1000);
    } catch (err) {
      console.error("[dashboard] POST /api/restart error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ── Update ───────────────────────────────────────────
  app.get("/api/update/status", async (_req: Request, res: Response) => {
    const installDir = process.env.OPSKREW_DIR || "/opt/opskrew";
    try {
      execSync("git fetch origin main", { cwd: installDir, stdio: "pipe" });
      const local = execSync("git rev-parse HEAD", { cwd: installDir, encoding: "utf-8" }).trim();
      const remote = execSync("git rev-parse origin/main", { cwd: installDir, encoding: "utf-8" }).trim();
      const lastCommitDate = execSync("git log -1 --format=%ci", { cwd: installDir, encoding: "utf-8" }).trim();
      const checkInfo = getLastCheckInfo();
      res.json({
        currentVersion: local.slice(0, 7),
        latestVersion: remote.slice(0, 7),
        upToDate: local === remote,
        lastCommit: lastCommitDate,
        autoUpdate: getConfig().autoUpdate !== false,
        lastCheckTime: checkInfo.time ? checkInfo.time.toISOString() : null,
        lastCheckResult: checkInfo.result,
      });
    } catch (err: unknown) {
      console.error("[dashboard] GET /api/update/status error:", err);
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/update", async (_req: Request, res: Response) => {
    try {
      const installDir = process.env.OPSKREW_DIR || "/opt/opskrew";
      const pullOutput = execSync("git pull", { cwd: installDir, encoding: "utf-8" });

      if (pullOutput.includes("Already up to date")) {
        res.json({ ok: true, updated: false, message: "Already up to date" });
        return;
      }

      execSync("npm install", { cwd: installDir, encoding: "utf-8" });
      execSync("npm run build", { cwd: installDir, encoding: "utf-8" });

      setTimeout(() => {
        try {
          execSync("pm2 restart opskrew", { encoding: "utf-8" });
        } catch (restartErr) {
          console.error("[dashboard] pm2 restart error:", restartErr);
        }
      }, 1000);

      res.json({ ok: true, updated: true, message: "Updated successfully. Restarting…" });
    } catch (err: unknown) {
      console.error("[dashboard] POST /api/update error:", err);
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });


  // ── Skills API ───────────────────────────────────────
  app.get("/api/skills", (_req: Request, res: Response) => {
    try {
      const skills = loadSkills();
      res.json(skills);
    } catch (err) {
      console.error("[dashboard] GET /api/skills error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/skills/install — download from URL, scan, install
  app.post("/api/skills/install", async (req: Request, res: Response) => {
    try {
      const { url } = req.body as { url?: string };
      if (!url || typeof url !== "string") {
        res.status(400).json({ error: "url is required" });
        return;
      }

      // Remote scan via Gen Digital Trust Hub
      const remoteScan = await scanSkillRemote(url);
      if (remoteScan.status === "malicious") {
        res.status(400).json({ error: `Blocked by Gen Digital Trust Hub: ${remoteScan.message}` });
        return;
      }

      // Download + local scan (throws if scan fails)
      const { skill } = await downloadSkill(url);

      // Install
      addSkill(skill);
      res.json({ ok: true, id: skill.id, name: skill.name, remoteScan });
    } catch (err) {
      console.error("[dashboard] POST /api/skills/install error:", err);
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // GET /api/skills/:id/content — return raw .md content for editing
  app.get("/api/skills/:id/content", (req: Request, res: Response) => {
    try {
      const content = getSkillContent(req.params.id);
      if (!content) {
        res.status(404).json({ error: "Skill not found" });
        return;
      }
      res.json({ content });
    } catch (err) {
      console.error("[dashboard] GET /api/skills/:id/content error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/skills — create from raw .md content OR legacy JSON object
  app.post("/api/skills", (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;

      if (typeof body.content === "string") {
        // .md format — parse and write directly
        const skill = parseSkillMd(body.content);
        writeSkillMd(skill.id, body.content as string);
        res.json({ ok: true, id: skill.id });
      } else {
        // Legacy JSON format
        const skill = body as unknown as Skill;
        if (!skill.id || !skill.name || !skill.instructions) {
          res.status(400).json({ error: "Provide either 'content' (.md string) or id, name, instructions" });
          return;
        }
        addSkill(skill);
        res.json({ ok: true, id: skill.id });
      }
    } catch (err) {
      console.error("[dashboard] POST /api/skills error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  // PUT /api/skills/:id — toggle enabled OR update raw .md content
  app.put("/api/skills/:id", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body as Partial<Skill> & { content?: string };

      if (typeof updates.content === "string") {
        // Write raw .md content
        writeSkillMd(id, updates.content);
        res.json({ ok: true });
        return;
      }

      const skills = loadSkills();
      const existing = skills.find((s) => s.id === id);
      if (!existing) {
        res.status(404).json({ error: "Skill not found" });
        return;
      }
      // Toggle or full update
      if (typeof updates.enabled === "boolean") {
        toggleSkill(id, updates.enabled);
      } else {
        const updated: Skill = { ...existing, ...updates, id };
        addSkill(updated);
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("[dashboard] PUT /api/skills error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  app.delete("/api/skills/:id", (req: Request, res: Response) => {
    try {
      removeSkill(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error("[dashboard] DELETE /api/skills error:", err);
      res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
    }
  });

  // ── Team API ─────────────────────────────────────────
  app.get("/api/team", (_req: Request, res: Response) => {
    try {
      const agents = loadAgents();
      res.json(agents);
    } catch (err) {
      console.error("[dashboard] GET /api/team error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/team", (req: Request, res: Response) => {
    try {
      const agent = req.body as Agent;
      if (!agent.id || !agent.name || !agent.systemPrompt) {
        res.status(400).json({ error: "id, name, systemPrompt are required" });
        return;
      }
      addAgent(agent);
      res.json({ ok: true });
    } catch (err) {
      console.error("[dashboard] POST /api/team error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/team/:id", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body as Partial<Agent>;
      const agents = loadAgents();
      const existing = agents.find((a) => a.id === id);
      if (!existing) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      if (typeof updates.enabled === "boolean") {
        toggleAgent(id, updates.enabled);
      } else {
        const updated: Agent = { ...existing, ...updates, id };
        addAgent(updated);
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("[dashboard] PUT /api/team error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/team/:id", (req: Request, res: Response) => {
    try {
      removeAgent(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      console.error("[dashboard] DELETE /api/team error:", err);
      res.status(500).json({ error: String(err instanceof Error ? err.message : err) });
    }
  });

  app.get("/api/team/:id/history", (req: Request, res: Response) => {
    try {
      const db = getDb();
      // Agent history is stored with chat_id prefix "agent:{id}:{original_chat_id}"
      const agentId = req.params.id;
      const msgs = db
        .prepare(
          `SELECT * FROM messages WHERE chat_id LIKE ? ORDER BY created_at ASC LIMIT 200`
        )
        .all(`agent:${agentId}:%`);
      res.json(msgs);
    } catch (err) {
      console.error("[dashboard] GET /api/team/:id/history error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // BIND TO 127.0.0.1 ONLY — security requirement
  app.listen(port, "127.0.0.1", () => {
    console.log(`[dashboard] Running at http://127.0.0.1:${port}`);
    console.log(`[dashboard] Access via SSH tunnel: ssh -L ${port}:127.0.0.1:${port} your-vps`);
  });
}
